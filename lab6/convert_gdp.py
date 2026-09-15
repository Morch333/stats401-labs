"""Convert the supplied Lab 6 GDP table into nested hierarchy JSON."""

from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT_PATH = ROOT / "data" / "lab6_assignment_gdp.csv"
OUTPUT_PATH = ROOT / "data" / "lab6_assignment_gdp.json"
REQUIRED_COLUMNS = {
    "continent",
    "area",
    "country",
    "gdp_billion_usd",
    "gdp_status",
}
VALID_STATUSES = {"Increase", "Unchanged", "Decrease"}


def read_rows(path: Path) -> list[dict[str, str]]:
    """Read and validate the flat assignment CSV."""
    with path.open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        missing = REQUIRED_COLUMNS.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing columns: {', '.join(sorted(missing))}")
        rows = list(reader)

    if not rows:
        raise ValueError("The input file is empty")

    countries: set[str] = set()
    for row in rows:
        if not all(row[column].strip() for column in REQUIRED_COLUMNS):
            raise ValueError(f"Blank value in row: {row}")
        if row["country"] in countries:
            raise ValueError(f"Duplicate country: {row['country']}")
        if row["gdp_status"] not in VALID_STATUSES:
            raise ValueError(f"Unexpected GDP status: {row['gdp_status']}")
        try:
            gdp = int(row["gdp_billion_usd"])
        except ValueError as error:
            raise ValueError(f"Invalid GDP for {row['country']}") from error
        if gdp <= 0:
            raise ValueError(f"GDP must be positive for {row['country']}")
        countries.add(row["country"])

    return rows


def build_hierarchy(rows: list[dict[str, str]]) -> dict:
    """Build World → continent → area → country nesting."""
    root = {"name": "World", "children": []}
    continent_nodes: dict[str, dict] = {}
    area_nodes: dict[tuple[str, str], dict] = {}

    for row in rows:
        continent = row["continent"]
        area = row["area"]

        if continent not in continent_nodes:
            continent_node = {"name": continent, "children": []}
            continent_nodes[continent] = continent_node
            root["children"].append(continent_node)

        area_key = (continent, area)
        if area_key not in area_nodes:
            area_node = {"name": area, "children": []}
            area_nodes[area_key] = area_node
            continent_nodes[continent]["children"].append(area_node)

        area_nodes[area_key]["children"].append(
            {
                "name": row["country"],
                "gdp": int(row["gdp_billion_usd"]),
                "status": row["gdp_status"],
            }
        )

    return root


def main() -> None:
    rows = read_rows(INPUT_PATH)
    hierarchy = build_hierarchy(rows)
    OUTPUT_PATH.write_text(
        json.dumps(hierarchy, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(rows)} countries to {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
