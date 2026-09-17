const width = 940;
const height = 650;

const sectorColors = new Map([
  ["Manufacturing", "#d9653b"],
  ["Logistics", "#3d789b"],
  ["Retail", "#d49b35"],
  ["Food", "#6d9859"],
  ["Technology", "#7766a4"],
  ["Wholesale", "#498e82"],
  ["Materials", "#a66c49"]
]);

const regionColors = new Map([
  ["Asia", "#183e65"],
  ["Europe", "#c85735"],
  ["North America", "#62835a"]
]);

const typeColors = new Map([
  ["goods", "#cc6040"],
  ["shipping", "#3f7d9f"],
  ["components", "#7a68a5"],
  ["materials", "#a9793f"],
  ["services", "#4c8a70"]
]);

const regionCenters = new Map([
  ["Asia", [245, 205]],
  ["Europe", [695, 205]],
  ["North America", [470, 480]]
]);

const money = d3.format("$,.0f");
const dateFormat = d3.timeFormat("%B %-d, %Y");
const svg = d3.select("#network-chart");
const tooltip = d3.select("#tooltip");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let companies = [];
let transactions = [];
let transactionsByDay = new Map();
let nodeSelection;
let linkSelection;
let simulation;
let currentDay = 1;
let timer = null;

const radius = d3.scaleSqrt().domain([0, 85000]).range([8, 30]).clamp(true);
const linkWidth = d3.scaleLinear().domain([7000, 34000]).range([1.5, 7]).clamp(true);
const linkOpacity = d3.scaleLinear().domain([1, 5]).range([.4, .92]);

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

function renderLegends() {
  d3.select("#sector-legend")
    .selectAll("span")
    .data(sectorColors)
    .join("span")
    .html(([name, color]) => `<i class="color-swatch" style="background:${color}"></i>${name}`);

  d3.select("#type-legend")
    .selectAll("span")
    .data(typeColors)
    .join("span")
    .html(([name, color]) => `<i class="line-swatch" style="background:${color}"></i>${name[0].toUpperCase()}${name.slice(1)}`);
}

function drawRegionGuides() {
  const guides = svg.append("g").attr("aria-hidden", "true");
  guides.selectAll("circle")
    .data(regionCenters)
    .join("circle")
    .attr("class", "region-zone")
    .attr("cx", ([, point]) => point[0])
    .attr("cy", ([, point]) => point[1])
    .attr("r", 142);

  guides.selectAll("text")
    .data(regionCenters)
    .join("text")
    .attr("class", "region-label")
    .attr("x", ([, point]) => point[0])
    .attr("y", ([, point]) => point[1] - 153)
    .attr("text-anchor", "middle")
    .text(([region]) => region);
}

function nodeVolume(nodeId, links) {
  return d3.sum(links, d => d.sourceId === nodeId || d.targetId === nodeId ? d.amount : 0);
}

function updateSummary(dayLinks) {
  const active = new Set(dayLinks.flatMap(d => [d.sourceId, d.targetId]));
  const cross = dayLinks.filter(d => d.source.region !== d.target.region).length;
  const date = dayLinks[0]?.date;

  d3.select("#day-label").text(`Day ${currentDay}`);
  d3.select("#date-label").text(date ? dateFormat(date) : "No date");
  d3.select("#active-companies").text(active.size);
  d3.select("#active-links").text(dayLinks.length);
  d3.select("#daily-value").text(money(d3.sum(dayLinks, d => d.amount)));
  d3.select("#cross-region").text(dayLinks.length ? `${Math.round(cross / dayLinks.length * 100)}%` : "0%");
  d3.select("#day-slider").property("value", currentDay);
}

function updateNetwork(day) {
  currentDay = Math.max(1, Math.min(60, day));
  const dayLinks = (transactionsByDay.get(currentDay) || []).map(d => ({ ...d }));
  const volumeById = new Map(companies.map(d => [d.id, nodeVolume(d.id, dayLinks)]));

  linkSelection = svg.select(".links")
    .selectAll("line")
    .data(dayLinks, d => d.key)
    .join(
      enter => enter.append("line")
        .attr("class", "link")
        .attr("stroke", d => typeColors.get(d.type))
        .attr("stroke-width", d => linkWidth(d.amount))
        .attr("stroke-opacity", 0)
        .on("pointerenter", (event, d) => showTooltip(event, `
          <strong>${d.source.company_name} ↔ ${d.target.company_name}</strong>
          <dl><dt>Type</dt><dd>${d.type}</dd><dt>Amount</dt><dd>${money(d.amount)}</dd><dt>Transactions</dt><dd>${d.count}</dd><dt>Regions</dt><dd>${d.source.region} / ${d.target.region}</dd></dl>`))
        .on("pointermove", moveTooltip)
        .on("pointerleave", hideTooltip)
        .call(enter => enter.transition().duration(prefersReducedMotion ? 0 : 420)
          .attr("stroke-opacity", d => linkOpacity(d.count))),
      update => update.call(update => update.transition().duration(prefersReducedMotion ? 0 : 250)
        .attr("stroke", d => typeColors.get(d.type))
        .attr("stroke-width", d => linkWidth(d.amount))
        .attr("stroke-opacity", d => linkOpacity(d.count))),
      exit => exit.call(exit => exit.transition().duration(prefersReducedMotion ? 0 : 360)
        .attr("stroke-opacity", 0)
        .remove())
    );

  const activeIds = new Set(dayLinks.flatMap(d => [d.sourceId, d.targetId]));
  nodeSelection
    .classed("inactive", d => !activeIds.has(d.id))
    .select("circle")
    .attr("r", d => radius(volumeById.get(d.id)))
    .attr("stroke-width", d => activeIds.has(d.id) ? 4 : 2);

  nodeSelection.select("text")
    .attr("y", d => radius(volumeById.get(d.id)) + 15);

  nodeSelection
    .on("pointerenter", (event, d) => showTooltip(event, `
      <strong>${d.company_name}</strong>
      <dl><dt>Sector</dt><dd>${d.sector}</dd><dt>Region</dt><dd>${d.region}</dd><dt>Day ${currentDay} volume</dt><dd>${money(volumeById.get(d.id))}</dd><dt>Active today</dt><dd>${activeIds.has(d.id) ? "Yes" : "No"}</dd></dl>`))
    .on("pointermove", moveTooltip)
    .on("pointerleave", hideTooltip);

  simulation.force("link").links(dayLinks);
  simulation.alpha(.26).restart();
  updateSummary(dayLinks);
}

function ticked() {
  linkSelection
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y);

  nodeSelection.attr("transform", d => `translate(${d.x},${d.y})`);
}

function dragStarted(event, d) {
  if (!event.active) simulation.alphaTarget(.18).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  d.fx = Math.max(38, Math.min(width - 38, event.x));
  d.fy = Math.max(38, Math.min(height - 38, event.y));
}

function dragEnded(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

function pause() {
  if (timer) window.clearInterval(timer);
  timer = null;
  d3.select("#play").classed("playing", false).text("▶ Play");
}

function play() {
  if (timer) return;
  if (currentDay >= 60) updateNetwork(1);
  d3.select("#play").classed("playing", true).text("Playing…");
  timer = window.setInterval(() => {
    if (currentDay >= 60) {
      pause();
      return;
    }
    updateNetwork(currentDay + 1);
  }, 900);
}

function reset() {
  pause();
  updateNetwork(1);
}

async function init() {
  renderLegends();
  drawRegionGuides();

  const [companyRows, transactionRows] = await Promise.all([
    d3.csv("../data/lab7_assignment_companies.csv"),
    d3.csv("../data/lab7_assignment_transactions_60days.csv")
  ]);

  companies = companyRows.map((d, i) => {
    const center = regionCenters.get(d.region);
    const angle = (i / companyRows.length) * Math.PI * 2;
    return {
      ...d,
      x: center[0] + Math.cos(angle) * 62,
      y: center[1] + Math.sin(angle) * 62
    };
  });

  const companyById = new Map(companies.map(d => [d.id, d]));
  const parseDate = d3.timeParse("%Y-%m-%d");
  transactions = transactionRows.map(d => ({
    date: parseDate(d.date),
    day: +d.day,
    sourceId: d.source,
    targetId: d.target,
    source: companyById.get(d.source),
    target: companyById.get(d.target),
    amount: +d.amount_usd,
    type: d.transaction_type,
    count: +d.transaction_count,
    key: [d.source, d.target].sort().join("—")
  }));

  transactionsByDay = d3.group(transactions, d => d.day);
  svg.append("g").attr("class", "links");
  const nodeGroup = svg.append("g").attr("class", "nodes");

  nodeSelection = nodeGroup.selectAll("g")
    .data(companies, d => d.id)
    .join("g")
    .attr("class", "node")
    .attr("tabindex", 0)
    .attr("role", "graphics-symbol")
    .attr("aria-label", d => `${d.company_name}, ${d.sector}, ${d.region}`)
    .call(d3.drag().on("start", dragStarted).on("drag", dragged).on("end", dragEnded));

  nodeSelection.append("circle")
    .attr("r", 8)
    .attr("fill", d => sectorColors.get(d.sector))
    .attr("stroke", d => regionColors.get(d.region));

  nodeSelection.append("text")
    .attr("text-anchor", "middle")
    .attr("y", 23)
    .text(d => d.company_name.split(" ")[0]);

  simulation = d3.forceSimulation(companies)
    .force("link", d3.forceLink([]).id(d => d.id).distance(115).strength(.24))
    .force("charge", d3.forceManyBody().strength(-250))
    .force("collide", d3.forceCollide().radius(47).iterations(2))
    .force("region-x", d3.forceX(d => regionCenters.get(d.region)[0]).strength(.095))
    .force("region-y", d3.forceY(d => regionCenters.get(d.region)[1]).strength(.095))
    .force("bounds-x", d3.forceX(width / 2).strength(.012))
    .force("bounds-y", d3.forceY(height / 2).strength(.012))
    .alphaDecay(.055)
    .velocityDecay(.48)
    .on("tick", ticked);

  updateNetwork(1);

  d3.select("#play").on("click", play);
  d3.select("#pause").on("click", pause);
  d3.select("#reset").on("click", reset);
  d3.select("#day-slider").on("input", function () {
    pause();
    updateNetwork(+this.value);
  });
}

init().catch(error => {
  console.error(error);
  d3.select("#chart-error")
    .attr("hidden", null)
    .text("The network data could not be loaded. Please run this page through a local or web server.");
});
