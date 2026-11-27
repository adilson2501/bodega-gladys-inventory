"""Shared APF3 feature contract used by training and inference."""

NUMERIC_FEATURES = [
    "lag_1", "lag_2", "lag_7", "rolling_mean_7", "rolling_mean_14",
    "rolling_std_7", "sales_frequency_7", "sales_frequency_14",
    "day_of_week", "month", "stock_available_eod",
]
CATEGORICAL_FEATURES = ["product_id", "category", "unit_of_measure", "historical_demand_class"]
FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES
