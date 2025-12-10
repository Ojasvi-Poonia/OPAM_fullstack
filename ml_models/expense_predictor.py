#!/usr/bin/env python3
"""
OPAM Expense Predictor with Hyperparameter Tuning

This module implements multiple ML models for expense prediction:
- Linear Regression (baseline)
- Ridge Regression with GridSearchCV
- Random Forest with RandomizedSearchCV
- Gradient Boosting with RandomizedSearchCV
- XGBoost with RandomizedSearchCV
- Ensemble model combining all predictions

Usage:
    python expense_predictor.py <database_path> [user_id]

Example:
    python expense_predictor.py ../opam.db 1
"""

import sys
import json
import warnings
import sqlite3
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import GridSearchCV, RandomizedSearchCV, TimeSeriesSplit
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_percentage_error
import joblib

try:
    from xgboost import XGBRegressor
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False

warnings.filterwarnings('ignore')


class ExpensePredictor:
    """
    ML-based expense prediction system with hyperparameter tuning.
    """

    def __init__(self):
        self.models = {}
        self.scaler = StandardScaler()
        self.feature_columns = []
        self.is_trained = False

        # Ensemble weights (can be tuned based on validation performance)
        self.ensemble_weights = {
            'linear': 0.10,
            'ridge': 0.15,
            'random_forest': 0.25,
            'gradient_boosting': 0.25,
            'xgboost': 0.25
        }

        if not HAS_XGBOOST:
            # Redistribute XGBoost weight if not available
            self.ensemble_weights['gradient_boosting'] = 0.35
            self.ensemble_weights['random_forest'] = 0.30
            del self.ensemble_weights['xgboost']

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
        Create features for expense prediction.

        Features include:
        - Temporal: year, month, day, day_of_week, is_weekend, quarter
        - Aggregated: monthly totals, category breakdowns
        - Lag features: previous 1-6 months spending
        - Rolling statistics: 2-6 month windows
        - Growth rates: month-over-month changes
        """
        # Aggregate to monthly level
        df['year_month'] = df['date'].dt.to_period('M')

        monthly = df.groupby('year_month').agg({
            'amount': ['sum', 'mean', 'count', 'std', 'max', 'min'],
            'id': 'count'
        }).reset_index()

        monthly.columns = ['year_month', 'total_amount', 'avg_amount', 'transaction_count',
                          'std_amount', 'max_amount', 'min_amount', 'num_transactions']

        # Convert period to datetime for feature extraction
        monthly['date'] = monthly['year_month'].dt.to_timestamp()

        # Temporal features
        monthly['year'] = monthly['date'].dt.year
        monthly['month'] = monthly['date'].dt.month
        monthly['quarter'] = monthly['date'].dt.quarter
        monthly['is_q4'] = (monthly['quarter'] == 4).astype(int)
        monthly['is_year_start'] = (monthly['month'] <= 2).astype(int)
        monthly['is_year_end'] = (monthly['month'] >= 11).astype(int)

        # Lag features (previous months' spending)
        for lag in range(1, 7):
            monthly[f'lag_{lag}'] = monthly['total_amount'].shift(lag)

        # Rolling statistics
        for window in [2, 3, 6]:
            monthly[f'rolling_mean_{window}'] = monthly['total_amount'].rolling(window=window).mean()
            monthly[f'rolling_std_{window}'] = monthly['total_amount'].rolling(window=window).std()
            monthly[f'rolling_max_{window}'] = monthly['total_amount'].rolling(window=window).max()
            monthly[f'rolling_min_{window}'] = monthly['total_amount'].rolling(window=window).min()

        # Month-over-month growth rate
        monthly['mom_growth'] = monthly['total_amount'].pct_change()
        monthly['mom_growth_lag1'] = monthly['mom_growth'].shift(1)

        # Average transaction size trend
        monthly['avg_txn_lag1'] = monthly['avg_amount'].shift(1)
        monthly['txn_count_lag1'] = monthly['transaction_count'].shift(1)

        # Drop rows with NaN (due to lag features)
        monthly = monthly.dropna()

        return monthly

    def prepare_data(self, monthly_df: pd.DataFrame):
        """Prepare features and target for training."""
        # Target variable
        y = monthly_df['total_amount'].values

        # Feature columns (exclude non-feature columns)
        exclude_cols = ['year_month', 'date', 'total_amount', 'num_transactions']
        self.feature_columns = [col for col in monthly_df.columns if col not in exclude_cols]

        X = monthly_df[self.feature_columns].values

        return X, y

    def train_with_hyperparameter_tuning(self, X: np.ndarray, y: np.ndarray, tune: bool = True):
        """
        Train all models with optional hyperparameter tuning.

        Args:
            X: Feature matrix
            y: Target values
            tune: Whether to perform hyperparameter tuning (slower but better)
        """
        # Use TimeSeriesSplit for proper time series cross-validation
        tscv = TimeSeriesSplit(n_splits=3)

        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        # Split data (use last 20% for testing)
        split_idx = int(len(X) * 0.8)
        X_train, X_test = X_scaled[:split_idx], X_scaled[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]

        results = {}

        # 1. Linear Regression (baseline - no tuning needed)
        print("Training Linear Regression (baseline)...")
        lr = LinearRegression()
        lr.fit(X_train, y_train)
        self.models['linear'] = lr
        results['linear'] = self._evaluate_model(lr, X_test, y_test, "Linear Regression")

        # 2. Ridge Regression with GridSearchCV
        print("Training Ridge Regression with GridSearchCV...")
        if tune:
            ridge_params = {
                'alpha': [0.001, 0.01, 0.1, 1.0, 10.0, 100.0, 1000.0]
            }
            ridge_search = GridSearchCV(
                Ridge(),
                ridge_params,
                cv=tscv,
                scoring='neg_mean_squared_error',
                n_jobs=-1
            )
            ridge_search.fit(X_train, y_train)
            self.models['ridge'] = ridge_search.best_estimator_
            print(f"  Best alpha: {ridge_search.best_params_['alpha']}")
        else:
            ridge = Ridge(alpha=1.0)
            ridge.fit(X_train, y_train)
            self.models['ridge'] = ridge
        results['ridge'] = self._evaluate_model(self.models['ridge'], X_test, y_test, "Ridge Regression")

        # 3. Random Forest with RandomizedSearchCV
        print("Training Random Forest with RandomizedSearchCV...")
        if tune:
            rf_params = {
                'n_estimators': [50, 100, 150, 200, 250],
                'max_depth': [3, 5, 7, 10, 15, 20, None],
                'min_samples_split': [2, 5, 10],
                'min_samples_leaf': [1, 2, 4],
                'max_features': ['sqrt', 'log2', None]
            }
            rf_search = RandomizedSearchCV(
                RandomForestRegressor(random_state=42),
                rf_params,
                n_iter=30,
                cv=tscv,
                scoring='neg_mean_squared_error',
                n_jobs=-1,
                random_state=42
            )
            rf_search.fit(X_train, y_train)
            self.models['random_forest'] = rf_search.best_estimator_
            print(f"  Best params: {rf_search.best_params_}")
        else:
            rf = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42)
            rf.fit(X_train, y_train)
            self.models['random_forest'] = rf
        results['random_forest'] = self._evaluate_model(self.models['random_forest'], X_test, y_test, "Random Forest")

        # 4. Gradient Boosting with RandomizedSearchCV
        print("Training Gradient Boosting with RandomizedSearchCV...")
        if tune:
            gb_params = {
                'n_estimators': [50, 100, 150, 200],
                'learning_rate': [0.01, 0.05, 0.1, 0.15, 0.2],
                'max_depth': [3, 4, 5, 6, 7],
                'min_samples_split': [2, 5, 10],
                'min_samples_leaf': [1, 2, 4],
                'subsample': [0.8, 0.9, 1.0]
            }
            gb_search = RandomizedSearchCV(
                GradientBoostingRegressor(random_state=42),
                gb_params,
                n_iter=30,
                cv=tscv,
                scoring='neg_mean_squared_error',
                n_jobs=-1,
                random_state=42
            )
            gb_search.fit(X_train, y_train)
            self.models['gradient_boosting'] = gb_search.best_estimator_
            print(f"  Best params: {gb_search.best_params_}")
        else:
            gb = GradientBoostingRegressor(n_estimators=100, learning_rate=0.1, max_depth=5, random_state=42)
            gb.fit(X_train, y_train)
            self.models['gradient_boosting'] = gb
        results['gradient_boosting'] = self._evaluate_model(self.models['gradient_boosting'], X_test, y_test, "Gradient Boosting")

        # 5. XGBoost with RandomizedSearchCV (if available)
        if HAS_XGBOOST:
            print("Training XGBoost with RandomizedSearchCV...")
            if tune:
                xgb_params = {
                    'n_estimators': [50, 100, 150, 200],
                    'learning_rate': [0.01, 0.05, 0.1, 0.15, 0.2],
                    'max_depth': [3, 4, 5, 6, 7, 8],
                    'min_child_weight': [1, 3, 5, 7],
                    'subsample': [0.7, 0.8, 0.9, 1.0],
                    'colsample_bytree': [0.7, 0.8, 0.9, 1.0],
                    'gamma': [0, 0.1, 0.2, 0.3]
                }
                xgb_search = RandomizedSearchCV(
                    XGBRegressor(random_state=42, verbosity=0),
                    xgb_params,
                    n_iter=30,
                    cv=tscv,
                    scoring='neg_mean_squared_error',
                    n_jobs=-1,
                    random_state=42
                )
                xgb_search.fit(X_train, y_train)
                self.models['xgboost'] = xgb_search.best_estimator_
                print(f"  Best params: {xgb_search.best_params_}")
            else:
                xgb = XGBRegressor(n_estimators=100, learning_rate=0.1, max_depth=6, random_state=42, verbosity=0)
                xgb.fit(X_train, y_train)
                self.models['xgboost'] = xgb
            results['xgboost'] = self._evaluate_model(self.models['xgboost'], X_test, y_test, "XGBoost")

        # Evaluate ensemble
        ensemble_pred = self._ensemble_predict(X_test)
        results['ensemble'] = {
            'rmse': np.sqrt(mean_squared_error(y_test, ensemble_pred)),
            'r2': r2_score(y_test, ensemble_pred),
            'mape': mean_absolute_percentage_error(y_test, ensemble_pred) * 100
        }
        print(f"\nEnsemble Model:")
        print(f"  RMSE: ₹{results['ensemble']['rmse']:,.2f}")
        print(f"  R² Score: {results['ensemble']['r2']:.4f}")
        print(f"  MAPE: {results['ensemble']['mape']:.2f}%")

        self.is_trained = True
        return results

    def _evaluate_model(self, model, X_test, y_test, name):
        """Evaluate a single model."""
        y_pred = model.predict(X_test)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        r2 = r2_score(y_test, y_pred)
        mape = mean_absolute_percentage_error(y_test, y_pred) * 100

        print(f"  RMSE: ₹{rmse:,.2f}, R²: {r2:.4f}, MAPE: {mape:.2f}%")

        return {'rmse': rmse, 'r2': r2, 'mape': mape}

    def _ensemble_predict(self, X_scaled):
        """Make predictions using weighted ensemble."""
        predictions = {}
        for name, model in self.models.items():
            predictions[name] = model.predict(X_scaled)

        ensemble_pred = np.zeros(len(X_scaled))
        for name, weight in self.ensemble_weights.items():
            if name in predictions:
                ensemble_pred += weight * predictions[name]

        return ensemble_pred

    def predict_next_month(self, monthly_df: pd.DataFrame) -> dict:
        """
        Predict next month's expenses using all models.

        Returns predictions from each model and the ensemble.
        """
        if not self.is_trained:
            raise ValueError("Models not trained. Call train_with_hyperparameter_tuning first.")

        # Get last row features for prediction
        last_row = monthly_df[self.feature_columns].iloc[-1:].values
        last_row_scaled = self.scaler.transform(last_row)

        predictions = {}

        for name, model in self.models.items():
            pred = model.predict(last_row_scaled)[0]
            predictions[name] = max(0, pred)  # Ensure non-negative

        # Ensemble prediction
        ensemble_pred = sum(
            self.ensemble_weights.get(name, 0) * pred
            for name, pred in predictions.items()
        )
        predictions['ensemble'] = max(0, ensemble_pred)

        # Calculate confidence based on model agreement
        pred_values = [predictions[k] for k in predictions if k != 'ensemble']
        std_dev = np.std(pred_values)
        mean_pred = np.mean(pred_values)
        cv = (std_dev / mean_pred * 100) if mean_pred > 0 else 100
        confidence = max(0, min(100, 100 - cv))

        # Determine trend
        if len(monthly_df) >= 3:
            recent_avg = monthly_df['total_amount'].tail(3).mean()
            older_avg = monthly_df['total_amount'].iloc[-6:-3].mean() if len(monthly_df) >= 6 else recent_avg
            if recent_avg > older_avg * 1.1:
                trend = 'increasing'
            elif recent_avg < older_avg * 0.9:
                trend = 'decreasing'
            else:
                trend = 'stable'
        else:
            trend = 'insufficient_data'

        return {
            'predictions': predictions,
            'confidence': round(confidence, 2),
            'trend': trend,
            'best_model': min(predictions.items(), key=lambda x: x[1] if x[0] != 'ensemble' else float('inf'))[0]
        }

    def predict_by_category(self, df: pd.DataFrame) -> list:
        """Predict next month's expenses by category."""
        predictions = []

        for category in df['category'].unique():
            cat_df = df[df['category'] == category]

            # Simple moving average for category-level prediction
            monthly_cat = cat_df.groupby(cat_df['date'].dt.to_period('M'))['amount'].sum()

            if len(monthly_cat) >= 3:
                avg = monthly_cat.tail(6).mean()
                std = monthly_cat.tail(6).std()
                trend_val = monthly_cat.tail(3).mean() - monthly_cat.iloc[-6:-3].mean() if len(monthly_cat) >= 6 else 0

                predictions.append({
                    'category': category,
                    'predicted_amount': round(avg, 2),
                    'confidence': round(max(0, 100 - (std / avg * 100)) if avg > 0 else 0, 2),
                    'trend': 'increasing' if trend_val > avg * 0.1 else 'decreasing' if trend_val < -avg * 0.1 else 'stable',
                    'avg_transaction': round(cat_df['amount'].mean(), 2),
                    'transaction_count': len(cat_df)
                })

        return sorted(predictions, key=lambda x: x['predicted_amount'], reverse=True)

    def save_models(self, path: str):
        """Save trained models to disk."""
        joblib.dump({
            'models': self.models,
            'scaler': self.scaler,
            'feature_columns': self.feature_columns,
            'ensemble_weights': self.ensemble_weights
        }, path)
        print(f"Models saved to {path}")

    def load_models(self, path: str):
        """Load trained models from disk."""
        data = joblib.load(path)
        self.models = data['models']
        self.scaler = data['scaler']
        self.feature_columns = data['feature_columns']
        self.ensemble_weights = data['ensemble_weights']
        self.is_trained = True
        print(f"Models loaded from {path}")


def main():
    """Main function to run expense prediction."""
    if len(sys.argv) < 2:
        print("Usage: python expense_predictor.py <database_path> [user_id] [--no-tune]")
        print("Example: python expense_predictor.py ../opam.db 1")
        sys.exit(1)

    db_path = sys.argv[1]
    user_id = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
    tune = '--no-tune' not in sys.argv

    print("=" * 60)
    print("OPAM Expense Predictor with Hyperparameter Tuning")
    print("=" * 60)

    predictor = ExpensePredictor()

    # Load data
    print(f"\nLoading data from {db_path}...")
    df = predictor.load_data_from_db(db_path, user_id)
    print(f"Loaded {len(df)} transactions")

    # Feature engineering
    print("\nEngineering features...")
    monthly_df = predictor.engineer_features(df)
    print(f"Created {len(monthly_df)} monthly records with {len(predictor.feature_columns) if predictor.feature_columns else 'TBD'} features")

    if len(monthly_df) < 6:
        print("\nError: Need at least 6 months of data for training")
        sys.exit(1)

    # Prepare data
    X, y = predictor.prepare_data(monthly_df)
    print(f"Features: {len(predictor.feature_columns)}")

    # Train models
    print(f"\nTraining models {'with' if tune else 'without'} hyperparameter tuning...")
    print("-" * 60)
    results = predictor.train_with_hyperparameter_tuning(X, y, tune=tune)

    # Make predictions
    print("\n" + "=" * 60)
    print("PREDICTIONS FOR NEXT MONTH")
    print("=" * 60)

    predictions = predictor.predict_next_month(monthly_df)

    print(f"\nPredicted expenses for next month:")
    for model, amount in predictions['predictions'].items():
        marker = " <-- ENSEMBLE" if model == 'ensemble' else ""
        print(f"  {model.title():20s}: ₹{amount:,.2f}{marker}")

    print(f"\nConfidence: {predictions['confidence']}%")
    print(f"Trend: {predictions['trend']}")

    # Category predictions
    print("\n" + "-" * 60)
    print("PREDICTIONS BY CATEGORY")
    print("-" * 60)

    cat_predictions = predictor.predict_by_category(df)
    for cp in cat_predictions[:5]:
        print(f"  {cp['category']:20s}: ₹{cp['predicted_amount']:,.2f} ({cp['trend']}, {cp['confidence']}% confidence)")

    # Save models
    model_path = db_path.replace('.db', '_models.joblib')
    predictor.save_models(model_path)

    # Output JSON for Node.js integration
    # Convert numpy/float32 types to native Python floats
    def convert_to_serializable(obj):
        if isinstance(obj, dict):
            return {k: convert_to_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_to_serializable(v) for v in obj]
        elif isinstance(obj, (np.floating, np.integer)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return obj

    output = {
        'status': 'success',
        'predictions': convert_to_serializable(predictions),
        'category_predictions': convert_to_serializable(cat_predictions),
        'model_results': {k: {kk: round(float(vv), 4) for kk, vv in v.items()} for k, v in results.items()},
        'models_saved': model_path
    }

    print("\n" + "=" * 60)
    print("JSON OUTPUT (for Node.js integration):")
    print("=" * 60)
    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    main()
