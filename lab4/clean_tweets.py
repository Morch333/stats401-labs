#!/usr/bin/env python3
"""Clean airline tweets, run TF-IDF and RoBERTa, and export Lab 4 data."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import nltk
import numpy as np
import pandas as pd
import requests
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CACHE_DIR = ROOT / ".cache"
NLTK_DIR = CACHE_DIR / "nltk_data"
HF_DIR = CACHE_DIR / "huggingface"

SOURCE_URL = (
    "https://huggingface.co/datasets/osanseviero/"
    "twitter-airline-sentiment/resolve/main/Tweets.csv"
)
SOURCE_PAGE = (
    "https://huggingface.co/datasets/osanseviero/twitter-airline-sentiment"
)
MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"

RAW_PATH = DATA_DIR / "lab4_raw_tweets.csv"
CLEAN_PATH = DATA_DIR / "lab4_clean_tweets.csv"
SUMMARY_PATH = DATA_DIR / "lab4_sentiment_by_airline.csv"
TERMS_PATH = DATA_DIR / "lab4_top_terms.csv"
REPORT_PATH = DATA_DIR / "lab4_cleaning_summary.json"

AIRLINES = [
    "American",
    "Delta",
    "Southwest",
    "US Airways",
    "United",
    "Virgin America",
]
SENTIMENT_ORDER = ["Negative", "Neutral", "Positive"]
SAMPLE_PER_AIRLINE = 200
RANDOM_SEED = 401


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create the cleaned and sentiment-scored Lab 4 datasets."
    )
    parser.add_argument(
        "--sample-per-airline",
        type=int,
        default=SAMPLE_PER_AIRLINE,
        help=f"tweets retained per airline (default: {SAMPLE_PER_AIRLINE})",
    )
    parser.add_argument(
        "--force-download",
        action="store_true",
        help="download the source CSV again even if the raw file exists",
    )
    args = parser.parse_args()
    if args.sample_per_airline < 167:
        parser.error("Use at least 167 tweets per airline to exceed 1,000 total rows")
    return args


def download_raw_data(force: bool = False) -> None:
    """Download the public source CSV once and keep it as the raw dataset."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if RAW_PATH.exists() and not force:
        print(f"Using existing raw file: {RAW_PATH}")
        return

    headers = {
        "User-Agent": "STATS401-Lab4/1.0 (educational data-cleaning project)"
    }
    temporary_path = RAW_PATH.with_suffix(".csv.part")
    try:
        with requests.get(
            SOURCE_URL,
            headers=headers,
            timeout=60,
            stream=True,
        ) as response:
            response.raise_for_status()
            with temporary_path.open("wb") as output:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        output.write(chunk)
        temporary_path.replace(RAW_PATH)
    except (requests.RequestException, OSError) as error:
        if temporary_path.exists():
            temporary_path.unlink()
        raise RuntimeError(f"Could not download the tweet dataset: {error}") from error

    print(f"Downloaded raw data to {RAW_PATH}")


def inspect_raw_data(raw: pd.DataFrame) -> dict[str, Any]:
    """Record the data-quality checks used before cleaning."""
    parsed_dates = pd.to_datetime(raw["tweet_created"], errors="coerce", utc=True)
    parsed_retweets = pd.to_numeric(raw["retweet_count"], errors="coerce")
    return {
        "source": SOURCE_PAGE,
        "license": "CC BY-NC-SA 4.0",
        "raw_rows": int(len(raw)),
        "raw_columns": int(raw.shape[1]),
        "missing_tweet_id": int(raw["tweet_id"].isna().sum()),
        "missing_text": int(raw["text"].isna().sum()),
        "missing_airline": int(raw["airline"].isna().sum()),
        "duplicate_rows": int(raw.duplicated().sum()),
        "duplicate_tweet_ids": int(raw.duplicated("tweet_id").sum()),
        "invalid_dates": int(parsed_dates.isna().sum()),
        "invalid_retweet_counts": int(
            (parsed_retweets.isna() | parsed_retweets.lt(0)).sum()
        ),
    }


def clean_structured_fields(raw: pd.DataFrame) -> pd.DataFrame:
    """Clean identifiers, dates, categories, counts, usernames, and text."""
    needed = [
        "tweet_id",
        "tweet_created",
        "name",
        "airline",
        "text",
        "retweet_count",
        "airline_sentiment",
    ]
    missing_columns = [column for column in needed if column not in raw.columns]
    if missing_columns:
        raise ValueError(f"Source data is missing columns: {missing_columns}")

    frame = raw[needed].copy()
    frame.rename(
        columns={
            "tweet_created": "created_at",
            "name": "username",
            "text": "tweet_text_raw",
            "airline_sentiment": "crowd_label",
        },
        inplace=True,
    )

    frame = frame.dropna(subset=["tweet_id", "tweet_text_raw", "airline"])
    frame = frame.drop_duplicates(subset=["tweet_id"], keep="first")
    frame["tweet_id"] = pd.to_numeric(frame["tweet_id"], errors="coerce").astype("Int64")
    frame["created_at"] = pd.to_datetime(
        frame["created_at"], errors="coerce", utc=True
    )
    frame["retweet_count"] = pd.to_numeric(
        frame["retweet_count"], errors="coerce"
    )
    frame.loc[frame["retweet_count"] < 0, "retweet_count"] = pd.NA
    frame["retweet_count"] = frame["retweet_count"].fillna(0).astype("int64")

    frame["username"] = (
        frame["username"]
        .astype("string")
        .str.strip()
        .str.replace(r"^@", "", regex=True)
        .str.lower()
    )
    frame["airline"] = frame["airline"].astype("string").str.strip()
    frame["crowd_label"] = (
        frame["crowd_label"].astype("string").str.strip().str.capitalize()
    )
    frame["tweet_text_raw"] = (
        frame["tweet_text_raw"]
        .astype("string")
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )

    frame = frame.dropna(subset=["tweet_id", "created_at"])
    frame = frame.loc[frame["tweet_text_raw"].str.len().gt(0)]
    frame = frame.loc[frame["airline"].isin(AIRLINES)]
    frame["date"] = frame["created_at"].dt.strftime("%Y-%m-%d")
    frame["hour"] = frame["created_at"].dt.hour.astype("int64")
    frame["weekday"] = frame["created_at"].dt.day_name()
    frame["tweet_length"] = frame["tweet_text_raw"].str.len().astype("int64")
    frame["word_count"] = (
        frame["tweet_text_raw"].str.findall(r"\b\w+\b").str.len().astype("int64")
    )
    return frame


def balanced_sample(frame: pd.DataFrame, per_airline: int) -> pd.DataFrame:
    """Take an equal, reproducible sample for all six airlines."""
    counts = frame["airline"].value_counts()
    too_small = counts[counts < per_airline]
    if not too_small.empty:
        raise ValueError(
            "Not enough records for balanced sampling: " + too_small.to_string()
        )

    samples = []
    for index, airline in enumerate(AIRLINES):
        airline_rows = frame.loc[frame["airline"] == airline]
        samples.append(
            airline_rows.sample(
                n=per_airline,
                random_state=RANDOM_SEED + index,
                replace=False,
            )
        )
    return (
        pd.concat(samples, ignore_index=True)
        .sort_values(["created_at", "tweet_id"], kind="stable")
        .reset_index(drop=True)
    )


def ensure_nltk_data() -> None:
    """Download the small NLTK resources used by the preprocessing pipeline."""
    NLTK_DIR.mkdir(parents=True, exist_ok=True)
    nltk.data.path.insert(0, str(NLTK_DIR))
    resources = {
        "tokenizers/punkt": "punkt",
        "tokenizers/punkt_tab": "punkt_tab",
        "corpora/stopwords": "stopwords",
        "corpora/wordnet": "wordnet",
        "corpora/omw-1.4": "omw-1.4",
    }
    for resource_path, package in resources.items():
        try:
            nltk.data.find(resource_path)
        except LookupError:
            if not nltk.download(package, download_dir=str(NLTK_DIR), quiet=True):
                raise RuntimeError(f"Could not download NLTK resource: {package}")


def normalize_for_tfidf(text: str) -> str:
    text = text.lower()
    text = re.sub(r"https?://\S+|www\.\S+", " URL ", text)
    text = re.sub(r"@\w+", " USER ", text)
    text = re.sub(r"\b\d+(?:\.\d+)?\b", " NUMBER ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def preprocess_text(frame: pd.DataFrame) -> pd.DataFrame:
    """Normalize, tokenize, remove stop words, and lemmatize tweet text."""
    ensure_nltk_data()
    english_stopwords = set(stopwords.words("english"))
    lemmatizer = WordNetLemmatizer()

    frame = frame.copy()
    frame["text_normalized"] = frame["tweet_text_raw"].map(normalize_for_tfidf)

    def clean_tokens(text: str) -> str:
        tokens = word_tokenize(text)
        cleaned = []
        for token in tokens:
            token = token.lower().lstrip("#")
            if token.isalpha() and token not in english_stopwords and len(token) > 1:
                cleaned.append(lemmatizer.lemmatize(token))
        return " ".join(cleaned)

    frame["text_clean"] = frame["text_normalized"].map(clean_tokens)
    if frame["text_clean"].eq("").any():
        frame.loc[frame["text_clean"].eq(""), "text_clean"] = "emptytweet"
    return frame


def create_term_outputs(frame: pd.DataFrame) -> tuple[int, pd.DataFrame]:
    """Create a DTM and TF-IDF matrix and return a compact term summary."""
    count_vectorizer = CountVectorizer(
        min_df=3,
        max_df=0.90,
        stop_words=["number", "url", "user"],
    )
    dtm = count_vectorizer.fit_transform(frame["text_clean"])
    terms = count_vectorizer.get_feature_names_out()
    document_frequency = np.asarray((dtm > 0).sum(axis=0)).ravel()
    total_count = np.asarray(dtm.sum(axis=0)).ravel()

    tfidf_vectorizer = TfidfVectorizer(
        vocabulary=terms,
        lowercase=False,
        norm="l2",
    )
    tfidf = tfidf_vectorizer.fit_transform(frame["text_clean"])
    total_tfidf = np.asarray(tfidf.sum(axis=0)).ravel()

    term_summary = pd.DataFrame(
        {
            "term": terms,
            "document_frequency": document_frequency,
            "total_count": total_count,
            "total_tfidf": total_tfidf,
        }
    ).sort_values(
        ["total_tfidf", "document_frequency", "term"],
        ascending=[False, False, True],
    )
    return int(dtm.shape[1]), term_summary.head(40).reset_index(drop=True)


def prepare_for_roberta(text: str) -> str:
    """Use light social-media normalization while preserving sentiment cues."""
    text = re.sub(r"@\w+", "@user", str(text))
    text = re.sub(r"https?://\S+|www\.\S+", "http", text)
    return text.strip()


def add_roberta_sentiment(frame: pd.DataFrame) -> pd.DataFrame:
    """Estimate negative, neutral, and positive probabilities for each tweet."""
    HF_DIR.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(HF_DIR))
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

    from transformers import pipeline

    print(f"Loading sentiment model: {MODEL_NAME}")
    sentiment_model = pipeline(
        "sentiment-analysis",
        model=MODEL_NAME,
        tokenizer=MODEL_NAME,
        top_k=None,
        device=-1,
    )

    frame = frame.copy()
    frame["sentiment_text"] = frame["tweet_text_raw"].map(prepare_for_roberta)
    texts = frame["sentiment_text"].tolist()
    results = sentiment_model(
        texts,
        truncation=True,
        max_length=128,
        batch_size=32,
    )

    label_map = {
        "label_0": "negative",
        "label_1": "neutral",
        "label_2": "positive",
    }

    def scores_to_dict(scores: list[dict[str, Any]]) -> dict[str, float]:
        converted: dict[str, float] = {}
        for item in scores:
            label = str(item["label"]).lower()
            label = label_map.get(label, label)
            converted[label] = float(item["score"])
        return converted

    score_dicts = [scores_to_dict(scores) for scores in results]
    for label in ("negative", "neutral", "positive"):
        frame[f"sentiment_{label}"] = [
            scores.get(label, 0.0) for scores in score_dicts
        ]
    frame["sentiment"] = [
        max(scores, key=scores.get).capitalize() for scores in score_dicts
    ]
    frame["sentiment_score"] = (
        frame["sentiment_positive"] - frame["sentiment_negative"]
    )
    return frame


def create_airline_summary(frame: pd.DataFrame) -> pd.DataFrame:
    summary = (
        frame.groupby(["airline", "sentiment"], observed=True)
        .agg(count=("tweet_id", "size"), mean_score=("sentiment_score", "mean"))
        .reset_index()
    )
    totals = frame.groupby("airline").size().rename("airline_total")
    summary = summary.merge(totals, on="airline", how="left")
    summary["percent"] = summary["count"] / summary["airline_total"] * 100

    full_index = pd.MultiIndex.from_product(
        [AIRLINES, SENTIMENT_ORDER], names=["airline", "sentiment"]
    )
    summary = summary.set_index(["airline", "sentiment"]).reindex(full_index)
    summary["count"] = summary["count"].fillna(0).astype("int64")
    summary["airline_total"] = summary["airline_total"].fillna(0).astype("int64")
    summary["percent"] = summary["percent"].fillna(0)
    return summary.reset_index()


def validate_outputs(frame: pd.DataFrame, per_airline: int) -> None:
    required = {
        "tweet_id",
        "created_at",
        "airline",
        "tweet_text_raw",
        "retweet_count",
        "sentiment",
        "sentiment_score",
    }
    if len(frame) < 1_000:
        raise ValueError(f"Final data contains only {len(frame):,} tweets")
    if not required.issubset(frame.columns):
        raise ValueError(f"Final data is missing columns: {required - set(frame.columns)}")
    if frame["tweet_id"].duplicated().any():
        raise ValueError("Duplicate tweet IDs remain in the final data")
    if frame[["tweet_id", "created_at", "airline", "tweet_text_raw"]].isna().any().any():
        raise ValueError("A required final field contains missing values")
    if set(frame["sentiment"].unique()) - set(SENTIMENT_ORDER):
        raise ValueError("Unexpected sentiment label found")
    if not frame["sentiment_score"].between(-1, 1).all():
        raise ValueError("A sentiment score is outside [-1, 1]")
    probabilities = frame[
        ["sentiment_negative", "sentiment_neutral", "sentiment_positive"]
    ].sum(axis=1)
    if not np.allclose(probabilities, 1, atol=1e-4):
        raise ValueError("Sentiment probabilities do not sum to one")
    counts = frame["airline"].value_counts()
    if not counts.eq(per_airline).all() or set(counts.index) != set(AIRLINES):
        raise ValueError("The final sample is not balanced across airlines")


def save_outputs(
    frame: pd.DataFrame,
    airline_summary: pd.DataFrame,
    term_summary: pd.DataFrame,
    report: dict[str, Any],
) -> None:
    final_columns = [
        "tweet_id",
        "created_at",
        "date",
        "hour",
        "weekday",
        "username",
        "airline",
        "tweet_text_raw",
        "text_normalized",
        "text_clean",
        "retweet_count",
        "tweet_length",
        "word_count",
        "crowd_label",
        "sentiment_negative",
        "sentiment_neutral",
        "sentiment_positive",
        "sentiment_score",
        "sentiment",
    ]
    output = frame[final_columns].copy()
    output["created_at"] = output["created_at"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    for column in [
        "sentiment_negative",
        "sentiment_neutral",
        "sentiment_positive",
        "sentiment_score",
    ]:
        output[column] = output[column].round(6)

    airline_summary = airline_summary.copy()
    airline_summary["percent"] = airline_summary["percent"].round(2)
    airline_summary["mean_score"] = airline_summary["mean_score"].round(4)
    term_summary = term_summary.copy()
    term_summary["total_tfidf"] = term_summary["total_tfidf"].round(4)

    output.to_csv(CLEAN_PATH, index=False, encoding="utf-8")
    airline_summary.to_csv(SUMMARY_PATH, index=False, encoding="utf-8")
    term_summary.to_csv(TERMS_PATH, index=False, encoding="utf-8")
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    download_raw_data(force=args.force_download)
    raw = pd.read_csv(RAW_PATH, low_memory=False)
    report = inspect_raw_data(raw)
    print(json.dumps(report, indent=2))

    cleaned = clean_structured_fields(raw)
    sampled = balanced_sample(cleaned, args.sample_per_airline)
    sampled = preprocess_text(sampled)
    vocabulary_size, term_summary = create_term_outputs(sampled)
    scored = add_roberta_sentiment(sampled)
    validate_outputs(scored, args.sample_per_airline)
    airline_summary = create_airline_summary(scored)

    report.update(
        {
            "rows_after_structured_cleaning": int(len(cleaned)),
            "final_rows": int(len(scored)),
            "sample_per_airline": int(args.sample_per_airline),
            "airlines": AIRLINES,
            "tfidf_vocabulary_size": vocabulary_size,
            "sentiment_model": MODEL_NAME,
            "sentiment_counts": {
                key: int(value)
                for key, value in scored["sentiment"].value_counts().items()
            },
        }
    )
    save_outputs(scored, airline_summary, term_summary, report)

    print(f"Saved {len(scored):,} cleaned tweets to {CLEAN_PATH}")
    print(f"Saved {len(airline_summary):,} chart rows to {SUMMARY_PATH}")
    print(f"Saved top TF-IDF terms to {TERMS_PATH}")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError, pd.errors.ParserError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
