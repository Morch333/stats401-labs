#!/usr/bin/env python3
"""Acquire 1,000 science-book records from the Open Library Search API.

The script uses documented API pagination, waits between requests, retries
temporary failures, validates the result, and writes a browser-ready CSV.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Any

import pandas as pd
import requests


API_URL = "https://openlibrary.org/search.json"
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data" / "lab3_data.csv"
DEFAULT_QUERY = "subject:science"
DEFAULT_TARGET = 1_000
PAGE_SIZE = 100
REQUEST_DELAY_SECONDS = 1.1
MAX_RETRIES = 3

# This educational script stays within Open Library's default one-request-per-
# second limit. No contact address is invented merely to obtain a higher limit.
HEADERS = {
    "User-Agent": "STATS401-Lab3/1.0 (educational data-acquisition exercise)",
    "Accept": "application/json",
}

OUTPUT_COLUMNS = [
    "open_library_id",
    "title",
    "authors",
    "first_publish_year",
    "edition_count",
    "primary_language",
    "language_count",
    "has_full_text",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download a paginated sample of Open Library book records."
    )
    parser.add_argument(
        "--target",
        type=int,
        default=DEFAULT_TARGET,
        help=f"number of unique records to save (default: {DEFAULT_TARGET})",
    )
    parser.add_argument(
        "--query",
        default=DEFAULT_QUERY,
        help=f"Open Library search query (default: {DEFAULT_QUERY!r})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"CSV output path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=REQUEST_DELAY_SECONDS,
        help="seconds to wait after each successful page request (default: 1.1)",
    )
    args = parser.parse_args()
    if args.target < 1:
        parser.error("--target must be at least 1")
    if args.delay < 1:
        parser.error("--delay must be at least 1 second for an unidentified client")
    return args


def request_page(
    session: requests.Session,
    query: str,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    """Request one page, retrying boundedly on network and HTTP failures."""
    params = {
        "q": query,
        "fields": (
            "key,title,author_name,first_publish_year,edition_count,"
            "language,has_fulltext"
        ),
        "sort": "key",
        "page": page,
        "limit": page_size,
    }
    last_error: requests.RequestException | None = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = session.get(API_URL, params=params, timeout=30)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or not isinstance(payload.get("docs"), list):
                raise ValueError("API response did not contain a 'docs' list")
            return payload
        except (requests.RequestException, ValueError) as error:
            last_error = error if isinstance(error, requests.RequestException) else None
            if attempt == MAX_RETRIES:
                raise RuntimeError(
                    f"Page {page} failed after {MAX_RETRIES} attempts: {error}"
                ) from error
            wait_seconds = 2 ** (attempt - 1)
            print(
                f"Page {page}, attempt {attempt} failed: {error}. "
                f"Retrying in {wait_seconds}s...",
                file=sys.stderr,
            )
            time.sleep(wait_seconds)

    raise RuntimeError(f"Page {page} failed: {last_error}")  # defensive fallback


def normalize_record(document: dict[str, Any]) -> dict[str, Any]:
    """Select stable, useful fields from one Open Library catalog record."""
    open_library_id = str(document.get("key", "")).rsplit("/", maxsplit=1)[-1]
    authors = document.get("author_name") or []
    languages = document.get("language") or []

    return {
        "open_library_id": open_library_id,
        "title": str(document.get("title") or "Untitled").strip(),
        "authors": "; ".join(str(author).strip() for author in authors if author)
        or "Unknown",
        "first_publish_year": document.get("first_publish_year"),
        "edition_count": document.get("edition_count", 0),
        "primary_language": str(languages[0]) if languages else "Unknown",
        "language_count": len(languages),
        "has_full_text": bool(document.get("has_fulltext", False)),
    }


def acquire_records(
    query: str,
    target: int,
    delay: float,
) -> tuple[list[dict[str, Any]], int]:
    """Collect at least ``target`` unique records using automatic pagination."""
    records_by_id: dict[str, dict[str, Any]] = {}
    page = 1
    available: int | None = None

    with requests.Session() as session:
        session.headers.update(HEADERS)

        while len(records_by_id) < target:
            payload = request_page(session, query, page, min(PAGE_SIZE, target))
            documents = payload["docs"]
            available = int(payload.get("numFound", payload.get("num_found", 0)))

            if not documents:
                break

            for document in documents:
                record = normalize_record(document)
                if record["open_library_id"]:
                    records_by_id[record["open_library_id"]] = record
                if len(records_by_id) == target:
                    break

            print(
                f"Downloaded page {page}: {len(documents)} returned; "
                f"{len(records_by_id):,}/{target:,} unique records collected"
            )
            page += 1

            if len(records_by_id) < target:
                time.sleep(delay)

    if len(records_by_id) < target:
        raise RuntimeError(
            f"Only {len(records_by_id):,} unique records were available; "
            f"the requested target was {target:,}."
        )
    return list(records_by_id.values())[:target], available or len(records_by_id)


def validate_frame(frame: pd.DataFrame, target: int) -> None:
    """Fail before saving if the assignment's core data requirements are unmet."""
    if len(frame) < target:
        raise ValueError(f"Expected {target:,} records but found {len(frame):,}")
    if frame["open_library_id"].duplicated().any():
        raise ValueError("Duplicate Open Library identifiers found")
    if list(frame.columns) != OUTPUT_COLUMNS:
        raise ValueError("Unexpected output columns")
    if frame["title"].eq("").any():
        raise ValueError("Blank title found")


def main() -> None:
    args = parse_args()
    records, available = acquire_records(args.query, args.target, args.delay)
    frame = pd.DataFrame(records, columns=OUTPUT_COLUMNS)
    validate_frame(frame, args.target)

    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output, index=False, encoding="utf-8")

    print(f"Saved {len(frame):,} rows x {len(frame.columns)} columns to {output}")
    print(f"The API reported {available:,} matching works for query {args.query!r}.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
