#!/usr/bin/env python3
"""
OPAM ML Runner - Runs all ML models and outputs JSON for Node.js

This script is called from Node.js to run ML predictions.

Usage:
    python run_ml.py <database_path> [user_id] [--task=<task>] [--no-tune]

Tasks:
    all         - Run all models (default)
    predict     - Run expense prediction only
    fraud       - Run fraud detection only

Example:
    python run_ml.py ../opam.db 1 --task=all
    python run_ml.py ../opam.db 1 --task=predict --no-tune
"""

import sys
import json
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from expense_predictor import ExpensePredictor
from fraud_detector import FraudDetector


def run_expense_prediction(db_path: str, user_id: int = None, tune: bool = True) -> dict:
    """Run expense prediction models."""
    try:
        predictor = ExpensePredictor()
        df = predictor.load_data_from_db(db_path, user_id)

        if len(df) < 10:
            return {'status': 'error', 'message': 'Need at least 10 transactions for prediction'}

        monthly_df = predictor.engineer_features(df)

        if len(monthly_df) < 3:
            return {'status': 'error', 'message': 'Need at least 3 months of data'}

        X, y = predictor.prepare_data(monthly_df)
        model_results = predictor.train_with_hyperparameter_tuning(X, y, tune=tune)

        predictions = predictor.predict_next_month(monthly_df)
        category_predictions = predictor.predict_by_category(df)

        # Save models
        model_path = db_path.replace('.db', '_expense_models.joblib')
        predictor.save_models(model_path)

        return {
            'status': 'success',
            'predictions': predictions,
            'category_predictions': category_predictions[:10],
            'model_results': {k: {kk: round(vv, 4) for kk, vv in v.items()} for k, v in model_results.items()},
            'models_saved': model_path
        }

    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def run_fraud_detection(db_path: str, user_id: int = None, tune: bool = True) -> dict:
    """Run fraud detection models."""
    try:
        detector = FraudDetector()
        df = detector.load_data_from_db(db_path, user_id)

        if len(df) < 10:
            return {'status': 'error', 'message': 'Need at least 10 transactions for fraud detection'}

        results, df_scored = detector.detect_fraud(df, tune=tune)

        # Save models
        model_path = db_path.replace('.db', '_fraud_models.joblib')
        detector.save_models(model_path)

        # Convert top flagged to serializable format
        results['top_flagged'] = [
            {k: (str(v) if hasattr(v, 'isoformat') else v) for k, v in txn.items()}
            for txn in results['top_flagged']
        ]

        return {
            'status': 'success',
            'results': results,
            'models_saved': model_path
        }

    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'status': 'error',
            'message': 'Usage: python run_ml.py <database_path> [user_id] [--task=<task>] [--no-tune]'
        }))
        sys.exit(1)

    db_path = sys.argv[1]
    user_id = None
    task = 'all'
    tune = True

    # Parse arguments
    for arg in sys.argv[2:]:
        if arg.startswith('--task='):
            task = arg.split('=')[1]
        elif arg == '--no-tune':
            tune = False
        elif arg.isdigit():
            user_id = int(arg)

    output = {'task': task, 'user_id': user_id, 'tuning': tune}

    if task in ['all', 'predict']:
        print("Running expense prediction...", file=sys.stderr)
        output['expense_prediction'] = run_expense_prediction(db_path, user_id, tune)

    if task in ['all', 'fraud']:
        print("Running fraud detection...", file=sys.stderr)
        output['fraud_detection'] = run_fraud_detection(db_path, user_id, tune)

    # Output JSON result
    print(json.dumps(output, indent=2, default=str))


if __name__ == '__main__':
    main()
