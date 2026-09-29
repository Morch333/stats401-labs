const width = 980;
const height = 560;
const noDataColor = "#dfded8";
const selectedColor = "#ea7046";
const money = d3.format("$,.0f");
const tooltip = d3.select("#tooltip");

let selectedIso = null;
let hoveredIso = null;
let countryPaths;
let cartogramCircles;
let cartogramLabels;
let zoom;

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

function tooltipHtml(d) {
  if (!d.gdp) {
    return `<strong>${d.name}</strong><span>Not included in the supplied top-50 dataset</span>`;
  }
  return `<strong>${d.country}</strong><dl><dt>2025 GDP</dt><dd>${money(d.gdp)} billion</dd><dt>Rank</dt><dd>#${d.rank}</dd><dt>ISO-3</dt><dd>${d.iso3}</dd></dl>`;
}

function setHover(iso3) {
  hoveredIso = iso3;
  updateHighlight();
}

function toggleSelection(d) {
  if (!d.gdp) return;
  selectedIso = selectedIso === d.iso3 ? null : d.iso3;
  updateHighlight();
}

function updateHighlight() {
  const active = hoveredIso || selectedIso;
  countryPaths
    .attr("stroke", d => d.iso3 === active ? selectedColor : d.iso3 === selectedIso ? selectedColor : "#fff")
    .attr("stroke-width", d => d.iso3 === active || d.iso3 === selectedIso ? 2.6 : .55)
    .attr("opacity", d => !active || d.iso3 === active ? 1 : .48);

  cartogramCircles
    .attr("stroke", d => d.iso3 === active ? selectedColor : d.iso3 === selectedIso ? selectedColor : "#173e52")
    .attr("stroke-width", d => d.iso3 === active || d.iso3 === selectedIso ? 4 : 1.3)
    .attr("opacity", d => !active || d.iso3 === active ? .9 : .34);

  cartogramLabels.attr("opacity", d => !active || d.iso3 === active ? 1 : .25);

  const selected = selectedIso && cartogramCircles.data().find(d => d.iso3 === selectedIso);
  d3.select("#selection-note").text(selected ? `${selected.country} · #${selected.rank} · ${money(selected.gdp)}B` : "No country selected");
  d3.select("#clear-selection").property("disabled", !selectedIso);
}

function drawLegend(colorScale) {
  const wrap = d3.select("#color-legend");
  const svg = wrap.append("svg").attr("viewBox", "0 0 390 44");
  const defs = svg.append("defs");
  const gradient = defs.append("linearGradient").attr("id", "gdp-gradient");
  d3.range(0, 1.001, .05).forEach(t => {
    const min = colorScale.domain()[0];
    const max = colorScale.domain()[1];
    const value = Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)));
    gradient.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", colorScale(value));
  });
  svg.append("rect").attr("x", 2).attr("y", 3).attr("width", 330).attr("height", 10).attr("fill", "url(#gdp-gradient)");
  const scale = d3.scaleLog().domain(colorScale.domain()).range([2, 332]);
  const axis = d3.axisBottom(scale).tickValues([300, 1000, 5000, 10000, 30000]).tickFormat(d => d >= 1000 ? `$${d / 1000}T` : `$${d}B`).tickSize(4);
  svg.append("g").attr("transform", "translate(0,13)").call(axis).call(g => g.select(".domain").remove()).call(g => g.selectAll("text").attr("font-size", 9).attr("fill", "#667078")).call(g => g.selectAll("line").attr("stroke", "#a9afb0"));
  wrap.append("div").attr("class", "legend-row").html(`<i class="nodata-swatch"></i><span>No data in supplied top 50</span>`);
}

function drawChoropleth(geoData, joined, colorScale) {
  const svg = d3.select("#choropleth");
  const projection = d3.geoNaturalEarth1().fitExtent([[18, 18], [width - 18, height - 18]], geoData);
  const path = d3.geoPath(projection);
  const mapLayer = svg.append("g");

  mapLayer.append("path").datum({type: "Sphere"}).attr("class", "sphere").attr("d", path);
  mapLayer.append("path").datum(d3.geoGraticule10()).attr("class", "graticule").attr("d", path);

  countryPaths = mapLayer.append("g").selectAll("path")
    .data(joined, d => d.iso3)
    .join("path")
    .attr("class", "map-shape")
    .attr("d", d => path(d.feature))
    .attr("fill", d => d.gdp ? colorScale(d.gdp) : noDataColor)
    .attr("stroke", "#fff")
    .attr("stroke-width", .55)
    .attr("tabindex", 0)
    .attr("role", "graphics-symbol")
    .attr("aria-label", d => d.gdp ? `${d.country}, GDP ${money(d.gdp)} billion dollars, rank ${d.rank}` : `${d.name}, no supplied GDP data`)
    .on("pointerenter", (event, d) => { setHover(d.iso3); showTooltip(event, tooltipHtml(d)); })
    .on("pointermove", moveTooltip)
    .on("pointerleave", () => { setHover(null); hideTooltip(); })
    .on("click", (_, d) => toggleSelection(d));

  zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", event => mapLayer.attr("transform", event.transform));
  svg.call(zoom).on("dblclick.zoom", null);
  d3.select("#reset-zoom").on("click", () => svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity));
  return {projection, path};
}

function drawCartogram(gdpData, featureByIso, projection, colorScale) {
  const svg = d3.select("#cartogram");
  const radius = d3.scaleSqrt().domain([0, d3.max(gdpData, d => d.gdp)]).range([0, 72]);

  svg.append("path").datum({type: "Sphere"}).attr("class", "sphere").attr("d", d3.geoPath(projection));
  svg.append("path").datum(d3.geoGraticule10()).attr("class", "graticule").attr("d", d3.geoPath(projection));

  const nodes = gdpData.map(d => {
    const feature = featureByIso.get(d.iso3);
    const point = feature ? projection(d3.geoCentroid(feature)) : [width / 2, height / 2];
    return {...d, targetX: point[0], targetY: point[1], x: point[0], y: point[1], r: radius(d.gdp)};
  });

  const simulation = d3.forceSimulation(nodes)
    .force("x", d3.forceX(d => d.targetX).strength(.23))
    .force("y", d3.forceY(d => d.targetY).strength(.23))
    .force("collide", d3.forceCollide(d => d.r + 1.5).iterations(4))
    .stop();
  for (let i = 0; i < 360; i += 1) simulation.tick();

  const groups = svg.append("g").selectAll("g").data(nodes, d => d.iso3).join("g").attr("transform", d => `translate(${d.x},${d.y})`);
  cartogramCircles = groups.append("circle")
    .attr("class", "cartogram-node")
    .attr("r", d => d.r)
    .attr("fill", d => colorScale(d.gdp))
    .attr("fill-opacity", .8)
    .attr("stroke", "#173e52")
    .attr("stroke-width", 1.3)
    .attr("tabindex", 0)
    .attr("role", "graphics-symbol")
    .attr("aria-label", d => `${d.country}, circle area represents GDP ${money(d.gdp)} billion dollars, rank ${d.rank}`)
    .on("pointerenter", (event, d) => { setHover(d.iso3); showTooltip(event, tooltipHtml(d)); })
    .on("pointermove", moveTooltip)
    .on("pointerleave", () => { setHover(null); hideTooltip(); })
    .on("click", (_, d) => toggleSelection(d));

  groups.filter(d => d.r >= 12).append("text").attr("class", "country-code").text(d => d.iso3);
  cartogramLabels = groups.filter(d => d.rank <= 12).append("text").attr("class", "cartogram-label").attr("y", d => d.r + 12).text(d => d.country);

  // Include an empty selection so highlight updates work for labels beyond the top 12.
  cartogramLabels = svg.selectAll(".cartogram-label");
}

async function init() {
  const [geoData, rawGdp] = await Promise.all([
    d3.json("../data/lab9_world_countries.geojson"),
    d3.csv("../data/lab9_gdp_2025_top50.csv", d => ({iso3: d.iso3, country: d.country, gdp: +d.gdp_2025_billion_usd, rank: +d.rank}))
  ]);

  const gdpByIso = new Map(rawGdp.map(d => [d.iso3, d]));
  const featureByIso = new Map(geoData.features.map(d => [d.properties.iso3, d]));
  const joined = geoData.features.map(feature => ({
    feature,
    iso3: feature.properties.iso3,
    name: feature.properties.name,
    ...(gdpByIso.get(feature.properties.iso3) || {})
  }));
  const unmatched = rawGdp.filter(d => !featureByIso.has(d.iso3));
  if (unmatched.length) throw new Error(`Unmatched ISO-3 codes: ${unmatched.map(d => d.iso3).join(", ")}`);

  const colorScale = d3.scaleSequentialLog(d3.interpolateYlGnBu).domain(d3.extent(rawGdp, d => d.gdp));
  const {projection} = drawChoropleth(geoData, joined, colorScale);
  drawCartogram(rawGdp, featureByIso, projection, colorScale);
  drawLegend(colorScale);

  d3.select("#clear-selection").on("click", () => { selectedIso = null; updateHighlight(); });
  updateHighlight();
}

init().catch(error => {
  console.error(error);
  d3.select("#chart-error").attr("hidden", null).text("The map data could not be loaded.");
});
