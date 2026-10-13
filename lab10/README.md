# Lab 10 — Voice-Controlled GDP Maps

This page extends the coordinated choropleth and Dorling cartogram from Lab 9.
It adds one-command speech recognition through the Web Speech API, visible
recognition and action feedback, country aliases, and conventional controls for
the same selection, filtering, and reset operations.

## Run locally

Serve the repository root so the page can load the shared Lab 9 data files:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/lab10/`. Speech recognition works best in a
current Chrome browser and begins only after the Start listening button is
pressed. The page itself does not store audio or transcripts.
