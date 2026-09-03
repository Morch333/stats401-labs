# Lab 3 — Web Data Acquisition

This submission acquires exactly 1,000 unique science-book records from the
documented Open Library Search API and displays them in a searchable, paginated,
sortable table.

## Reproduce the dataset

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install requests pandas
python lab3/acquire_data.py
```

The script writes `data/lab3_data.csv`. It requests 100 records per API page,
waits 1.1 seconds between requests, retries boundedly, removes duplicate record
IDs, validates the output, and saves UTF-8 CSV.

## Preview the page locally

Browsers do not normally allow `d3.csv()` to load a file from a `file://` URL.
Serve the repository instead:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/lab3/>.

## Data source and responsible use

- API: <https://openlibrary.org/search.json>
- Documentation: <https://openlibrary.org/dev/docs/api/search>
- Query: `subject:science`
- Method: REST API (`requests`) with documented `page` and `limit` parameters
- Rate limit: 1.1 seconds between calls, slower than the default limit of one
  request per second
- Caching: the resulting CSV is committed and reused by the page; visitors do
  not generate further API requests
