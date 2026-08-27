const chartContainer = document.querySelector("#lab2-chart");
const tooltip = d3.select("#tooltip");

const showTooltip = (event, d) => {
  tooltip
    .attr("aria-hidden", "false")
    .classed("visible", true)
    .html(`
      <strong>${d.city}</strong>
      <span>Population: ${d.population.toFixed(1)} million</span>
      <span>Temperature: ${d.temp_c.toFixed(1)}°C</span>
      <span>Development: ${d.development_level}</span>
      <span>Region: ${d.region}</span>
    `);

  if (event?.clientX !== undefined) {
    tooltip
      .style("left", `${Math.min(event.clientX + 16, window.innerWidth - 240)}px`)
      .style("top", `${Math.max(event.clientY - 34, 12)}px`);
  }
};

const hideTooltip = () => {
  tooltip
    .attr("aria-hidden", "true")
    .classed("visible", false);
};

async function drawMultivariateChart() {
  if (!window.d3) {
    chartContainer.setAttribute("aria-busy", "false");
    chartContainer.innerHTML = '<p class="error-message">D3.js could not be loaded. Please check your internet connection and refresh the page.</p>';
    return;
  }

  try {
    const data = await d3.csv("../data/cities_multivariate.csv", d => ({
      city: d.city.trim(),
      population: +d.population,
      temp_c: +d.temp_c,
      development_level: d.development_level.trim(),
      region: d.region.trim()
    }));

    const requiredLevels = new Set(["Low", "Medium", "High"]);
    const requiredRegions = new Set(["North", "South", "East", "West"]);
    const validData = data.filter(d =>
      d.city &&
      Number.isFinite(d.population) &&
      Number.isFinite(d.temp_c) &&
      requiredLevels.has(d.development_level) &&
      requiredRegions.has(d.region)
    );

    if (validData.length !== 12) {
      throw new Error("The city dataset is missing required records or values.");
    }

    const width = 1080;
    const height = 690;
    const panelWidth = 505;
    const panelHeight = 282;
    const panelGapX = 30;
    const panelGapY = 32;
    const chartTop = 28;
    const chartLeft = 20;
    const regionOrder = ["North", "South", "East", "West"];

    const populationScale = d3.scaleLinear()
      .domain([0, 3.5])
      .range([116, panelWidth - 34]);

    const temperatureScale = d3.scaleSequential()
      .domain(d3.extent(validData, d => d.temp_c))
      .interpolator(d3.interpolateRgbBasis(["#2f6db2", "#f4d35e", "#d4543f"]))
      .clamp(true);

    const developmentScale = d3.scaleOrdinal()
      .domain(["Low", "Medium", "High"])
      .range([7, 10.5, 14]);

    chartContainer.replaceChildren();

    const svg = d3.select(chartContainer)
      .append("svg")
      .attr("class", "lab2-svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-labelledby", "lab2-svg-title lab2-svg-description");

    svg.append("title")
      .attr("id", "lab2-svg-title")
      .text("Four-dimensional city lollipop chart");

    svg.append("desc")
      .attr("id", "lab2-svg-description")
      .text("Cities are grouped into four regional panels. Horizontal position represents population, marker color represents temperature, and marker size represents development level.");

    const panels = svg.selectAll(".region-panel")
      .data(regionOrder)
      .join("g")
      .attr("class", "region-panel")
      .attr("transform", (region, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        return `translate(${chartLeft + column * (panelWidth + panelGapX)}, ${chartTop + row * (panelHeight + panelGapY)})`;
      });

    panels.append("rect")
      .attr("class", "facet-panel")
      .attr("width", panelWidth)
      .attr("height", panelHeight)
      .attr("rx", 16);

    panels.append("text")
      .attr("class", "facet-title")
      .attr("x", 24)
      .attr("y", 34)
      .text(region => region);

    panels.each(function(region) {
      const panel = d3.select(this);
      const regionData = validData
        .filter(d => d.region === region)
        .sort((a, b) => d3.descending(a.population, b.population));

      const cityScale = d3.scalePoint()
        .domain(regionData.map(d => d.city))
        .range([78, 202])
        .padding(0.35);

      const tickValues = [0, 1, 2, 3];

      panel.selectAll(".population-grid")
        .data(tickValues)
        .join("line")
        .attr("class", "population-grid")
        .attr("x1", d => populationScale(d))
        .attr("x2", d => populationScale(d))
        .attr("y1", 58)
        .attr("y2", 222);

      panel.append("g")
        .attr("class", "population-axis")
        .attr("transform", "translate(0, 226)")
        .call(
          d3.axisBottom(populationScale)
            .tickValues(tickValues)
            .tickFormat(d => `${d}M`)
            .tickSizeOuter(0)
        );

      panel.append("text")
        .attr("class", "axis-title")
        .attr("x", (116 + panelWidth - 34) / 2)
        .attr("y", 272)
        .text("Population (millions)");

      panel.selectAll(".city-label")
        .data(regionData)
        .join("text")
        .attr("class", "city-label")
        .attr("x", 100)
        .attr("y", d => cityScale(d.city) + 4)
        .text(d => d.city);

      panel.selectAll(".lollipop-stem")
        .data(regionData)
        .join("line")
        .attr("class", "lollipop-stem")
        .attr("x1", populationScale(0))
        .attr("x2", d => populationScale(d.population))
        .attr("y1", d => cityScale(d.city))
        .attr("y2", d => cityScale(d.city));

      panel.selectAll(".city-marker")
        .data(regionData)
        .join("circle")
        .attr("class", "city-marker")
        .attr("cx", d => populationScale(d.population))
        .attr("cy", d => cityScale(d.city))
        .attr("r", d => developmentScale(d.development_level))
        .attr("fill", d => temperatureScale(d.temp_c))
        .attr("tabindex", 0)
        .attr("role", "graphics-symbol")
        .attr("aria-label", d => `${d.city}: population ${d.population} million, temperature ${d.temp_c} degrees Celsius, ${d.development_level} development, ${d.region} region`)
        .on("mouseenter", function(event, d) {
          d3.select(this).classed("active", true);
          showTooltip(event, d);
        })
        .on("mousemove", showTooltip)
        .on("mouseleave", function() {
          d3.select(this).classed("active", false);
          hideTooltip();
        })
        .on("focus", function(event, d) {
          d3.select(this).classed("active", true);
          showTooltip(null, d);
          tooltip.style("left", "24px").style("top", "24px");
        })
        .on("blur", function() {
          d3.select(this).classed("active", false);
          hideTooltip();
        })
        .append("title")
        .text(d => `${d.city}: ${d.population}M people, ${d.temp_c}°C, ${d.development_level}, ${d.region}`);
    });

    const largestCity = d3.greatest(validData, d => d.population);
    const warmestCity = d3.greatest(validData, d => d.temp_c);
    d3.select("#data-summary").html(
      `<strong>${largestCity.city}</strong> has the largest population (${largestCity.population.toFixed(1)}M), while <strong>${warmestCity.city}</strong> is the warmest (${warmestCity.temp_c.toFixed(1)}°C).`
    );

    chartContainer.setAttribute("aria-busy", "false");
  } catch (error) {
    console.error("Unable to draw the Lab 2 visualization:", error);
    chartContainer.setAttribute("aria-busy", "false");
    chartContainer.innerHTML = '<p class="error-message">The city visualization could not be loaded. Please refresh the page or try again later.</p>';
  }
}

drawMultivariateChart();
