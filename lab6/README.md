# Lab 6 — GDP Treemaps

This lab converts the supplied flat GDP table into a nested hierarchy:

```text
World → continent → area → country
```

Run the conversion from the repository root:

```bash
python3 lab6/convert_gdp.py
```

The page renders the same JSON with `d3.treemapSquarify` and
`d3.treemapSliceDice`. In both views, country area represents GDP and color
represents GDP status. Hovering a country reveals its full hierarchical path,
GDP value, and status.

Published page: `https://morch333.github.io/stats401-labs/lab6/`
