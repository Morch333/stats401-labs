const width = 980;
const height = 560;
const noDataColor = "#dfded8";
const selectedColor = "#f06f45";
const money = d3.format("$,.0f");
const tooltip = d3.select("#tooltip");

let selectedIso = null;
let hoveredIso = null;
let activeRegion = "";
let countryPaths;
let cartogramCircles;
let cartogramLabels;
let choroplethSvg;
let zoom;
let gdpData = [];
let recognition = null;

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
  return `<strong>${d.country}</strong><dl><dt>2025 GDP</dt><dd>${money(d.gdp)} billion</dd><dt>Rank</dt><dd>#${d.rank}</dd><dt>Region</dt><dd>${d.continent}</dd></dl>`;
}

function setHover(iso3) {
  hoveredIso = iso3;
  updateHighlight();
}

function inRegion(d) {
  return !activeRegion || d.continent === activeRegion;
}

function opacityFor(d, isCartogram = false) {
  const active = hoveredIso || selectedIso;
  if (active) return d.iso3 === active ? (isCartogram ? .92 : 1) : (inRegion(d) ? .28 : .08);
  return inRegion(d) ? (isCartogram ? .82 : 1) : .1;
}

function updateHighlight() {
  const active = hoveredIso || selectedIso;
  countryPaths
    .attr("stroke", d => d.iso3 === active ? selectedColor : "#fff")
    .attr("stroke-width", d => d.iso3 === active ? 2.8 : .55)
    .attr("opacity", d => opacityFor(d));

  cartogramCircles
    .attr("stroke", d => d.iso3 === active ? selectedColor : "#173e52")
    .attr("stroke-width", d => d.iso3 === active ? 4 : 1.3)
    .attr("opacity", d => opacityFor(d, true));

  cartogramLabels.attr("opacity", d => active ? (d.iso3 === active ? 1 : .18) : (inRegion(d) ? 1 : .12));

  const selected = selectedIso && gdpData.find(d => d.iso3 === selectedIso);
  let note = activeRegion ? `Showing ${activeRegion}` : "Showing all 50 economies";
  if (selected) note = `${selected.country} · #${selected.rank} · ${money(selected.gdp)}B`;
  d3.select("#selection-note").text(note);
}

function selectCountry(iso3, source = "control") {
  const country = gdpData.find(d => d.iso3 === iso3);
  if (!country) return false;
  selectedIso = iso3;
  hoveredIso = null;
  activeRegion = "";
  d3.select("#country-select").property("value", iso3);
  d3.select("#region-select").property("value", "");
  updateHighlight();
  if (source !== "map") document.querySelector("#maps").scrollIntoView({behavior: "smooth", block: "start"});
  return true;
}

function toggleSelection(d) {
  if (!d.gdp) return;
  if (selectedIso === d.iso3) {
    selectedIso = null;
    d3.select("#country-select").property("value", "");
    updateHighlight();
  } else {
    selectCountry(d.iso3, "map");
  }
}

function applyRegion(region, source = "control") {
  activeRegion = region;
  selectedIso = null;
  hoveredIso = null;
  d3.select("#country-select").property("value", "");
  d3.select("#region-select").property("value", region);
  updateHighlight();
  if (source !== "map") document.querySelector("#maps").scrollIntoView({behavior: "smooth", block: "start"});
}

function resetAll(source = "control") {
  selectedIso = null;
  hoveredIso = null;
  activeRegion = "";
  d3.select("#country-select").property("value", "");
  d3.select("#region-select").property("value", "");
  updateHighlight();
  if (choroplethSvg && zoom) choroplethSvg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
  if (source !== "map") document.querySelector("#maps").scrollIntoView({behavior: "smooth", block: "start"});
}

function addKeyboardInteraction(selection) {
  selection
    .on("focus", (_, d) => setHover(d.iso3))
    .on("blur", () => setHover(null))
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleSelection(d);
      }
    });
}

function drawLegend(colorScale) {
  const wrap = d3.select("#color-legend");
  const svg = wrap.append("svg").attr("viewBox", "0 0 390 44");
  const gradient = svg.append("defs").append("linearGradient").attr("id", "gdp-gradient-lab10");
  d3.range(0, 1.001, .05).forEach(t => {
    const [min, max] = colorScale.domain();
    const value = Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)));
    gradient.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", colorScale(value));
  });
  svg.append("rect").attr("x", 2).attr("y", 3).attr("width", 330).attr("height", 10).attr("fill", "url(#gdp-gradient-lab10)");
  const scale = d3.scaleLog().domain(colorScale.domain()).range([2, 332]);
  const axis = d3.axisBottom(scale).tickValues([300, 1000, 5000, 10000, 30000]).tickFormat(d => d >= 1000 ? `$${d / 1000}T` : `$${d}B`).tickSize(4);
  svg.append("g").attr("transform", "translate(0,13)").call(axis).call(g => g.select(".domain").remove()).call(g => g.selectAll("text").attr("font-size", 9).attr("fill", "#667078")).call(g => g.selectAll("line").attr("stroke", "#a9afb0"));
  wrap.append("div").attr("class", "legend-row").html(`<i class="nodata-swatch"></i><span>No data in supplied top 50</span>`);
}

function drawChoropleth(geoData, joined, colorScale) {
  choroplethSvg = d3.select("#choropleth");
  const projection = d3.geoNaturalEarth1().fitExtent([[18, 18], [width - 18, height - 18]], geoData);
  const path = d3.geoPath(projection);
  const mapLayer = choroplethSvg.append("g");

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
  addKeyboardInteraction(countryPaths);

  zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", event => mapLayer.attr("transform", event.transform));
  choroplethSvg.call(zoom).on("dblclick.zoom", null);
  d3.select("#reset-zoom").on("click", () => choroplethSvg.transition().duration(400).call(zoom.transform, d3.zoomIdentity));
  return projection;
}

function drawCartogram(rawGdp, featureByIso, projection, colorScale) {
  const svg = d3.select("#cartogram");
  const radius = d3.scaleSqrt().domain([0, d3.max(rawGdp, d => d.gdp)]).range([0, 72]);

  svg.append("path").datum({type: "Sphere"}).attr("class", "sphere").attr("d", d3.geoPath(projection));
  svg.append("path").datum(d3.geoGraticule10()).attr("class", "graticule").attr("d", d3.geoPath(projection));

  const nodes = rawGdp.map(d => {
    const feature = featureByIso.get(d.iso3);
    const point = feature ? projection(d3.geoCentroid(feature)) : [width / 2, height / 2];
    return {...d, continent: feature?.properties.continent || "Other", targetX: point[0], targetY: point[1], x: point[0], y: point[1], r: radius(d.gdp)};
  });
  gdpData = nodes;

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
  addKeyboardInteraction(cartogramCircles);

  groups.filter(d => d.r >= 12).append("text").attr("class", "country-code").text(d => d.iso3);
  groups.filter(d => d.rank <= 12).append("text").attr("class", "cartogram-label").attr("y", d => d.r + 12).text(d => d.country);
  cartogramLabels = svg.selectAll(".cartogram-label");
}

function populateFallbackControls() {
  d3.select("#country-select").selectAll("option.country-option")
    .data([...gdpData].sort((a, b) => d3.ascending(a.country, b.country)))
    .join("option")
    .attr("class", "country-option")
    .attr("value", d => d.iso3)
    .text(d => d.country);

  d3.select("#country-select").on("change", event => {
    if (event.target.value) selectCountry(event.target.value);
  });
  d3.select("#region-select").on("change", event => applyRegion(event.target.value));
  d3.select("#reset-all").on("click", () => resetAll());
  d3.selectAll(".command-chip").on("click", event => processCommand(event.currentTarget.dataset.demoCommand, "demo"));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") resetAll("keyboard");
  });
}

function normalize(text) {
  return text.toLowerCase().replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim();
}

function countryFromCommand(command) {
  const aliases = [
    ["united states of america", "USA"], ["united states", "USA"], ["america", "USA"], ["u s", "USA"],
    ["united kingdom", "GBR"], ["great britain", "GBR"], ["u k", "GBR"],
    ["south korea", "KOR"], ["korea", "KOR"], ["russia", "RUS"], ["turkey", "TUR"],
    ["hong kong", "HKG"], ["czechia", "CZE"], ["iran", "IRN"], ["taiwan", "TWN"]
  ];
  const alias = aliases.find(([phrase]) => command.includes(phrase));
  if (alias) return gdpData.find(d => d.iso3 === alias[1]);
  return [...gdpData]
    .sort((a, b) => b.country.length - a.country.length)
    .find(d => command.includes(normalize(d.country)));
}

function processCommand(transcript, source = "voice") {
  const command = normalize(transcript);
  d3.select("#heard-text").text(source === "voice" ? transcript : `${transcript} (demo)`);

  if (["reset", "reset map", "reset maps", "show all", "clear", "clear selection"].includes(command)) {
    resetAll(source);
    d3.select("#action-text").text("Reset both maps");
    return;
  }

  const regions = ["North America", "South America", "Europe", "Asia", "Africa", "Oceania"];
  const region = regions.find(d => command.includes(d.toLowerCase()));
  if (region && /show|filter|focus|display/.test(command)) {
    applyRegion(region, source);
    d3.select("#action-text").text(`Filtered both maps to ${region}`);
    return;
  }

  const country = countryFromCommand(command);
  if (country && /highlight|select|find|show|focus/.test(command)) {
    selectCountry(country.iso3, source);
    d3.select("#action-text").text(`Highlighted ${country.country} in both maps`);
    return;
  }

  d3.select("#action-text").text("Command not recognized. Try “Highlight China,” “Show Europe,” or “Reset.”");
}

function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = document.querySelector("#listen-button");
  const label = document.querySelector("#listen-label");
  const status = d3.select("#voice-status");

  if (!SpeechRecognition) {
    button.disabled = true;
    label.textContent = "Speech unavailable";
    status.text("This browser does not support speech recognition. Use the controls below.").classed("is-error", true);
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = () => {
    button.classList.add("is-listening");
    button.setAttribute("aria-pressed", "true");
    label.textContent = "Listening…";
    status.text("Listening for one command").classed("is-error", false);
  };

  recognition.onresult = event => {
    const transcript = event.results[0][0].transcript;
    processCommand(transcript, "voice");
    status.text("Command received");
  };

  recognition.onerror = event => {
    const message = event.error === "not-allowed"
      ? "Microphone permission was not granted. Use the controls below."
      : `Speech recognition error: ${event.error}. Try again or use the controls below.`;
    status.text(message).classed("is-error", true);
    d3.select("#action-text").text("No map action taken");
  };

  recognition.onend = () => {
    button.classList.remove("is-listening");
    button.setAttribute("aria-pressed", "false");
    label.textContent = "Start listening";
    if (status.text() === "Listening for one command") status.text("No speech detected. Try again.");
  };

  button.addEventListener("click", () => {
    try {
      recognition.start();
    } catch (_) {
      status.text("Recognition is already active.");
    }
  });
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
    continent: feature.properties.continent,
    ...(gdpByIso.get(feature.properties.iso3) || {})
  }));
  const unmatched = rawGdp.filter(d => !featureByIso.has(d.iso3));
  if (unmatched.length) throw new Error(`Unmatched ISO-3 codes: ${unmatched.map(d => d.iso3).join(", ")}`);

  const colorScale = d3.scaleSequentialLog(d3.interpolateYlGnBu).domain(d3.extent(rawGdp, d => d.gdp));
  const projection = drawChoropleth(geoData, joined, colorScale);
  drawCartogram(rawGdp, featureByIso, projection, colorScale);
  drawLegend(colorScale);
  populateFallbackControls();
  setupVoice();
  updateHighlight();
}

init().catch(error => {
  console.error(error);
  d3.select("#chart-error").attr("hidden", null).text("The map data could not be loaded.");
});
