# Lab 4 — Cleaning Web Data for Visualization

This lab cleans and analyzes a balanced sample of 1,200 tweets from the
Twitter US Airline Sentiment dataset. Sentiment is estimated from tweet text
with `cardiffnlp/twitter-roberta-base-sentiment-latest`; the original crowd
labels are retained only as source metadata.

## Reproduce the data

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r lab4/requirements.txt
python lab4/clean_tweets.py
```

The first run downloads the public source CSV, NLTK resources, and the
RoBERTa model. NLTK and model files are cached under `.cache/` and are not
committed.

## Outputs

- `data/lab4_raw_tweets.csv`: the original 14,640-row source file.
- `data/lab4_clean_tweets.csv`: 1,200 cleaned and sentiment-scored tweets.
- `data/lab4_sentiment_by_airline.csv`: chart-ready counts and percentages.
- `data/lab4_top_terms.csv`: a compact TF-IDF term summary.
- `data/lab4_cleaning_summary.json`: data-quality checks and run metadata.

## Source

The dataset was originally published by CrowdFlower and is available from the
[Hugging Face dataset page](https://huggingface.co/datasets/osanseviero/twitter-airline-sentiment)
under CC BY-NC-SA 4.0. It contains 14,640 tweets about six U.S. airlines from
February 2015.
