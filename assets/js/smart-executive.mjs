// Executive dashboard composition for the M39 Smart Intelligence page: markup and Apache ECharts options.
// Pure and deterministic. Every figure comes from the governed models built in smart-presentation.mjs.
import { deltaBadge, esc, heatColor, priorPeriodLabel } from './smart-presentation.mjs?v=20261110c';
import { countryFlagMarkup } from './gpir-geography.mjs';

const AXIS_TEXT = '#4d5d6e';
const GRID_LINE = '#e3e6ea';
const INK = '#14243a';
const NAVY = '#1b2d52';
const SERIF = 'Georgia, "Times New Roman", serif';
const baseOption = { animationDuration: 350, textStyle: { fontFamily: 'Inter, "Segoe UI", Arial, sans-serif' }, aria: { enabled: true },
  tooltip: { confine: true, borderColor: '#d9dee5', textStyle: { color: INK, fontSize: 12 }, extraCssText: 'box-shadow:0 6px 18px rgba(16,44,75,.18);border-radius:6px;' } };
const isoDay = timestamp => new Date(timestamp).toISOString().slice(0, 10);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const icon = name => `<svg class="smx-ico" aria-hidden="true" focusable="false"><use href="#smx-ic-${esc(name)}"></use></svg>`;

const ARROWS = { up: '▲', down: '▼', flat: '–' };
export const deltaMarkup = change => {
  const badge = deltaBadge(change);
  return badge ? `<span class="smx-delta" data-direction="${badge.direction}"><i aria-hidden="true">${ARROWS[badge.direction]}</i>${esc(badge.text)}</span>` : '';
};

function spoken(item, period) {
  const badge = deltaBadge(item.change);
  return `${item.label}: ${item.value} verified developments${badge ? `, ${badge.text} ${priorPeriodLabel(period)}` : ''}`;
}

export function kpiStripMarkup({ themes, total }, { period, selected }) {
  const prior = priorPeriodLabel(period);
  const card = (item, tag, attributes) => `<${tag} class="smx-kpi" style="--kpi-color:${esc(item.color)}" ${attributes} aria-label="${esc(spoken(item, period))}${tag === 'button' ? '. Select to filter by this theme' : ''}"><span class="smx-kpi-badge">${icon(item.icon)}</span><span class="smx-kpi-body"><span class="smx-kpi-label">${esc(item.label)}</span><span class="smx-kpi-figure"><strong>${esc(item.value)}</strong><span class="smx-kpi-trend">${deltaMarkup(item.change)}<small>${esc(prior)}</small></span></span></span></${tag}>`;
  return `${themes.map(item => card(item, 'button', `type="button" data-drill-theme="${esc(item.id)}" aria-pressed="${selected.has(item.id)}"`)).join('')}<span class="smx-kpi-rule" aria-hidden="true"></span>${card(total, 'div', 'role="group"').replace('class="smx-kpi"', 'class="smx-kpi smx-kpi-total"')}`;
}

export function summaryMarkup(points) {
  return `<ul class="smx-summary-list">${points.map(point => `<li>${icon('check')}<span>${esc(point)}</span></li>`).join('')}</ul>`;
}

export function donutLegendMarkup(donut) {
  return donut.slices.map(slice => {
    const body = `<i style="--dot:${esc(slice.color)}" aria-hidden="true"></i><span>${esc(slice.label)}</span><strong>${slice.count}</strong>`;
    const label = `${slice.label}: ${plural(slice.count, 'development')} (${slice.percent}%)`;
    return slice.id === 'other-themes'
      ? `<li><span class="smx-legend-row" aria-label="${esc(label)}">${body}</span></li>`
      : `<li><button type="button" class="smx-legend-row" data-drill-theme="${esc(slice.id)}" aria-label="${esc(`${label}. Select to filter`)}">${body}</button></li>`;
  }).join('');
}

export function momentumLabelsMarkup(rows, selected) {
  return rows.map(row => `<button type="button" class="smx-mom-label" style="--theme-color:${esc(row.color)}" data-drill-theme="${esc(row.id)}" aria-pressed="${selected.has(row.id)}" aria-label="${esc(`${row.label}: ${row.current} current, ${row.previous} prior. Select to filter`)}"><span class="smx-mom-ico">${icon(row.id)}</span><span>${esc(row.label)}</span></button>`).join('');
}

export function momentumDeltasMarkup(rows) {
  return rows.map(row => `<span class="smx-mom-delta">${deltaMarkup(row.change)}</span>`).join('');
}

function intensity(count, max) {
  if (!count) return 'no activity';
  const ratio = count / max;
  return ratio < 0.34 ? 'lower relative activity' : ratio < 0.67 ? 'moderate relative activity' : 'higher relative activity';
}

const HEAT_LABELS = Object.freeze({ aml: 'AML & Fin. Crime' });

export function regionHeatmapMarkup(matrix, selected) {
  const header = `<div class="smx-heat-row" role="row"><span class="smx-heat-corner" role="presentation"></span>${matrix.regions.map(region => `<span class="smx-heat-col" role="columnheader"><abbr title="${esc(region.label)}">${esc(region.short)}</abbr></span>`).join('')}</div>`;
  const rows = matrix.themes.map((theme, row) => `<div class="smx-heat-row" role="row"><span class="smx-heat-theme" role="rowheader" title="${esc(theme.label)}">${esc(HEAT_LABELS[theme.id] || theme.short)}</span>${matrix.cells[row].map((cell, col) => {
    const region = matrix.regions[col];
    const label = `${theme.label} in ${region.label}: ${plural(cell.count, 'verified development')}, ${intensity(cell.count, matrix.max)}. Select to filter.`;
    const active = selected.themes.has(theme.id) && selected.geography === region.key;
    return `<span role="gridcell"><button type="button" class="smx-heat-cell" style="--cell:${heatColor(matrix.max ? cell.count / matrix.max : 0)}" data-heat-cell="${esc(theme.id)}|${esc(region.key)}" data-row="${row}" data-col="${col}" tabindex="${row === 0 && col === 0 ? 0 : -1}" aria-pressed="${active}" aria-label="${esc(label)}" title="${esc(`${theme.short} · ${region.label} · ${cell.count}`)}"><span>${cell.count}</span></button></span>`;
  }).join('')}</div>`).join('');
  return `<div class="smx-heat-grid" role="grid" aria-label="Relative activity by featured theme and region" aria-describedby="smx-heat-note">${header}${rows}</div>`;
}

export function timelineMarkup(events) {
  if (!events.length) return '<p class="smx-empty">No verified developments in this selection. Nothing has been inferred.</p>';
  return `<ol class="smx-tl-track">${events.map(event => `<li style="--dot:${esc(event.color)}"><i class="smx-tl-dot" aria-hidden="true"></i><time class="smx-tl-date" datetime="${esc(isoDay(Date.parse(event.publishedAt)))}"><b>${esc(event.month)}</b><span>${esc(event.day)}</span></time><div class="smx-tl-text"><a href="${esc(event.url)}" target="_blank" rel="noopener noreferrer" title="${esc(`${event.title} — ${event.sourceName}. Opens the verified source.`)}">${esc(event.title)}</a>${event.country ? `<span>${countryFlagMarkup(event.countryFlagUrl)}${esc(event.country)}</span>` : ''}<span class="smx-pill" style="--theme-color:${esc(event.color)}">${esc(event.themeLabel)}</span></div></li>`).join('')}</ol>`;
}

// ECharts options ---------------------------------------------------------------------------------

export function trendChartOption(trend) {
  const step = Math.max(1, Math.ceil(Math.max(4, trend.max) / 4));
  const last = trend.weeks.length - 1;
  return {
    ...baseOption,
    grid: { left: 2, right: 30, top: 8, bottom: 46, containLabel: true },
    legend: { bottom: 0, left: 'center', icon: 'circle', itemWidth: 9, itemHeight: 9, itemGap: 18, textStyle: { color: '#34455a', fontSize: 11.5 } },
    tooltip: { ...baseOption.tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: '#b9c2cd' } },
      formatter: params => {
        const week = trend.weeks[params[0].dataIndex];
        return `<b>Week of ${esc(isoDay(week.start))}</b>${week.inProgress ? ' (in progress)' : ''}<br/>${params.map(item => `${item.marker}${esc(item.seriesName)}: <b>${item.value}</b>`).join('<br/>')}`;
      } },
    xAxis: { type: 'category', boundaryGap: false, data: trend.weeks.map(week => week.short), axisTick: { show: false }, axisLine: { lineStyle: { color: GRID_LINE } },
      axisLabel: { interval: 0, margin: 8, formatter: (value, index) => `{w|${trend.weeks[index].short}}\n{d|${trend.weeks[index].date}}`,
        rich: { w: { color: INK, fontSize: 11.5, fontWeight: 600, lineHeight: 15 }, d: { color: AXIS_TEXT, fontSize: 10.5, lineHeight: 14 } } } },
    yAxis: { type: 'value', min: 0, max: step * 4, interval: step, axisLabel: { color: AXIS_TEXT, fontSize: 11 }, splitLine: { lineStyle: { color: GRID_LINE } } },
    series: trend.series.map(series => ({
      type: 'line', name: series.label, smooth: 0.3, cursor: 'pointer', color: series.color,
      data: series.data,
      showSymbol: true, symbol: 'circle', symbolSize: (value, params) => params.dataIndex === last ? 9 : 0,
      lineStyle: { width: 2.2, color: series.color }, itemStyle: { color: series.color, borderColor: '#fff', borderWidth: 1.5 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${series.color}33` }, { offset: 1, color: `${series.color}05` }] } },
      emphasis: { focus: 'series', lineStyle: { width: 3 } },
      markArea: series.id === trend.series[0].id && trend.weeks[last].inProgress ? { silent: true, itemStyle: { color: 'rgba(120,135,155,.12)' },
        label: { show: true, position: 'insideTop', color: AXIS_TEXT, fontSize: 10, formatter: 'Week in progress' },
        data: [[{ xAxis: trend.weeks[last - 1].short }, { xAxis: trend.weeks[last].short }]] } : undefined,
      endLabel: { show: true, formatter: '{c}', color: series.color, fontSize: 13, fontWeight: 700, distance: 6 },
      labelLayout: { moveOverlap: 'shiftY' }
    }))
  };
}

export function donutChartOption(donut) {
  return {
    ...baseOption,
    tooltip: { ...baseOption.tooltip, trigger: 'item', formatter: ({ data, percent }) => `<b>${esc(data.name)}</b><br/>${plural(data.value, 'unique development')} · ${Math.round(percent)}% (primary theme)` },
    series: [{ type: 'pie', radius: ['46%', '90%'], center: ['50%', '50%'], startAngle: 90, cursor: 'pointer', minAngle: 6, avoidLabelOverlap: false,
      itemStyle: { borderColor: '#fff', borderWidth: 2.5 },
      label: { show: true, position: 'inside', color: '#fff', fontSize: 12, fontWeight: 700, formatter: ({ percent }) => percent >= 6 ? `${Math.round(percent)}%` : '' },
      emphasis: { scaleSize: 4 },
      data: donut.slices.filter(slice => slice.count).map(slice => ({ name: slice.label, value: slice.count, id: slice.id, itemStyle: { color: slice.color } })) }]
  };
}

export function momentumChartOption(rows) {
  const max = Math.max(1, ...rows.flatMap(row => [row.current, row.previous]));
  return {
    ...baseOption,
    grid: { left: 0, right: 30, top: 0, bottom: 0 },
    tooltip: { ...baseOption.tooltip, trigger: 'axis', axisPointer: { type: 'none' },
      formatter: params => { const row = rows[params[0].dataIndex]; return `<b>${esc(row.label)}</b><br/>Current: <b>${row.current}</b><br/>Prior: ${row.previous}<br/>Change: ${esc(row.change.isNew ? `New (${row.change.deltaLabel})` : row.change.deltaLabel)}`; } },
    xAxis: { type: 'value', show: false, min: 0, max: max * 1.12 },
    yAxis: { type: 'category', inverse: true, show: false, data: rows.map(row => row.label) },
    series: [
      { type: 'bar', name: 'Current period', barWidth: 11, barGap: '12%', cursor: 'pointer', itemStyle: { color: NAVY, borderRadius: [0, 2, 2, 0] },
        data: rows.map(row => row.current), label: { show: true, position: 'right', color: INK, fontSize: 13, fontWeight: 700, distance: 6 } },
      { type: 'bar', name: 'Prior period', barWidth: 9, cursor: 'pointer', itemStyle: { color: '#d4d9e1', borderRadius: [0, 2, 2, 0] },
        data: rows.map(row => row.previous), label: { show: true, position: 'right', color: '#6b7788', fontSize: 11, distance: 5 } }
    ]
  };
}

export const mapChartOption = regional => ({ width, height }) => buildMapOption(regional, width, height);

function buildMapOption(regional, width, height) {
  const mapWidth = Math.round(Math.min(width * 0.78, height * 2.05));
  const scale = Math.min(1, mapWidth / 295);
  const sizeOf = region => 11 + Math.round(region.share * 14);
  return {
    ...baseOption,
    tooltip: { ...baseOption.tooltip, trigger: 'item',
      formatter: ({ data }) => `<b>${esc(data.label)}</b><br/>${plural(data.count, 'verified development')} · ${data.percent}% of ${regional.mapped} with verified geography` },
    geo: { map: 'gpir-world', roam: false, silent: true, aspectScale: 1, layoutCenter: ['50%', '56%'], layoutSize: mapWidth,
      itemStyle: { areaColor: '#e4d6b8', borderColor: '#d8c8a2', borderWidth: 0.6 } },
    series: [{
      type: 'scatter', coordinateSystem: 'geo', cursor: 'pointer', zlevel: 2,
      data: regional.regions.map(region => ({
        name: region.label, label: region.label, key: region.key, count: region.count, percent: region.percent, value: [...region.anchor, region.percent],
        symbolSize: sizeOf(region), itemStyle: { color: region.count ? region.color : '#fff', borderColor: region.count ? '#fff' : region.color, borderWidth: 2.5, shadowBlur: 8, shadowColor: `${region.color}66` },
        label: { show: true, position: 'inside', offset: region.offset.map(value => Math.round(value * scale)), formatter: `{n|${region.label}}\n{v|${region.percent}%}`,
          backgroundColor: '#fff', borderColor: region.color, borderWidth: 1.2, borderRadius: 4, padding: [3, 8], shadowBlur: 8, shadowColor: 'rgba(16,44,75,.14)',
          rich: { n: { color: INK, fontSize: 10, fontWeight: 600, lineHeight: 13, align: 'center' }, v: { color: region.color, fontSize: 15, fontWeight: 700, fontFamily: SERIF, lineHeight: 18, align: 'center' } } }
      }))
    }]
  };
}

// Keyboard and screen-reader access to canvas charts: ordered points with a spoken label.
export function trendPoints(trend) {
  return trend.series.flatMap((series, seriesIndex) => trend.weeks.map((week, dataIndex) => ({
    seriesIndex, dataIndex, label: `${series.label}, week of ${isoDay(week.start)}${week.inProgress ? ' (in progress)' : ''}: ${plural(series.data[dataIndex], 'verified development')}`
  })));
}

export const donutPoints = donut => donut.slices.filter(slice => slice.count).map((slice, dataIndex) => ({
  seriesIndex: 0, dataIndex, label: `${slice.label}: ${plural(slice.count, 'unique development')}, ${slice.percent}%`
}));

export const momentumPoints = rows => rows.map((row, dataIndex) => ({
  seriesIndex: 0, dataIndex, label: `${row.label}: ${row.current} current, ${row.previous} prior, ${row.change.isNew ? 'new' : row.change.deltaLabel}`
}));

export const mapPoints = regional => regional.regions.map((region, dataIndex) => ({
  seriesIndex: 0, dataIndex, label: `${region.label}: ${region.percent}% of developments with verified geography (${region.count})`
}));
