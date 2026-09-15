const statusColors = new Map([
  ["Increase", "#3b8b6d"],
  ["Unchanged", "#d09b38"],
  ["Decrease", "#c75b55"]
]);

const tooltip = d3.select("#tooltip");
const formatGDP = d3.format(",");

function showTooltip(event, node) {
  const continent = node.parent.parent.data.name;
  const area = node.parent.data.name;
  tooltip
    .html(
      `<strong>${node.data.name}</strong>` +
      `<span class="path">${continent} · ${area}</span><br>` +
      `$${formatGDP(node.data.gdp)} billion<br>` +
      `Status: ${node.data.status}`
    )
    .attr("hidden", null);
  moveTooltip(event);
}

function moveTooltip(event) {
  const pointerX = Number.isFinite(event.clientX) && event.clientX > 0
    ? event.clientX
    : window.innerWidth / 2;
  const pointerY = Number.isFinite(event.clientY) && event.clientY > 0
    ? event.clientY
    : window.innerHeight / 2;
  const x = Math.min(pointerX + 14, window.innerWidth - 290);
  const y = Math.min(pointerY + 14, window.innerHeight - 145);
  tooltip.style("left", `${Math.max(8, x)}px`).style("top", `${Math.max(8, y)}px`);
}

function hideTooltip() {
  tooltip.attr("hidden", true);
}

function renderTreemap(selector, data, tile, idPrefix) {
  const width = 920;
  const height = 560;
  const svg = d3.select(selector);

  const root = d3.hierarchy(data)
    .sum(d => d.gdp || 0)
    .sort((a, b) => b.value - a.value);

  d3.treemap()
    .tile(tile)
    .size([width, height])
    .paddingOuter(5)
    .paddingInner(2)
    .paddingTop(d => d.depth === 1 ? 27 : d.depth === 2 ? 19 : 0)
    .round(true)(root);

  const leaves = root.leaves();
  const groups = svg.append("g")
    .selectAll("g")
    .data(leaves)
    .join("g")
    .attr("class", "country-cell")
    .attr("transform", d => `translate(${d.x0},${d.y0})`)
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", d => `${d.data.name}, ${d.parent.parent.data.name}, ${d.parent.data.name}, GDP ${formatGDP(d.data.gdp)} billion dollars, status ${d.data.status}`);

  groups.append("rect")
    .attr("width", d => Math.max(0, d.x1 - d.x0))
    .attr("height", d => Math.max(0, d.y1 - d.y0))
    .attr("fill", d => statusColors.get(d.data.status))
    .attr("fill-opacity", .88)
    .attr("stroke", "#fffdf8")
    .attr("stroke-width", 1.5);

  groups.each(function(d, index) {
    const group = d3.select(this);
    const cellWidth = d.x1 - d.x0;
    const cellHeight = d.y1 - d.y0;
    if (cellWidth < 54 || cellHeight < 28) return;

    const clipId = `${idPrefix}-clip-${index}`;
    group.append("clipPath")
      .attr("id", clipId)
      .append("rect")
      .attr("width", cellWidth)
      .attr("height", cellHeight);

    const label = group.append("text")
      .attr("class", "country-label")
      .attr("x", 7)
      .attr("y", 18)
      .attr("clip-path", `url(#${clipId})`);

    label.append("tspan").text(d.data.name);
    if (cellHeight > 48 && cellWidth > 72) {
      label.append("tspan")
        .attr("class", "country-value")
        .attr("x", 7)
        .attr("dy", 16)
        .text(`$${formatGDP(d.data.gdp)}B`);
    }
  });

  const areas = root.descendants().filter(d => d.depth === 2);
  const continents = root.descendants().filter(d => d.depth === 1);

  svg.append("g")
    .attr("pointer-events", "none")
    .selectAll("rect")
    .data(areas)
    .join("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", "none")
    .attr("stroke", "rgba(255,255,255,.92)")
    .attr("stroke-width", 2.2);

  svg.append("g")
    .attr("pointer-events", "none")
    .selectAll("rect")
    .data(continents)
    .join("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", "none")
    .attr("stroke", "#17221f")
    .attr("stroke-width", 3.5);

  svg.append("g")
    .selectAll("text")
    .data(continents.filter(d => d.x1 - d.x0 > 70 && d.y1 - d.y0 > 36))
    .join("text")
    .attr("class", "continent-label")
    .attr("x", d => d.x0 + 7)
    .attr("y", d => d.y0 + 18)
    .text(d => d.data.name);

  svg.append("g")
    .selectAll("text")
    .data(areas.filter(d => d.x1 - d.x0 > 82 && d.y1 - d.y0 > 30))
    .join("text")
    .attr("class", "area-label")
    .attr("x", d => d.x0 + 6)
    .attr("y", d => d.y0 + 14)
    .text(d => d.data.name);

  function highlight(event, selected) {
    groups.style("opacity", d => d.parent === selected.parent ? 1 : .22);
    d3.select(event.currentTarget).select("rect")
      .attr("stroke", "#111")
      .attr("stroke-width", 3.5);
    showTooltip(event, selected);
  }

  function reset(event) {
    groups.style("opacity", 1);
    d3.select(event.currentTarget).select("rect")
      .attr("stroke", "#fffdf8")
      .attr("stroke-width", 1.5);
    hideTooltip();
  }

  groups
    .on("mouseenter focus", highlight)
    .on("mousemove", moveTooltip)
    .on("mouseleave blur", reset);
}

d3.json("../data/lab6_assignment_gdp.json")
  .then(data => {
    renderTreemap("#treemap-squarify", data, d3.treemapSquarify, "squarify");
    renderTreemap("#treemap-slicedice", data, d3.treemapSliceDice, "slicedice");
  })
  .catch(error => {
    console.error(error);
    d3.select("#chart-error")
      .attr("hidden", null)
      .text("The GDP hierarchy could not be loaded.");
  });
