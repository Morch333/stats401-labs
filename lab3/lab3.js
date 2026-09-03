"use strict";

const columnConfig = [
  { key: "open_library_id", label: "Open Library ID", type: "text" },
  { key: "title", label: "Title", type: "text" },
  { key: "authors", label: "Author(s)", type: "text" },
  { key: "first_publish_year", label: "First published", type: "number", format: "year" },
  { key: "edition_count", label: "Editions", type: "number" },
  { key: "primary_language", label: "Primary language", type: "text" },
  { key: "language_count", label: "Languages", type: "number" },
  { key: "has_full_text", label: "Full text", type: "boolean" }
];

const state = {
  data: [],
  filtered: [],
  sortKey: "title",
  sortDirection: "ascending",
  query: "",
  page: 1,
  pageSize: 50
};

const table = d3.select("#data-table");
const tbody = table.select("tbody");
const resultCount = document.querySelector("#result-count");
const pageStatus = document.querySelector("#page-status");
const previousButton = document.querySelector("#previous-page");
const nextButton = document.querySelector("#next-page");

function normalizeData(rows) {
  return rows.map(row => ({
    ...row,
    first_publish_year: row.first_publish_year === "" ? null : Number(row.first_publish_year),
    edition_count: Number(row.edition_count),
    language_count: Number(row.language_count),
    has_full_text: String(row.has_full_text).toLowerCase() === "true"
  }));
}

function compareValues(a, b, type) {
  if (type === "number") return d3.ascending(a, b);
  if (type === "boolean") return d3.ascending(Number(a), Number(b));
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function formatValue(value, column) {
  if (value === null || value === "") return "—";
  if (column.type === "boolean") return value ? "Yes" : "No";
  if (column.format === "year") return String(value);
  if (column.type === "number") return d3.format(",")(value);
  return value;
}

function updateHeaderState() {
  table.selectAll("th")
    .attr("aria-sort", column =>
      column.key === state.sortKey ? state.sortDirection : "none"
    )
    .select(".sort-mark")
    .text(column => {
      if (column.key !== state.sortKey) return "↕";
      return state.sortDirection === "ascending" ? "↑" : "↓";
    });
}

function prepareRows() {
  const needle = state.query.trim().toLocaleLowerCase();
  state.filtered = needle
    ? state.data.filter(row =>
        columnConfig.some(column =>
          formatValue(row[column.key], column).toLocaleLowerCase().includes(needle)
        )
      )
    : [...state.data];

  const column = columnConfig.find(item => item.key === state.sortKey);
  const direction = state.sortDirection === "ascending" ? 1 : -1;
  state.filtered.sort((a, b) => {
    const aMissing = a[state.sortKey] === null || a[state.sortKey] === "";
    const bMissing = b[state.sortKey] === null || b[state.sortKey] === "";
    if (aMissing || bMissing) {
      if (aMissing && bMissing) return 0;
      return aMissing ? 1 : -1;
    }
    return direction * compareValues(a[state.sortKey], b[state.sortKey], column.type);
  });
}

function render() {
  prepareRows();
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const visibleRows = state.filtered.slice(start, start + state.pageSize);

  const rows = tbody.selectAll("tr").data(visibleRows, row => row.open_library_id);
  rows.exit().remove();

  const enteredRows = rows.enter().append("tr");
  enteredRows.merge(rows)
    .selectAll("td")
    .data(row => columnConfig.map(column => ({ column, value: row[column.key] })))
    .join("td")
    .attr("data-label", cell => cell.column.label)
    .text(cell => formatValue(cell.value, cell.column));

  const shownStart = state.filtered.length ? start + 1 : 0;
  const shownEnd = Math.min(start + state.pageSize, state.filtered.length);
  resultCount.textContent = state.query
    ? `${state.filtered.length.toLocaleString()} matches · showing ${shownStart}–${shownEnd}`
    : `${state.data.length.toLocaleString()} records · showing ${shownStart}–${shownEnd}`;
  pageStatus.textContent = `Page ${state.page} of ${totalPages}`;
  previousButton.disabled = state.page === 1;
  nextButton.disabled = state.page === totalPages;
  updateHeaderState();
}

function buildHeader() {
  table.select("thead")
    .append("tr")
    .selectAll("th")
    .data(columnConfig)
    .join("th")
    .attr("scope", "col")
    .attr("aria-sort", "none")
    .append("button")
    .attr("type", "button")
    .html(column => `${column.label}<span class="sort-mark" aria-hidden="true">↕</span>`)
    .on("click", (event, column) => {
      if (state.sortKey === column.key) {
        state.sortDirection = state.sortDirection === "ascending" ? "descending" : "ascending";
      } else {
        state.sortKey = column.key;
        state.sortDirection = "ascending";
      }
      state.page = 1;
      render();
    });
}

document.querySelector("#search-input").addEventListener("input", event => {
  state.query = event.target.value;
  state.page = 1;
  render();
});

document.querySelector("#page-size").addEventListener("change", event => {
  state.pageSize = Number(event.target.value);
  state.page = 1;
  render();
});

previousButton.addEventListener("click", () => {
  state.page -= 1;
  render();
  table.node().scrollIntoView({ behavior: "smooth", block: "start" });
});

nextButton.addEventListener("click", () => {
  state.page += 1;
  render();
  table.node().scrollIntoView({ behavior: "smooth", block: "start" });
});

buildHeader();

d3.csv("../data/lab3_data.csv")
  .then(rows => {
    state.data = normalizeData(rows);
    document.querySelector("#record-total").textContent = state.data.length.toLocaleString();
    render();
  })
  .catch(error => {
    document.querySelector("#table-error").hidden = false;
    document.querySelector("#table-error").textContent =
      "The dataset could not be loaded. Serve the repository through a local web server or GitHub Pages, then try again.";
    resultCount.textContent = "Dataset unavailable";
    console.error(error);
  });
