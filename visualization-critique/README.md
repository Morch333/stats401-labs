# Visualization Critique and Redesign

STATS 401 individual project, Jiaming Cao.

- `index.html`: original figure, interactive D3 redesign, 679-word report, figure screenshots and references.
- `chart.js`: loads three external CSV files with D3; draws scales, axes, points and lines; enables group selection, keyboard/pointer details and data tables.
- `report.md`: downloadable report with the original and redesigned figures and citations.
- `data/`: unmodified source CSV files and provenance notes.
- `assets/`: public-domain original image and a screenshot of the rendered redesign.
- `vendor/`: local D3 7.9.0 and its license. No CDN is needed at runtime.

Serve the course repository over HTTP, for example `python3 -m http.server 8765`, then open `/visualization-critique/`. Opening the HTML directly with `file://` will prevent CSV fetching in many browsers.

To publish, copy this directory to the root of the existing GitHub Pages course repository and add a homepage link named **Visualization Critique and Redesign**. No build step is required. The intended public path is `https://morch333.github.io/stats401-labs/visualization-critique/`.

The page uses a responsive layout with a horizontally scrollable chart on narrow screens. Its report includes the source limitations; the chart is not a causal explanation of troop losses.
