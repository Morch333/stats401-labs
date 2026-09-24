"""Build the text-analysis files used by the Lab 8 visualization."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import pdfplumber
import umap
from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer


COURSE_HEADING = re.compile(r"^[A-Z][A-Z&]{1,11}\s+\d{2,4}[A-Z]?\b")
PART_HEADING = re.compile(r"^Part\s+\d+:")
PAGE_NUMBER = re.compile(r"^\d{1,3}$")


def clean_text(value: str) -> str:
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"\s+([,.;:!?])", r"\1", value)
    value = value.replace("–", "-").replace("—", "-")
    return value.strip()


def chunk_text(text: str, minimum: int = 35, maximum: int = 175) -> list[str]:
    words = text.split()
    if len(words) <= maximum:
        return [text] if len(words) >= minimum else []

    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[str] = []
    current: list[str] = []
    for sentence in sentences:
        candidate = " ".join(current + [sentence]).strip()
        if current and len(candidate.split()) > maximum:
            chunks.append(" ".join(current))
            current = [sentence]
        else:
            current.append(sentence)
    if current:
        chunks.append(" ".join(current))

    final: list[str] = []
    for chunk in chunks:
        chunk_words = chunk.split()
        if len(chunk_words) <= maximum:
            final.append(chunk)
        else:
            for start in range(0, len(chunk_words), maximum):
                final.append(" ".join(chunk_words[start:start + maximum]))
    return [chunk for chunk in final if len(chunk.split()) >= minimum]


def extract_passages(pdf_path: Path) -> tuple[pd.DataFrame, int]:
    records: list[dict] = []
    chapter = "Front Matter"
    section = "Introduction"
    subsection = ""

    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages[9:], start=10):
            lines = page.extract_text_lines(return_chars=True)
            paragraph_lines: list[str] = []
            paragraph_top = 0.0

            def flush() -> None:
                nonlocal paragraph_lines, paragraph_top
                if not paragraph_lines:
                    return
                text = clean_text(" ".join(paragraph_lines))
                for chunk in chunk_text(text):
                    records.append({
                        "chapter": chapter,
                        "section": section,
                        "subsection": subsection,
                        "page": page_number,
                        "text": chunk,
                    })
                paragraph_lines = []
                paragraph_top = 0.0

            previous_bottom: float | None = None
            for line in lines:
                text = clean_text(line["text"])
                if not text:
                    continue
                if line["top"] > 720 and PAGE_NUMBER.fullmatch(text):
                    continue

                max_size = max((char["size"] for char in line["chars"]), default=0)
                is_course = page_number >= 217 and bool(COURSE_HEADING.match(text))

                if max_size >= 15 or PART_HEADING.match(text):
                    flush()
                    if PART_HEADING.match(text):
                        chapter = text
                        section = "Overview"
                        subsection = ""
                    else:
                        section = text
                        subsection = ""
                    previous_bottom = line["bottom"]
                    continue

                if max_size >= 13:
                    flush()
                    section = text
                    subsection = ""
                    previous_bottom = line["bottom"]
                    continue

                if (max_size >= 11.8 and len(text) < 180 and not PAGE_NUMBER.fullmatch(text)) or is_course:
                    flush()
                    if page_number >= 217 and text.startswith("Courses with Course Subject:"):
                        subsection = text.replace("Courses with Course Subject:", "").strip()
                    elif is_course:
                        subsection = text
                    else:
                        subsection = text
                    previous_bottom = line["bottom"]
                    continue

                gap = 0 if previous_bottom is None else line["top"] - previous_bottom
                if paragraph_lines and gap > 8.0:
                    flush()
                if not paragraph_lines:
                    paragraph_top = line["top"]
                paragraph_lines.append(text)
                previous_bottom = line["bottom"]

            flush()

    raw_count = len(records)
    df = pd.DataFrame(records)
    df["text_clean"] = df["text"].map(clean_text)
    df = df.drop_duplicates(subset=["text_clean"]).copy()
    df = df[df["text_clean"].str.split().str.len() >= 35].copy()
    df["word_count"] = df["text_clean"].str.split().str.len()
    df["char_count"] = df["text_clean"].str.len()
    df.insert(0, "passage_id", [f"p{i:04d}" for i in range(1, len(df) + 1)])
    return df.reset_index(drop=True), raw_count


def characteristic_terms(texts: list[str], labels: np.ndarray, n_clusters: int) -> dict[int, list[str]]:
    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        min_df=4,
        max_df=0.85,
        max_features=8000,
    )
    matrix = vectorizer.fit_transform(texts)
    terms = np.asarray(vectorizer.get_feature_names_out())
    result: dict[int, list[str]] = {}
    for cluster in range(n_clusters):
        mean_scores = np.asarray(matrix[labels == cluster].mean(axis=0)).ravel()
        result[cluster] = terms[np.argsort(mean_scores)[-10:][::-1]].tolist()
    return result


def build_analysis(df: pd.DataFrame, output_dir: Path) -> dict:
    texts = df["text_clean"].tolist()
    model_name = "sentence-transformers/all-MiniLM-L6-v2"
    model = SentenceTransformer(model_name)
    embeddings = model.encode(
        texts,
        batch_size=48,
        show_progress_bar=True,
        normalize_embeddings=True,
    )

    reducer = umap.UMAP(
        n_neighbors=20,
        min_dist=0.15,
        n_components=2,
        metric="cosine",
        random_state=42,
    )
    coordinates = reducer.fit_transform(embeddings)

    n_clusters = 8
    clusterer = KMeans(n_clusters=n_clusters, random_state=42, n_init=20)
    labels = clusterer.fit_predict(embeddings)
    terms = characteristic_terms(texts, labels, n_clusters)

    # Labels are assigned after inspecting characteristic terms and passages.
    topic_names = {
        0: "Society, Politics & History",
        1: "Media, Arts & Storytelling",
        2: "University Programs & Degrees",
        3: "Learning, Language & Student Life",
        4: "China & Chinese Culture",
        5: "Health, Environment & Public Policy",
        6: "Science, Technology & Data",
        7: "Academic Rules, Credits & Registration",
    }

    similarity = embeddings @ embeddings.T
    np.fill_diagonal(similarity, -1)
    neighbors = np.argsort(-similarity, axis=1)[:, :5]

    output = df.copy()
    output["x"] = coordinates[:, 0].round(6)
    output["y"] = coordinates[:, 1].round(6)
    output["cluster"] = labels
    output["cluster_name"] = [topic_names[value] for value in labels]
    output["neighbors"] = ["|".join(df.iloc[indexes]["passage_id"]) for indexes in neighbors]
    output["neighbor_scores"] = ["|".join(f"{similarity[i, j]:.4f}" for j in indexes) for i, indexes in enumerate(neighbors)]
    output.to_csv(output_dir / "lab8_embedding_map.csv", index=False)

    matrix = (
        output.groupby(["chapter", "cluster", "cluster_name"], as_index=False)
        .size()
        .rename(columns={"size": "passage_count"})
    )
    totals = output.groupby("chapter").size().rename("section_total")
    matrix = matrix.join(totals, on="chapter")
    matrix["proportion"] = (matrix["passage_count"] / matrix["section_total"]).round(4)
    matrix.to_csv(output_dir / "lab8_topic_section_matrix.csv", index=False)

    tfidf = TfidfVectorizer(stop_words="english", min_df=5, max_df=.85, max_features=4000)
    tfidf_matrix = tfidf.fit_transform(texts)
    global_scores = np.asarray(tfidf_matrix.mean(axis=0)).ravel()
    names = np.asarray(tfidf.get_feature_names_out())
    top_indexes = np.argsort(global_scores)[-20:][::-1]
    pd.DataFrame({"term": names[top_indexes], "score": global_scores[top_indexes].round(6)}).to_csv(
        output_dir / "lab8_top_terms.csv", index=False
    )

    section_summary = (
        output.groupby("chapter", as_index=False)
        .agg(passage_count=("passage_id", "count"), average_words=("word_count", "mean"), topic_count=("cluster", "nunique"))
    )
    section_summary["average_words"] = section_summary["average_words"].round(1)
    section_summary.to_csv(output_dir / "lab8_section_summary.csv", index=False)

    report = {
        "model": model_name,
        "umap": {"n_neighbors": 20, "min_dist": 0.15, "metric": "cosine", "random_state": 42},
        "clustering": {"method": "KMeans", "clusters": n_clusters, "random_state": 42, "n_init": 20},
        "cluster_terms": terms,
        "cluster_sizes": {str(i): int((labels == i).sum()) for i in range(n_clusters)},
        "topic_names": {str(key): value for key, value in topic_names.items()},
    }
    (output_dir / "lab8_model_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, default=Path("data"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    df, raw_count = extract_passages(args.pdf)
    df.to_csv(args.output / "lab8_bulletin_passages.csv", index=False)
    report = build_analysis(df, args.output)

    summary = {
        "title": "Bulletin of Duke Kunshan University Undergraduate Instruction",
        "academic_year": "2021-2022",
        "source": "Official DKU admissions website",
        "source_url": "https://dku-web-admissions.s3.cn-north-1.amazonaws.com.cn/dkumain/files/V2021-22_DKU_UG_Bulletin.pdf",
        "date_accessed": "2026-09-24",
        "pages": 400,
        "raw_passages": raw_count,
        "clean_passages": len(df),
        "average_words": round(float(df["word_count"].mean()), 1),
        "formal_parts": int(df["chapter"].nunique()),
        "formal_sections": int(df[["chapter", "section"]].drop_duplicates().shape[0]),
        "model": report["model"],
    }
    (args.output / "lab8_corpus_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
