# Lab 8 — Reading the DKU Bulletin by Meaning

This project extracts 957 cleaned passages from the official 2021–22 DKU Undergraduate Instruction Bulletin, embeds them with MiniLM, projects them with UMAP, and groups them into eight K-means topics. The D3 page coordinates a searchable semantic map with a Topic × Bulletin Part matrix.

Run `process_bulletin.py` with the official PDF to rebuild the data, then serve the repository over HTTP and open `lab8/`.
