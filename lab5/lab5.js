const districtOrder = ["Central", "North", "South", "East", "West"];
const districtColors = new Map([
  ["Central", "#e47b45"],
  ["North", "#3d7eaa"],
  ["South", "#4f936d"],
  ["East", "#9a67a8"],
  ["West", "#d1a13b"]
]);

const routeColors = new Map([
  ["Metro", "#3577a8"],
  ["Express", "#c24f45"],
  ["Shuttle", "#6b5aa6"]
]);

const stationSymbols = new Map([
  ["Local", d3.symbolCircle],
  ["Transfer", d3.symbolDiamond],
  ["Terminal", d3.symbolSquare]
]);

const tooltip = d3.select("#tooltip");

function stationNumber(id) {
  return id.replace("s", "");
}

function endpointId(endpoint) {
  return typeof endpoint === "object" ? endpoint.id : endpoint;
}

function showTooltip(event, html) {
  tooltip.html(html).attr("hidden", null);
  moveTooltip(event);
}

function moveTooltip(event) {
  const eventX = Number.isFinite(event.clientX) && event.clientX > 0
    ? event.clientX
    : window.innerWidth / 2;
  const eventY = Number.isFinite(event.clientY) && event.clientY > 0
    ? event.clientY
    : window.innerHeight / 2;
  const x = Math.min(eventX + 14, window.innerWidth - 275);
  const y = Math.min(eventY + 14, window.innerHeight - 145);
  tooltip.style("left", `${Math.max(8, x)}px`).style("top", `${Math.max(8, y)}px`);
}

function hideTooltip() {
  tooltip.attr("hidden", true);
}

function linkLabel(link, nodeById) {
  const source = nodeById.get(endpointId(link.source));
  const target = nodeById.get(endpointId(link.target));
  return `<strong>${source.station_name} ↔ ${target.station_name}</strong>${link.route_type} · ${link.travel_time_min} minutes`;
}

function renderDistrictLegend() {
  d3.select("#district-legend")
    .selectAll("span")
    .data(districtOrder)
    .join("span")
    .attr("class", "district-item")
    .html(d => `<i style="background:${districtColors.get(d)}"></i>${d}`);
}

function renderNetwork(nodes, links) {
  const svg = d3.select("#network");
  const width = 1100;
  const height = 680;
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const degree = new Map(nodes.map(node => [node.id, 0]));

  links.forEach(link => {
    degree.set(link.source, degree.get(link.source) + 1);
    degree.set(link.target, degree.get(link.target) + 1);
  });

  const passengerArea = d3.scaleSqrt()
    .domain(d3.extent(nodes, d => d.daily_passengers))
    .range([260, 980]);

  const linkWidth = d3.scaleLinear()
    .domain(d3.extent(links, d => d.travel_time_min))
    .range([1.1, 6]);

  const radius = node => Math.sqrt(passengerArea(node.daily_passengers) / Math.PI) + 4;

  const link = svg.append("g")
    .attr("aria-label", "Transit routes")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("class", "network-link")
    .attr("stroke", d => routeColors.get(d.route_type))
    .attr("stroke-width", d => linkWidth(d.travel_time_min))
    .attr("stroke-dasharray", d => d.route_type === "Shuttle" ? "7 5" : null)
    .attr("stroke-linecap", "round")
    .attr("stroke-opacity", .62)
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", d => `${nodeById.get(d.source).station_name} to ${nodeById.get(d.target).station_name}, ${d.route_type}, ${d.travel_time_min} minutes`);

  const node = svg.append("g")
    .attr("aria-label", "Transit stations")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("class", "station-node")
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", d => `${d.station_name}, ${d.district}, ${d.station_type}, ${d.daily_passengers.toLocaleString()} daily passengers, ${degree.get(d.id)} direct routes`);

  node.append("path")
    .attr("d", d => d3.symbol().type(stationSymbols.get(d.station_type)).size(passengerArea(d.daily_passengers))())
    .attr("fill", d => districtColors.get(d.district))
    .attr("stroke", "#17212b")
    .attr("stroke-width", 1.6);

  node.append("text")
    .attr("class", "station-number")
    .style("fill", d => ["North", "East"].includes(d.district) ? "#fff" : "#17212b")
    .text(d => stationNumber(d.id));

  const connected = (a, b) => links.some(item => {
    const source = endpointId(item.source);
    const target = endpointId(item.target);
    return (source === a && target === b) || (source === b && target === a);
  });

  function highlightStation(event, selected) {
    node.style("opacity", d => d.id === selected.id || connected(selected.id, d.id) ? 1 : .13);
    link.style("opacity", d => endpointId(d.source) === selected.id || endpointId(d.target) === selected.id ? 1 : .08);
    showTooltip(event, `<strong>${selected.station_name}</strong>${selected.district} · ${selected.station_type}<br>${selected.daily_passengers.toLocaleString()} daily passengers<br>${degree.get(selected.id)} direct routes`);
  }

  function highlightLink(event, selected) {
    const source = endpointId(selected.source);
    const target = endpointId(selected.target);
    node.style("opacity", d => d.id === source || d.id === target ? 1 : .13);
    link.style("opacity", d => d === selected ? 1 : .08);
    showTooltip(event, linkLabel(selected, nodeById));
  }

  function resetHighlight() {
    node.style("opacity", 1);
    link.style("opacity", .62);
    hideTooltip();
  }

  node
    .on("mouseenter focus", highlightStation)
    .on("mousemove", moveTooltip)
    .on("mouseleave blur", resetHighlight);

  link
    .on("mouseenter focus", highlightLink)
    .on("mousemove", moveTooltip)
    .on("mouseleave blur", resetHighlight);

  const simulation = d3.forceSimulation(nodes)
    .randomSource(d3.randomLcg(.42))
    .force("link", d3.forceLink(links)
      .id(d => d.id)
      .distance(d => 58 + d.travel_time_min * 3.2)
      .strength(.82))
    .force("charge", d3.forceManyBody().strength(-145))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(width / 2).strength(.035))
    .force("y", d3.forceY(height / 2).strength(.045))
    .force("collide", d3.forceCollide().radius(d => radius(d) + 4).iterations(2))
    .on("tick", () => {
      node.attr("transform", d => {
        const r = radius(d);
        d.x = Math.max(r, Math.min(width - r, d.x));
        d.y = Math.max(r, Math.min(height - r, d.y));
        return `translate(${d.x},${d.y})`;
      });

      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
    });

  node.call(d3.drag()
    .on("start", (event, d) => {
      if (!event.active) simulation.alphaTarget(.25).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }));

  d3.select("#reset-layout").on("click", () => {
    nodes.forEach(d => {
      d.fx = null;
      d.fy = null;
      d.x = width / 2 + (Math.random() - .5) * 40;
      d.y = height / 2 + (Math.random() - .5) * 40;
    });
    resetHighlight();
    simulation.alpha(1).restart();
  });
}

function renderMatrix(nodes, links) {
  const svg = d3.select("#matrix");
  const width = 940;
  const margin = { top: 135, right: 35, bottom: 35, left: 135 };
  const matrixSize = 760;
  const districtRank = new Map(districtOrder.map((d, i) => [d, i]));
  const ordered = [...nodes].sort((a, b) =>
    d3.ascending(districtRank.get(a.district), districtRank.get(b.district)) ||
    d3.ascending(Number(stationNumber(a.id)), Number(stationNumber(b.id)))
  );
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const ids = ordered.map(d => d.id);
  const x = d3.scaleBand().domain(ids).range([0, matrixSize]).paddingInner(.12);
  const y = d3.scaleBand().domain(ids).range([0, matrixSize]).paddingInner(.12);
  const opacity = d3.scaleLinear()
    .domain(d3.extent(links, d => d.travel_time_min))
    .range([.36, 1]);

  const routeLookup = new Map();
  links.forEach(link => {
    routeLookup.set(`${link.source}|${link.target}`, link);
    routeLookup.set(`${link.target}|${link.source}`, link);
  });

  const allCells = ids.flatMap(row => ids.map(col => ({
    row,
    col,
    route: routeLookup.get(`${row}|${col}`) || null
  })));

  const group = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  group.selectAll("rect.cell-background")
    .data(allCells)
    .join("rect")
    .attr("class", "cell-background")
    .attr("x", d => x(d.col))
    .attr("y", d => y(d.row))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", d => d.row === d.col ? "#e7ebee" : "#f7f7f5");

  const cells = group.selectAll("rect.matrix-cell")
    .data(allCells.filter(d => d.route))
    .join("rect")
    .attr("class", "matrix-cell")
    .attr("x", d => x(d.col))
    .attr("y", d => y(d.row))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 1.5)
    .attr("fill", d => routeColors.get(d.route.route_type))
    .attr("fill-opacity", d => opacity(d.route.travel_time_min))
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", d => `${nodeById.get(d.row).station_name} to ${nodeById.get(d.col).station_name}, ${d.route.route_type}, ${d.route.travel_time_min} minutes`);

  const rowLabels = group.selectAll("text.row-label")
    .data(ordered)
    .join("text")
    .attr("class", "row-label")
    .attr("x", -12)
    .attr("y", d => y(d.id) + y.bandwidth() / 2)
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "central")
    .attr("fill", d => districtColors.get(d.district))
    .attr("font-size", 9.5)
    .attr("font-weight", 650)
    .text(d => d.station_name);

  const colLabels = group.selectAll("text.col-label")
    .data(ordered)
    .join("text")
    .attr("class", "col-label")
    .attr("transform", d => `translate(${x(d.id) + x.bandwidth() / 2},-10) rotate(-62)`)
    .attr("text-anchor", "start")
    .attr("fill", d => districtColors.get(d.district))
    .attr("font-size", 9)
    .attr("font-weight", 650)
    .text(d => d.station_name);

  const districtRanges = districtOrder.map(district => {
    const members = ordered.filter(d => d.district === district);
    const first = members[0].id;
    const last = members[members.length - 1].id;
    return {
      district,
      start: x(first),
      size: x(last) + x.bandwidth() - x(first)
    };
  });

  group.selectAll("rect.top-district-band")
    .data(districtRanges)
    .join("rect")
    .attr("class", "top-district-band")
    .attr("x", d => d.start)
    .attr("y", -120)
    .attr("width", d => d.size)
    .attr("height", 7)
    .attr("fill", d => districtColors.get(d.district));

  group.selectAll("rect.left-district-band")
    .data(districtRanges)
    .join("rect")
    .attr("class", "left-district-band")
    .attr("x", -122)
    .attr("y", d => d.start)
    .attr("width", 7)
    .attr("height", d => d.size)
    .attr("fill", d => districtColors.get(d.district));

  function highlightCell(event, selected) {
    cells.style("opacity", d => d.row === selected.row || d.col === selected.col ? 1 : .12);
    rowLabels.attr("font-weight", d => d.id === selected.row ? 900 : 650);
    colLabels.attr("font-weight", d => d.id === selected.col ? 900 : 650);
    showTooltip(event, linkLabel(selected.route, nodeById));
  }

  function resetCells() {
    cells.style("opacity", 1);
    rowLabels.attr("font-weight", 650);
    colLabels.attr("font-weight", 650);
    hideTooltip();
  }

  cells
    .on("mouseenter focus", highlightCell)
    .on("mousemove", moveTooltip)
    .on("mouseleave blur", resetCells);

  svg.attr("viewBox", `0 0 ${width} ${margin.top + matrixSize + margin.bottom}`);
}

renderDistrictLegend();

Promise.all([
  d3.csv("../data/lab5_assignment_stations.csv", d => ({
    ...d,
    daily_passengers: +d.daily_passengers
  })),
  d3.csv("../data/lab5_assignment_routes.csv", d => ({
    ...d,
    travel_time_min: +d.travel_time_min
  }))
])
  .then(([nodes, links]) => {
    renderNetwork(nodes.map(d => ({ ...d })), links.map(d => ({ ...d })));
    renderMatrix(nodes, links);
  })
  .catch(error => {
    console.error(error);
    d3.select("#network-error")
      .attr("hidden", null)
      .text("The network data could not be loaded.");
    d3.select("#matrix-error")
      .attr("hidden", null)
      .text("The matrix data could not be loaded.");
  });
