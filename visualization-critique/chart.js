'use strict';
(async function () {
  const error = document.querySelector('#chart-error');
  try {
    if (!window.d3) throw new Error('The local D3 library could not be loaded.');
    const [troops, temps, cities] = await Promise.all([
      d3.csv('data/troops.csv', d3.autoType),
      d3.csv('data/temperature.csv', d3.autoType),
      d3.csv('data/cities.csv', d3.autoType)
    ]);
    if (troops.length !== 51 || temps.length !== 9 || cities.length !== 20) throw new Error('Unexpected dataset size.');
    const count = d3.format(',');
    const number = d3.format('~g');
    const colors = {A: '#a34e27', R: '#176880'};
    const names = {A: 'Advance →', R: '← Retreat'};
    const svg = d3.select('#redesign-chart');
    const W = 1050, H = 625, left = 76, right = 978;
    const x = d3.scaleLinear().domain([23.7,38.1]).range([left,right]);
    const yt = d3.scaleLinear().domain([-40,5]).range([555,435]);
    const detail = document.querySelector('#point-detail');
    const defaultDetail = 'Hover over or focus a point for its exact value. Use Tab to move between observations.';
    const dates = d => d.date ? `${d.date.slice(0,3)} ${Number(d.date.slice(3))}` : 'Date not recorded';
    const say = message => { detail.textContent = message; };
    const selectedNames = new Set(['Kowno','Witebsk','Smolensk','Moscou']);
    function render() {
      const group = Number(document.querySelector('#group-select').value);
      const data = troops.filter(d => d.group === group);
      const advance = data.filter(d => d.direction === 'A');
      const retreat = data.filter(d => d.direction === 'R');
      const start = advance[0], turn = advance.at(-1), end = retreat.at(-1);
      document.querySelector('#metric-start').textContent = count(start.survivors);
      document.querySelector('#metric-turn').textContent = count(turn.survivors);
      document.querySelector('#metric-end').textContent = count(end.survivors);
      document.querySelector('#turn-label').textContent = group === 1 ? 'Last advance record · near Moscow' : 'Last advance record · turnaround';
      document.querySelector('#chart-group-name').textContent = `Troop counts · route group ${group}`;
      document.querySelector('#scale-note').textContent = `Route group ${group} only. The troop axis rescales for each group; use the numbers to compare groups.`;
      const y = d3.scaleLinear().domain([0,d3.max(data,d => d.survivors)*1.06]).nice().range([315,62]);
      svg.selectAll('*').remove();
      svg.append('title').attr('id','chart-title').text(`Troop counts for route group ${group} and retreat temperatures by longitude`);
      svg.append('desc').attr('id','chart-desc').text('The upper chart uses a zero-based troop-count axis. Solid rust lines show the advance; dashed blue lines show the retreat. The lower chart shows nine temperature observations in Celsius. Both panels use longitude, not time, on the horizontal axis. A data table follows.');
      const grid = svg.append('g').attr('class','grid');
      grid.attr('transform',`translate(${left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(right-left)).tickFormat(''));
      svg.append('g').attr('class','axis').attr('transform',`translate(${left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => d ? `${number(d/1000)}k` : '0'));
      svg.append('text').attr('class','chart-title').attr('x',left).attr('y',25).text('Troops recorded');
      svg.append('text').attr('x',right).attr('y',25).attr('text-anchor','end').text('Advance: west → east   /   Retreat: east → west');
      const guides = svg.append('g');
      cities.filter(d => selectedNames.has(d.city)).forEach(d => {
        guides.append('line').attr('x1',x(d.long)).attr('x2',x(d.long)).attr('y1',43).attr('y2',555).attr('stroke','#dce4e4').attr('stroke-dasharray','3,5');
        guides.append('text').attr('x',x(d.long)).attr('y',345).attr('text-anchor',d.city === 'Kowno' ? 'start' : 'middle').text(d.city === 'Moscou' ? 'Moscow' : d.city);
      });
      const line = d3.line().x(d => x(d.long)).y(d => y(d.survivors));
      for (const dir of ['A','R']) {
        const points = data.filter(d => d.direction === dir);
        svg.append('path').datum(points).attr('d',line).attr('fill','none').attr('stroke',colors[dir]).attr('stroke-width',2.7).attr('stroke-dasharray',dir === 'R' ? '7,4' : null);
        const marks = svg.append('g').selectAll('circle').data(points).join('circle')
          .attr('class','point troop-point').attr('cx',d => x(d.long)).attr('cy',d => y(d.survivors)).attr('r',4)
          .attr('fill',dir === 'A' ? colors[dir] : '#fff').attr('stroke',colors[dir]).attr('stroke-width',1.8)
          .attr('tabindex',0).attr('role','img').attr('aria-label',d => `Group ${group}, ${dir === 'A' ? 'advance' : 'retreat'}, ${d.long} degrees east, ${count(d.survivors)} troops`);
        marks.on('mouseenter focus',(_,d) => say(`Group ${group} · ${dir === 'A' ? 'Advance' : 'Retreat'} · ${d.long}° E, ${d.lat}° N · ${count(d.survivors)} troops recorded`))
          .on('mouseleave blur',() => say(defaultDetail));
        marks.append('title').text(d => `${count(d.survivors)} troops at ${d.long}° E`);
      }
      const labels = [{d:start,dy:-13,anchor:'start'},{d:turn,dy:-15,anchor:'end'},{d:end,dy:group === 3 ? 20 : -14,anchor:'start'}];
      labels.forEach(({d,dy,anchor}) => svg.append('text').attr('x',x(d.long)).attr('y',y(d.survivors)+dy).attr('text-anchor',anchor).style('fill',colors[d.direction]).style('font-weight',700).style('paint-order','stroke').style('stroke','white').style('stroke-width','4px').text(count(d.survivors)));
      svg.append('g').attr('class','axis').attr('transform','translate(0,315)').call(d3.axisBottom(x).tickValues([24,26,28,30,32,34,36,38]).tickFormat(d=>`${d}° E`));
      svg.append('line').attr('x1',left).attr('x2',right).attr('y1',383).attr('y2',383).attr('stroke','#d9dfdc');
      svg.append('text').attr('class','chart-title').attr('x',left).attr('y',412).text('Temperature during the retreat · °C');
      svg.append('text').attr('x',right).attr('y',412).attr('text-anchor','end').text('Same nine observations for every route group');
      svg.append('g').attr('class','grid').attr('transform',`translate(${left},0)`).call(d3.axisLeft(yt).tickValues([0,-10,-20,-30,-40]).tickSize(-(right-left)).tickFormat(''));
      svg.append('g').attr('class','axis').attr('transform',`translate(${left},0)`).call(d3.axisLeft(yt).tickValues([0,-10,-20,-30,-40]));
      const tline = d3.line().x(d => x(d.long)).y(d => yt(d.temp*1.25));
      svg.append('path').datum(temps).attr('d',tline).attr('fill','none').attr('stroke','#566e77').attr('stroke-width',2);
      const tmarks = svg.append('g').selectAll('circle').data(temps).join('circle').attr('class','point temp-point').attr('cx',d => x(d.long)).attr('cy',d => yt(d.temp*1.25)).attr('r',4).attr('fill','#566e77').attr('stroke','white').attr('stroke-width',1)
        .attr('tabindex',0).attr('role','img').attr('aria-label',d => `${dates(d)}, ${number(d.temp*1.25)} degrees Celsius, ${d.long} degrees east`)
        .on('mouseenter focus',(_,d) => say(`Retreat temperature · ${dates(d)} · ${d.long}° E · ${number(d.temp*1.25)} °C (${d.temp} °Ré)`))
        .on('mouseleave blur',() => say(defaultDetail));
      tmarks.append('title').text(d => `${dates(d)}: ${number(d.temp*1.25)} °C`);
      for (const d of temps.filter(d => ['Oct18','Nov14','Dec06'].includes(d.date))) {
        svg.append('text').attr('x',x(d.long)+(d.date === 'Dec06' ? 8 : 0)).attr('y',yt(d.temp*1.25)-12).attr('text-anchor',d.date === 'Oct18' ? 'end' : d.date === 'Dec06' ? 'start' : 'middle').style('font-size','11px').style('paint-order','stroke').style('stroke','white').style('stroke-width','4px').text(`${dates(d)} · ${number(d.temp*1.25)} °C`);
      }
      svg.append('g').attr('class','axis').attr('transform','translate(0,555)').call(d3.axisBottom(x).tickValues([24,26,28,30,32,34,36,38]).tickFormat(d=>`${d}° E`));
      svg.append('text').attr('x',(left+right)/2).attr('y',606).attr('text-anchor','middle').text('Longitude · shared location axis, not elapsed time');
      const rows = d3.select('#troop-table-body').selectAll('tr').data(data).join('tr');
      rows.selectAll('td').data(d => [d.rownames,names[d.direction],`${d.long}° E`,`${d.lat}° N`,count(d.survivors)]).join('td').text(d => d);
      document.querySelector('#table-caption').textContent = `Route group ${group}: ${data.length} records, in source order.`;
      say(defaultDetail);
      window.assignmentState = {group,troopRecords:troops.length,temperatureRecords:temps.length,displayedRecords:data.length};
    }
    d3.select('#temp-table-body').selectAll('tr').data(temps).join('tr').selectAll('td').data(d => [dates(d),`${d.long}° E`,d.temp,number(d.temp*1.25)]).join('td').text(d => d);
    document.querySelector('#group-select').addEventListener('change',render);
    render();
    document.querySelector('#loading').hidden = true;
  } catch (e) {
    document.querySelector('#loading').hidden = true;
    error.hidden = false;
    error.textContent = `Unable to load the interactive chart: ${e.message} Open this page through a web server or GitHub Pages. The report, screenshot and CSV files remain available below.`;
    console.error(e);
  }
})();
