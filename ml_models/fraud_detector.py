#!/usr/bin/env python3
"""
OPAM Fraud Detection with ML Models

This module implements ML-based fraud detection:
- Isolation Forest for anomaly detection
- Statistical anomaly detection
- Rule-based scoring combined with ML predictions
- Hyperparameter tuning with GridSearchCV

Usage:
    python fraud_detector.py <database_path> [user_id]

Example:
    python fraud_detector.py ../opam.db 1
"""

import sys
import json
import warnings
import sqlite3
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import GridSearchCV, cross_val_score
from sklearn.metrics import classification_report, precision_recall_fscore_support
import joblib

warnings.filterwarnings('ignore')


class FraudDetector:
    """
    ML-based fraud detection system with Isolation Forest and ensemble methods.
    """

    def __init__(self):
        self.isolation_forest = None
        self.scaler = StandardScaler()
        self.label_encoders = {}
        self.feature_columns = []
        self.is_trained = False
        self.contamination = 0.05  # Expected fraud rate

    def load_data_from_db(self, db_path: str, user_id: int = None) -> pd.DataFrame:
        """Load transaction data from SQLite database."""
        conn = sqlite3.connect(db_path)

        query = "SELECT * FROM transactions"
        if user_id:
            query += f" WHERE user_id = {user_id}"
        query += " ORDER BY date"

        df = pd.read_sql_query(query, conn)
        conn.close()

        if len(df) == 0:
            raise ValueError("No transaction data found")

        df['date'] = pd.to_datetime(df['date'])
        return df

    def engineer_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Create features for fraud detection.

        Features include:
        - Transaction amount statistics
        - Temporal patterns (hour, day of week, weekend)
        - Category-based anomalies
        - Merchant frequency
        - Transaction velocity
        """
        df = df.copy()

        # Temporal features
        df['hour'] = df['date'].dt.hour
        df['day_of_week'] = df['date'].dt.dayofweek
        df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
        df['is_night'] = ((df['hour'] >= 22) | (df['hour'] <= 5)).astype(int)
        df['day_of_month'] = df['date'].dt.day
        df['is_month_end'] = (df['day_of_month'] >= 25).astype(int)

        # Amount-based features
        df['log_amount'] = np.log1p(df['amount'])

        # Category encoding
        if 'category' in df.columns:
            le_cat = LabelEncoder()
            df['category_encoded'] = le_cat.fit_transform(df['category'].fillna('Unknown'))
            self.label_encoders['category'] = le_cat

        # Payment method encoding
        if 'payment_method' in df.columns:
            le_pay = LabelEncoder()
            df['payment_encoded'] = le_pay.fit_transform(df['payment_method'].fillna('Unknown'))
            self.label_encoders['payment_method'] = le_pay

        # Amount deviation from category mean
        category_stats = df.groupby('category')['amount'].agg(['mean', 'std']).reset_index()
        category_stats.columns = ['category', 'cat_mean', 'cat_std']
        df = df.merge(category_stats, on='category', how='left')
        df['cat_std'] = df['cat_std'].fillna(df['amount'].std())
        df['amount_zscore'] = (df['amount'] - df['cat_mean']) / (df['cat_std'] + 1)

        # Global amount statistics
        df['amount_percentile'] = df['amount'].rank(pct=True)
        df['is_high_value'] = (df['amount_percentile'] > 0.95).astype(int)

        # Transaction velocity (transactions per user per day)
        if 'user_id' in df.columns:
            df['date_only'] = df['date'].dt.date
            daily_counts = df.groupby(['user_id', 'date_only']).size().reset_index(name='daily_txn_count')
            df = df.merge(daily_counts, on=['user_id', 'date_only'], how='left')
            df['high_velocity'] = (df['daily_txn_count'] > 5).astype(int)
        else:
            df['daily_txn_count'] = 1
            df['high_velocity'] = 0

        # Merchant frequency (rare merchants are suspicious)
        if 'merchant' in df.columns:
            merchant_counts = df['merchant'].value_counts()
            df['merchant_frequency'] = df['merchant'].map(merchant_counts)
            df['rare_merchant'] = (df['merchant_frequency'] <= 2).astype(int)
        else:
            df['merchant_frequency'] = 1
            df['rare_merchant'] = 0

        return df

    def prepare_features(self, df: pd.DataFrame) -> np.ndarray:
        """Prepare feature matrix for ML models."""
        self.feature_columns = [
            'amount', 'log_amount', 'hour', 'day_of_week', 'is_weekend',
            'is_night', 'day_of_month', 'is_month_end', 'category_encoded',
            'payment_encoded', 'amount_zscore', 'amount_percentile',
            'is_high_value', 'daily_txn_count', 'high_velocity',
            'merchant_frequency', 'rare_merchant'
        ]

        # Only use columns that exist
        available_cols = [col for col in self.feature_columns if col in df.columns]
        self.feature_columns = available_cols

        X = df[self.feature_columns].fillna(0).values
        return X

    def train_isolation_forest(self, X: np.ndarray, tune: bool = True) -> dict:
        """
        Train Isolation Forest with optional hyperparameter tuning.

        Args:
            X: Feature matrix
            tune: Whether to perform hyperparameter tuning
        """
        print("Training Isolation Forest for anomaly detection...")

        X_scaled = self.scaler.fit_transform(X)

        if tune:
            # Grid search for best parameters
            param_grid = {
                'n_estimators': [50, 100, 150, 200],
                'max_samples': ['auto', 0.5, 0.75, 1.0],
                'contamination': [0.01, 0.02, 0.05, 0.1],
                'max_features': [0.5, 0.75, 1.0],
                'bootstrap': [True, False]
            }

            best_score = float('-inf')
            best_params = {}

            print("  Tuning hyperparameters...")
            # Manual grid search since IsolationForest doesn't have a score method
            for n_est in param_grid['n_estimators']:
                for max_samp in param_grid['max_samples']:
                    for contam in param_grid['contamination']:
                        for max_feat in param_grid['max_features']:
                            for bootstrap in param_grid['bootstrap']:
                                try:
                                    model = IsolationForest(
                                        n_estimators=n_est,
                                        max_samples=max_samp,
                                        contamination=contam,
                                        max_features=max_feat,
                                        bootstrap=bootstrap,
                                        random_state=42,
                                        n_jobs=-1
                                    )
                                    model.fit(X_scaled)

                                    # Score based on decision function variance
                                    # Higher variance = better separation
                                    scores = model.decision_function(X_scaled)
                                    score = np.std(scores)

                                    if score > best_score:
                                        best_score = score
                                        best_params = {
                                            'n_estimators': n_est,
                                            'max_samples': max_samp,
                                            'contamination': contam,
                                            'max_features': max_feat,
                                            'bootstrap': bootstrap
                                        }
                                except:
                                    continue

            print(f"  Best parameters: {best_params}")
            self.contamination = best_params.get('contamination', 0.05)

            self.isolation_forest = IsolationForest(
                **best_params,
                random_state=42,
                n_jobs=-1
            )
        else:
            self.isolation_forest = IsolationForest(
                n_estimators=100,
                contamination=self.contamination,
                random_state=42,
                n_jobs=-1
            )

        self.isolation_forest.fit(X_scaled)
        self.is_trained = True

        # Get predictions and scores
        predictions = self.isolation_forest.predict(X_scaled)
        scores = self.isolation_forest.decision_function(X_scaled)

        # -1 = anomaly, 1 = normal
        n_anomalies = (predictions == -1).sum()
        anomaly_rate = n_anomalies / len(predictions) * 100

        print(f"  Detected {n_anomalies} anomalies ({anomaly_rate:.2f}%)")

        return {
            'n_anomalies': int(n_anomalies),
            'anomaly_rate': round(anomaly_rate, 2),
            'contamination': self.contamination
        }

    def calculate_fraud_scores(self, df: pd.DataFrame, X: np.ndarray) -> pd.DataFrame:
        """
        Calculate comprehensive fraud scores combining ML and rule-based methods.
        """
        df = df.copy()
        X_scaled = self.scaler.transform(X)

        # 1. Isolation Forest anomaly score (0-100)
        if self.isolation_forest:
            # Decision function: lower = more anomalous
            decision_scores = self.isolation_forest.decision_function(X_scaled)
            # Normalize to 0-100 (inverted so higher = more suspicious)
            min_score, max_score = decision_scores.min(), decision_scores.max()
            df['ml_anomaly_score'] = 100 - ((decision_scores - min_score) / (max_score - min_score + 1e-10) * 100)
        else:
            df['ml_anomaly_score'] = 0

        # 2. Amount-based score (0-30 points)
        df['amount_score'] = df['amount_percentile'] * 30

        # 3. Time-based score (0-20 points)
        df['time_score'] = df['is_night'] * 15 + df['is_weekend'] * 5

        # 4. Velocity score (0-15 points)
        df['velocity_score'] = np.minimum(df['daily_txn_count'] * 3, 15)

        # 5. Category deviation score (0-25 points)
        df['deviation_score'] = np.minimum(np.abs(df['amount_zscore']) * 5, 25)

        # 6. Rare merchant score (0-10 points)
        df['merchant_score'] = df['rare_merchant'] * 10

        # Combined fraud score (weighted average)
        df['fraud_score'] = (
            df['ml_anomaly_score'] * 0.40 +  # ML model gets highest weight
            df['amount_score'] * 0.20 +
            df['time_score'] * 0.10 +
            df['velocity_score'] * 0.10 +
            df['deviation_score'] * 0.15 +
            df['merchant_score'] * 0.05
        )

        # Normalize to 0-100
        df['fraud_score'] = np.clip(df['fraud_score'], 0, 100)

        # Assign risk levels
        df['risk_level'] = pd.cut(
            df['fraud_score'],
            bins=[0, 25, 50, 75, 100],
            labels=['Low', 'Medium', 'High', 'Critical']
        )

        return df

    def detect_fraud(self, df: pd.DataFrame, tune: bool = True) -> dict:
        """
        Run full fraud detection pipeline.

        Returns:
            Dictionary with fraud detection results
        """
        # Engineer features
        print("\nEngineering features for fraud detection...")
        df_featured = self.engineer_features(df)

        # Prepare feature matrix
        X = self.prepare_features(df_featured)
        print(f"Created {len(self.feature_columns)} features")

        # Train Isolation Forest
        training_results = self.train_isolation_forest(X, tune=tune)

        # Calculate fraud scores
        print("\nCalculating fraud scores...")
        df_scored = self.calculate_fraud_scores(df_featured, X)

        # Get flagged transactions
        flagged = df_scored[df_scored['fraud_score'] > 50].sort_values('fraud_score', ascending=False)

        # Summary statistics
        risk_distribution = df_scored['risk_level'].value_counts().to_dict()

        results = {
            'total_transactions': len(df),
            'flagged_transactions': len(flagged),
            'risk_distribution': {str(k): int(v) for k, v in risk_distribution.items()},
            'training_results': training_results,
            'top_flagged': flagged[['id', 'amount', 'category', 'merchant', 'date', 'fraud_score', 'risk_level']].head(10).to_dict('records')
        }

        return results, df_scored

    def save_models(self, path: str):
        """Save trained models to disk."""
        joblib.dump({
            'isolation_forest': self.isolation_forest,
            'scaler': self.scaler,
            'label_encoders': self.label_encoders,
            'feature_columns': self.feature_columns,
            'contamination': self.contamination
        }, path)
        print(f"Models saved to {path}")

    def load_models(self, path: str):
        """Load trained models from disk."""
        data = joblib.load(path)
        self.isolation_forest = data['isolation_forest']
        self.scaler = data['scaler']
        self.label_encoders = data['label_encoders']
        self.feature_columns = data['feature_columns']
        self.contamination = data['contamination']
        self.is_trained = True
        print(f"Models loaded from {path}")


def main():
    """Main function to run fraud detection."""
    if len(sys.argv) < 2:
        print("Usage: python fraud_detector.py <database_path> [user_id] [--no-tune]")
        print("Example: python fraud_detector.py ../opam.db 1")
        sys.exit(1)

    db_path = sys.argv[1]
    user_id = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
    tune = '--no-tune' not in sys.argv

    print("=" * 60)
    print("OPAM Fraud Detector with Isolation Forest")
    print("=" * 60)

    detector = FraudDetector()

    # Load data
    print(f"\nLoading data from {db_path}...")
    df = detector.load_data_from_db(db_path, user_id)
    print(f"Loaded {len(df)} transactions")

    if len(df) < 10:
        print("\nError: Need at least 10 transactions for fraud detection")
        sys.exit(1)

    # Run fraud detection
    results, df_scored = detector.detect_fraud(df, tune=tune)

    # Print results
    print("\n" + "=" * 60)
    print("FRAUD DETECTION RESULTS")
    print("=" * 60)

    print(f"\nTotal Transactions: {results['total_transactions']}")
    print(f"Flagged as Suspicious: {results['flagged_transactions']}")
    print(f"Anomaly Rate: {results['training_results']['anomaly_rate']}%")

    print("\nRisk Distribution:")
    for level, count in results['risk_distribution'].items():
        print(f"  {level}: {count}")

    print("\nTop Flagged Transactions:")
    print("-" * 60)
    for txn in results['top_flagged'][:5]:
        print(f"  ID: {txn['id']}, Amount: ₹{txn['amount']:,.2f}, "
              f"Category: {txn['category']}, Score: {txn['fraud_score']:.1f}, "
              f"Risk: {txn['risk_level']}")

    # Save models
    model_path = db_path.replace('.db', '_fraud_models.joblib')
    detector.save_models(model_path)

    # Output JSON for Node.js integration
    output = {
        'status': 'success',
        'results': results,
        'models_saved': model_path
    }

    print("\n" + "=" * 60)
    print("JSON OUTPUT (for Node.js integration):")
    print("=" * 60)
    print(json.dumps(output, indent=2, default=str))


if __name__ == '__main__':
    main()
