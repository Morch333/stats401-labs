"use strict";

const sentiments = ["Negative", "Neutral", "Positive"];
const colors = {
  Negative: "#c65353",
  Neutral: "#8a96a3",
  Positive: "#2f855a"
};

const svg = d3.select("#sentiment-chart");
const tooltip = d3.select("#tooltip");

function prepareData(rows) {
  const parsed = rows.map(row => ({
    airline: row.airline,
    sentiment: row.sentiment,
    count: Number(row.count),
    airlineTotal: Number(row.airline_total),
    percent: Number(row.percent),
    meanScore: Number(row.mean_score)
  }));

  const records = Array.from(
    d3.group(parsed, row => row.airline),
    ([airline, values]) => {
      const record = { airline };
      sentiments.forEach(sentiment => {
        const match = values.find(row => row.sentiment === sentiment);
        record[sentiment] = match ? match.percent : 0;
        record[`${sentiment}Count`] = match ? match.count : 0;
      });
      record.meanScore = d3.sum(
        values,
        row => row.meanScore * row.count
      ) / d3.sum(values, row => row.count);
      return record;
    }
  );

  return records.sort((a, b) => d3.descending(a.Negative, b.Negative));
}

function drawChart(data) {
  const width = 920;
  const height = 430;
  const margin = { top: 30, right: 35, bottom: 55, left: 145 };

  svg
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("aria-label", "Sentiment percentages for six airlines");

  const x = d3.scaleLinear()
    .domain([0, 100])
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(data.map(row => row.airline))
    .range([margin.top, height - margin.bottom])
    .padding(0.28);

  const stack = d3.stack().keys(sentiments);
  const series = stack(data);

  svg.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(
      d3.axisBottom(x)
        .ticks(5)
        .tickSize(-(height - margin.top - margin.bottom))
        .tickFormat("")
    );

  svg.append("g")
    .attr("class", "bars")
    .selectAll("g")
    .data(series)
    .join("g")
    .attr("fill", layer => colors[layer.key])
    .selectAll("rect")
    .data(layer => layer.map(segment => ({ ...segment, sentiment: layer.key })))
    .join("rect")
    .attr("x", segment => x(segment[0]))
    .attr("y", segment => y(segment.data.airline))
    .attr("width", segment => x(segment[1]) - x(segment[0]))
    .attr("height", y.bandwidth())
    .attr("tabindex", 0)
    .attr("aria-label", segment => {
      const percent = segment.data[segment.sentiment];
      const count = segment.data[`${segment.sentiment}Count`];
      return `${segment.data.airline}, ${segment.sentiment}: ${count} tweets, ${percent}%`;
    })
    .on("mouseenter focus", function(event, segment) {
      const percent = segment.data[segment.sentiment];
      const count = segment.data[`${segment.sentiment}Count`];
      d3.select(this).attr("stroke", "#17212b").attr("stroke-width", 2);
      tooltip
        .html(
          `<strong>${segment.data.airline}</strong><br>` +
          `${segment.sentiment}: ${count} tweets (${percent.toFixed(1)}%)`
        )
        .attr("hidden", null);
      if (event.type === "mouseenter") {
        const bounds = document.querySelector(".chart-wrap").getBoundingClientRect();
        tooltip
          .style("left", `${event.clientX - bounds.left + 12}px`)
          .style("top", `${event.clientY - bounds.top + 12}px`);
      } else {
        tooltip.style("left", "50%").style("top", "8px");
      }
    })
    .on("mouseleave blur", function() {
      d3.select(this).attr("stroke", null);
      tooltip.attr("hidden", true);
    });

  svg.append("g")
    .attr("class", "segment-labels")
    .selectAll("g")
    .data(series)
    .join("g")
    .selectAll("text")
    .data(layer => layer.map(segment => ({ ...segment, sentiment: layer.key })))
    .join("text")
    .attr("x", segment => x((segment[0] + segment[1]) / 2))
    .attr("y", segment => y(segment.data.airline) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "middle")
    .text(segment => {
      const value = segment.data[segment.sentiment];
      return value >= 11 ? `${value.toFixed(1)}%` : "";
    });

  svg.append("g")
    .attr("class", "axis y-axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call(group => group.select(".domain").remove());

  svg.append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(value => `${value}%`))
    .call(group => group.select(".domain").remove());

  svg.append("text")
    .attr("class", "axis-title")
    .attr("x", (margin.left + width - margin.right) / 2)
    .attr("y", height - 10)
    .attr("text-anchor", "middle")
    .text("Share of sampled tweets");
}

function drawTable(data) {
  const rows = d3.select("#summary-table tbody")
    .selectAll("tr")
    .data(data)
    .join("tr");

  rows.selectAll("td")
    .data(row => [
      row.airline,
      `${row.Negative.toFixed(1)}%`,
      `${row.Neutral.toFixed(1)}%`,
      `${row.Positive.toFixed(1)}%`,
      d3.format("+.3f")(row.meanScore)
    ])
    .join("td")
    .text(value => value);
}

d3.csv("../data/lab4_sentiment_by_airline.csv")
  .then(rows => {
    const data = prepareData(rows);
    drawChart(data);
    drawTable(data);
  })
  .catch(error => {
    d3.select("#chart-error")
      .attr("hidden", null)
      .text("The chart data could not be loaded.");
    console.error(error);
  });
