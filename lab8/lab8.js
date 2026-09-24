const topicColors = new Map([
  ["Society, Politics & History", "#b85c45"],
  ["Media, Arts & Storytelling", "#b07a2a"],
  ["University Programs & Degrees", "#557f98"],
  ["Learning, Language & Student Life", "#4f8a72"],
  ["China & Chinese Culture", "#9a5b7d"],
  ["Health, Environment & Public Policy", "#6e7f43"],
  ["Science, Technology & Data", "#5f67a1"],
  ["Academic Rules, Credits & Registration", "#8a6848"]
]);

const shortTopic = new Map([
  ["Society, Politics & History", "Society & History"],
  ["Media, Arts & Storytelling", "Media & Arts"],
  ["University Programs & Degrees", "Programs & Degrees"],
  ["Learning, Language & Student Life", "Learning & Student Life"],
  ["China & Chinese Culture", "China & Culture"],
  ["Health, Environment & Public Policy", "Health & Policy"],
  ["Science, Technology & Data", "Science & Data"],
  ["Academic Rules, Credits & Registration", "Academic Rules"]
]);

const tooltip = d3.select("#tooltip");
const mapSvg = d3.select("#embedding-chart");
const mapWidth = 920;
const mapHeight = 650;
const plotPadding = 34;

let passages = [];
let passageById = new Map();
let points;
let mapLayer;
let matrixCells;
let selectedId = null;
let selectedCell = null;
let cellFilter = null;
let currentTransform = d3.zoomIdentity;

function partLabel(value) {
  return value.replace(/^Part \d+:\s*/, "");
}

function truncate(value, length = 88) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function showTooltip(event, html) {
  tooltip.html(html).attr("hidden", null);
  moveTooltip(event);
}

function moveTooltip(event) {
  const box = tooltip.node().getBoundingClientRect();
  const left = Math.min(event.clientX + 14, window.innerWidth - box.width - 12);
  const top = Math.max(12, Math.min(event.clientY + 14, window.innerHeight - box.height - 12));
  tooltip.style("left", `${left}px`).style("top", `${top}px`);
}

function hideTooltip() {
  tooltip.attr("hidden", true);
}

function drawSectionChart(data) {
  const svg = d3.select("#section-chart");
  const width = 610;
  const margin = {top: 12, right: 45, bottom: 18, left: 220};
  const rowHeight = 31;
  const ordered = data.sort((a, b) => d3.ascending(+a.chapter.match(/\d+/)[0], +b.chapter.match(/\d+/)[0]));
  const x = d3.scaleSqrt().domain([0, d3.max(ordered, d => d.passage_count)]).range([0, width - margin.left - margin.right]);

  const rows = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)
    .selectAll("g").data(ordered).join("g").attr("transform", (_, i) => `translate(0,${i * rowHeight})`);
  rows.append("text").attr("class", "axis-label").attr("x", -10).attr("y", 14).attr("text-anchor", "end")
    .text(d => truncate(partLabel(d.chapter), 32));
  rows.append("rect").attr("x", 0).attr("y", 4).attr("height", 14).attr("width", d => x(d.passage_count))
    .attr("fill", "#826284");
  rows.append("text").attr("class", "bar-value").attr("x", d => x(d.passage_count) + 6).attr("y", 15)
    .text(d => d.passage_count);
}

function drawTermChart(data) {
  const svg = d3.select("#term-chart");
  const width = 610;
  const margin = {top: 12, right: 50, bottom: 18, left: 105};
  const selected = data.slice(0, 12);
  const rowHeight = 31;
  const x = d3.scaleLinear().domain([0, d3.max(selected, d => d.score)]).range([0, width - margin.left - margin.right]);

  const rows = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)
    .selectAll("g").data(selected).join("g").attr("transform", (_, i) => `translate(0,${i * rowHeight})`);
  rows.append("text").attr("class", "bar-label").attr("x", -10).attr("y", 15).attr("text-anchor", "end").text(d => d.term);
  rows.append("line").attr("x1", 0).attr("x2", d => x(d.score)).attr("y1", 10).attr("y2", 10).attr("stroke", "#d5cec4").attr("stroke-width", 2);
  rows.append("circle").attr("cx", d => x(d.score)).attr("cy", 10).attr("r", 5).attr("fill", "#dd6a42");
  rows.append("text").attr("class", "bar-value").attr("x", d => x(d.score) + 9).attr("y", 14).text(d => d.score.toFixed(3));
}

function setupControls() {
  const sections = Array.from(
    new Map(passages.map(d => [`${d.chapter}|||${d.section}`, {chapter: d.chapter, section: d.section}])).values()
  ).sort((a, b) => (+a.chapter.match(/\d+/)[0] - +b.chapter.match(/\d+/)[0]) || d3.ascending(a.section, b.section));
  d3.select("#section-filter").selectAll("option.chapter")
    .data(sections).join("option").attr("class", "chapter")
    .attr("value", d => `${d.chapter}|||${d.section}`)
    .text(d => `Part ${d.chapter.match(/\d+/)[0]} · ${d.section}`);
  d3.select("#topic-filter").selectAll("option.topic")
    .data(topicColors.keys()).join("option").attr("class", "topic").attr("value", d => d).text(d => d);

  const legend = d3.select("#topic-legend").selectAll("button")
    .data(topicColors).join("button").attr("type", "button")
    .html(([name, color]) => `<i style="background:${color}"></i>${name}`)
    .on("click", (_, [name]) => {
      d3.select("#topic-filter").property("value", name);
      updatePointStyles();
    });

  d3.select("#search-input").on("input", updatePointStyles);
  d3.select("#section-filter").on("change", updatePointStyles);
  d3.select("#topic-filter").on("change", updatePointStyles);
  d3.select("#reset-map").on("click", () => {
    d3.select("#search-input").property("value", "");
    d3.select("#section-filter").property("value", "all");
    d3.select("#topic-filter").property("value", "all");
    selectedId = null;
    selectedCell = null;
    cellFilter = null;
    mapSvg.transition().duration(450).call(zoom.transform, d3.zoomIdentity);
    resetDetails();
    updatePointStyles();
    updateMatrixSelection();
  });
  d3.select("#clear-cell").on("click", () => {
    selectedCell = null;
    cellFilter = null;
    updatePointStyles();
    updateMatrixSelection();
  });
}

const zoom = d3.zoom().scaleExtent([.7, 12]).on("zoom", event => {
  currentTransform = event.transform;
  if (mapLayer) mapLayer.attr("transform", event.transform);
  if (points) points.attr("stroke-width", d => d.passage_id === selectedId ? 2.5 / event.transform.k : .45 / event.transform.k);
});

function drawMap() {
  const x = d3.scaleLinear().domain(d3.extent(passages, d => d.x)).nice().range([plotPadding, mapWidth - plotPadding]);
  const y = d3.scaleLinear().domain(d3.extent(passages, d => d.y)).nice().range([mapHeight - plotPadding, plotPadding]);
  const radius = d3.scaleSqrt().domain(d3.extent(passages, d => d.word_count)).range([2.7, 7]);

  mapSvg.call(zoom).on("dblclick.zoom", null);
  mapLayer = mapSvg.append("g");
  points = mapLayer.selectAll("circle")
    .data(passages, d => d.passage_id)
    .join("circle")
    .attr("class", "point")
    .attr("cx", d => x(d.x))
    .attr("cy", d => y(d.y))
    .attr("r", d => radius(d.word_count))
    .attr("fill", d => topicColors.get(d.cluster_name))
    .attr("fill-opacity", .74)
    .attr("stroke", "#fffdf8")
    .attr("stroke-width", .45)
    .attr("tabindex", 0)
    .attr("role", "graphics-symbol")
    .attr("aria-label", d => `${d.passage_id}, ${d.cluster_name}, page ${d.page}`)
    .on("pointerenter", (event, d) => showTooltip(event, `<strong>${d.passage_id} · page ${d.page}</strong><span>${d.cluster_name}</span><span>${truncate(d.text_clean, 150)}</span>`))
    .on("pointermove", moveTooltip)
    .on("pointerleave", hideTooltip)
    .on("click", (_, d) => selectPassage(d.passage_id));
}

function updatePointStyles() {
  const query = d3.select("#search-input").property("value").trim().toLowerCase();
  const sectionValue = d3.select("#section-filter").property("value");
  const [filterChapter, filterSection] = sectionValue === "all" ? [null, null] : sectionValue.split("|||");
  const topic = d3.select("#topic-filter").property("value");
  const selected = selectedId ? passageById.get(selectedId) : null;
  const neighborIds = new Set(selected ? selected.neighbors : []);

  let matches = 0;
  points
    .attr("opacity", d => {
      const filterMatch = (!filterChapter || (d.chapter === filterChapter && d.section === filterSection)) && (topic === "all" || d.cluster_name === topic);
      const searchMatch = !query || d.text_clean.toLowerCase().includes(query);
      const cellMatch = !cellFilter || (d.chapter === cellFilter.chapter && d.cluster === cellFilter.cluster);
      const match = filterMatch && searchMatch && cellMatch;
      if (match) matches += 1;
      if (d.passage_id === selectedId) return 1;
      if (neighborIds.has(d.passage_id)) return .98;
      return match ? .82 : .045;
    })
    .attr("stroke", d => d.passage_id === selectedId ? "#1e1721" : neighborIds.has(d.passage_id) ? "#dd6a42" : "#fffdf8")
    .attr("stroke-width", d => d.passage_id === selectedId ? 2.5 / currentTransform.k : neighborIds.has(d.passage_id) ? 1.8 / currentTransform.k : .45 / currentTransform.k)
    .attr("r", d => d.passage_id === selectedId ? 9 / Math.sqrt(currentTransform.k) : d.radius || null);

  // Restore data-driven radii after the selected-point override.
  const radius = d3.scaleSqrt().domain(d3.extent(passages, d => d.word_count)).range([2.7, 7]);
  points.filter(d => d.passage_id !== selectedId).attr("r", d => radius(d.word_count));
  d3.select("#result-count").text(`${matches.toLocaleString()} passage${matches === 1 ? "" : "s"} shown`);
}

function resetDetails() {
  d3.select("#detail-panel").html(`<p class="detail-kicker">Passage details</p><h3>Select a point</h3><p>Click any passage to read it, locate it in the bulletin, and see its five nearest semantic neighbors.</p>`);
}

function selectPassage(id) {
  const d = passageById.get(id);
  if (!d) return;
  selectedId = id;
  selectedCell = {chapter: d.chapter, cluster: d.cluster};
  cellFilter = null;
  const detail = d3.select("#detail-panel");
  detail.html("");
  detail.append("p").attr("class", "detail-kicker").text("Passage details");
  detail.append("h3").text(`${d.passage_id} · ${d.section}`);
  const meta = detail.append("div").attr("class", "passage-meta");
  meta.append("span").text(`Page ${d.page}`);
  meta.append("span").text(`${d.word_count} words`);
  meta.append("span").style("color", topicColors.get(d.cluster_name)).text(d.cluster_name);
  detail.append("div").attr("class", "passage-text").text(d.text_clean);
  detail.append("h4").attr("class", "neighbors-title").text("Nearest semantic neighbors");
  const list = detail.append("div").attr("class", "neighbor-list");
  list.selectAll("button").data(d.neighbors.map((id, i) => ({...passageById.get(id), score: d.neighbor_scores[i]})))
    .join("button").attr("class", "neighbor-button").attr("type", "button")
    .html(n => `<strong>${n.passage_id} · similarity ${n.score.toFixed(3)}</strong><span>Page ${n.page} · ${truncate(partLabel(n.chapter), 34)}</span><span>${truncate(n.text_clean, 76)}</span>`)
    .on("click", (_, n) => selectPassage(n.passage_id));
  updatePointStyles();
  updateMatrixSelection();
}

function drawMatrix(matrixData) {
  const svg = d3.select("#matrix-chart");
  const width = 1180;
  const margin = {top: 155, right: 55, bottom: 58, left: 280};
  const chapters = Array.from(new Set(passages.map(d => d.chapter))).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  const topics = Array.from(topicColors.keys());
  const x = d3.scaleBand().domain(topics).range([margin.left, width - margin.right]).padding(.06);
  const y = d3.scaleBand().domain(chapters).range([margin.top, 535]).padding(.08);
  const color = d3.scaleSequential(d3.interpolateRgb("#f1ede5", "#5d3d63")).domain([0, d3.max(matrixData, d => d.proportion)]);
  const lookup = new Map(matrixData.map(d => [`${d.chapter}|${d.cluster}`, d]));
  const cells = chapters.flatMap(chapter => topics.map((topic, cluster) => {
    const found = lookup.get(`${chapter}|${cluster}`);
    return {chapter, topic, cluster, passage_count: found?.passage_count || 0, proportion: found?.proportion || 0, section_total: found?.section_total || passages.filter(d => d.chapter === chapter).length};
  }));

  svg.append("g").selectAll("text").data(chapters).join("text")
    .attr("class", "matrix-label").attr("x", margin.left - 12).attr("y", d => y(d) + y.bandwidth() / 2 + 4).attr("text-anchor", "end")
    .text(d => truncate(partLabel(d), 40));

  svg.append("g").selectAll("text").data(topics).join("text")
    .attr("class", "matrix-column")
    .attr("transform", d => `translate(${x(d) + x.bandwidth() / 2},${margin.top - 14}) rotate(-42)`)
    .attr("text-anchor", "start").text(d => shortTopic.get(d));

  const groups = svg.append("g").selectAll("g").data(cells).join("g");
  matrixCells = groups.append("rect")
    .attr("class", "matrix-cell")
    .attr("x", d => x(d.topic)).attr("y", d => y(d.chapter)).attr("width", x.bandwidth()).attr("height", y.bandwidth())
    .attr("fill", d => color(d.proportion)).attr("stroke", "#fffdf8")
    .on("pointerenter", (event, d) => showTooltip(event, `<strong>${partLabel(d.chapter)}</strong><span>${d.topic}</span><span>${d.passage_count} passages · ${d3.format(".1%")(d.proportion)} of this part</span>`))
    .on("pointermove", moveTooltip).on("pointerleave", hideTooltip)
    .on("click", (_, d) => {
      const sameCell = cellFilter?.chapter === d.chapter && cellFilter?.cluster === d.cluster;
      cellFilter = sameCell ? null : {chapter: d.chapter, cluster: d.cluster};
      selectedCell = cellFilter;
      updatePointStyles();
      updateMatrixSelection();
      document.querySelector("#semantic-map").scrollIntoView({behavior: "smooth", block: "start"});
    });
  groups.append("text").attr("class", "matrix-count").attr("x", d => x(d.topic) + x.bandwidth() / 2).attr("y", d => y(d.chapter) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "middle").attr("fill", d => d.proportion > .34 ? "#fff" : "#3d3640").text(d => d.passage_count || "");

  const legend = svg.append("g").attr("transform", `translate(${margin.left},575)`);
  legend.append("text").attr("class", "matrix-label").attr("y", -9).text("Share of passages within each part");
  const steps = d3.range(60);
  legend.selectAll("rect").data(steps).join("rect").attr("x", d => d * 4).attr("width", 4).attr("height", 9)
    .attr("fill", d => color((d / 59) * color.domain()[1]));
  legend.append("text").attr("class", "matrix-label").attr("x", 0).attr("y", 25).text("0%");
  legend.append("text").attr("class", "matrix-label").attr("x", 240).attr("y", 25).attr("text-anchor", "end").text(d3.format(".0%")(color.domain()[1]));
}

function updateMatrixSelection() {
  if (!matrixCells) return;
  matrixCells
    .attr("stroke", d => selectedCell && d.chapter === selectedCell.chapter && d.cluster === selectedCell.cluster ? "#dd6a42" : "#fffdf8")
    .attr("stroke-width", d => selectedCell && d.chapter === selectedCell.chapter && d.cluster === selectedCell.cluster ? 4 : 1);
  d3.select("#clear-cell").attr("hidden", cellFilter ? null : true);
}

async function init() {
  const [rawPassages, matrixData, sectionData, termData] = await Promise.all([
    d3.csv("../data/lab8_embedding_map.csv"),
    d3.csv("../data/lab8_topic_section_matrix.csv", d3.autoType),
    d3.csv("../data/lab8_section_summary.csv", d3.autoType),
    d3.csv("../data/lab8_top_terms.csv", d3.autoType)
  ]);

  passages = rawPassages.map(d => ({
    ...d,
    page: +d.page,
    word_count: +d.word_count,
    x: +d.x,
    y: +d.y,
    cluster: +d.cluster,
    neighbors: d.neighbors.split("|"),
    neighbor_scores: d.neighbor_scores.split("|").map(Number)
  }));
  passageById = new Map(passages.map(d => [d.passage_id, d]));

  drawSectionChart(sectionData);
  drawTermChart(termData);
  setupControls();
  drawMap();
  drawMatrix(matrixData);
  updatePointStyles();
}

init().catch(error => {
  console.error(error);
  d3.select("#result-count").text("The visualization data could not be loaded.");
});
