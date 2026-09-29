"""Keep only the Natural Earth fields needed by the Lab 9 maps."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    source = json.loads(args.input.read_text(encoding="utf-8"))
    features = []
    for feature in source["features"]:
        properties = feature["properties"]
        features.append({
            "type": "Feature",
            "properties": {
                "iso3": properties["ADM0_A3"],
                "name": properties.get("NAME_EN") or properties["NAME"],
                "continent": properties.get("CONTINENT", ""),
            },
            "geometry": feature["geometry"],
        })

    output = {"type": "FeatureCollection", "features": features}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(features)} country features to {args.output}")


if __name__ == "__main__":
    main()
