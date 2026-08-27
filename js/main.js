async function drawChart() {
  const container = document.querySelector("#chart");

  if (!window.d3) {
    container.setAttribute("aria-busy", "false");
    container.innerHTML = '<p class="error-message">D3.js could not be loaded. Please check your internet connection and refresh the page.</p>';
    return;
  }

  const chart = d3.select(container);

  try {
    const data = await d3.csv("../data/students.csv", d => ({
      name: d.name.trim(),
      score: +d.score
    }));

    const validData = data.filter(d => d.name && Number.isFinite(d.score));
    if (validData.length === 0) {
      throw new Error("The CSV file does not contain valid student scores.");
    }

    chart.selectAll("*").remove();

    const width = 960;
    const height = 500;
    const margin = { top: 42, right: 30, bottom: 112, left: 54 };
    const plotBottom = height - margin.bottom;

    const svg = chart
      .append("svg")
      .attr("class", "chart-svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-labelledby", "svg-title svg-description");

    svg.append("title")
      .attr("id", "svg-title")
      .text("Student score bar chart");

    svg.append("desc")
      .attr("id", "svg-description")
      .text("Eight vertical bars show student scores from 66 to 95. Higher scores produce taller bars. Each student name and score are written below the corresponding bar.");

    const x = d3.scaleBand()
      .domain(validData.map(d => d.name))
      .range([margin.left, width - margin.right])
      .padding(0.24);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([plotBottom, margin.top]);

    const guideValues = [0, 25, 50, 75, 100];

    svg.selectAll(".grid-line")
      .data(guideValues)
      .join("line")
      .attr("class", d => d === 0 ? "grid-line baseline" : "grid-line")
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .attr("y1", d => y(d))
      .attr("y2", d => y(d));

    svg.selectAll(".guide-label")
      .data(guideValues)
      .join("text")
      .attr("class", "guide-label")
      .attr("x", margin.left - 12)
      .attr("y", d => y(d) + 4)
      .text(d => d);

    const students = svg.selectAll(".student")
      .data(validData)
      .join("g")
      .attr("class", "student")
      .attr("transform", d => `translate(${x(d.name)},0)`);

    students.append("rect")
      .attr("class", "bar")
      .attr("x", 0)
      .attr("y", d => y(d.score))
      .attr("width", x.bandwidth())
      .attr("height", d => plotBottom - y(d.score))
      .attr("rx", 5)
      .attr("tabindex", 0)
      .attr("role", "graphics-symbol")
      .attr("aria-label", d => `${d.name}, score ${d.score} out of 100`)
      .append("title")
      .text(d => `${d.name}: ${d.score}`);

    students.append("text")
      .attr("class", "name-label")
      .attr("x", x.bandwidth() / 2)
      .attr("y", plotBottom + 31)
      .text(d => d.name);

    students.append("text")
      .attr("class", "score-label")
      .attr("x", x.bandwidth() / 2)
      .attr("y", plotBottom + 57)
      .text(d => `${d.score} points`);

    const highest = d3.greatest(validData, d => d.score);
    chart.append("p")
      .attr("class", "chart-summary")
      .text(`Highest score: ${highest.name}, ${highest.score} points.`);

    chart.attr("aria-busy", "false");
  } catch (error) {
    console.error("Unable to draw the student score chart:", error);
    chart
      .attr("aria-busy", "false")
      .html('<p class="error-message">The visualization could not be loaded. Please refresh the page or try again later.</p>');
  }
}

drawChart();
