const API_PATH = '/functions/v1/gpir-reader-summary';
const DISCLAIMER = 'GPIR FX Intelligence is for research and information only. Reference rates are indicative, not transaction quotes. Historical performance does not predict future movements. Not financial advice.';
const PERIODS = Object.freeze([
  Object.freeze({ id: 'W', label: 'Weekly', months: null, days: 7 }),
  Object.freeze({ id: 'M', label: 'Monthly', months: 1 }),
  Object.freeze({ id: 'Q', label: 'Quarterly', months: 3 }),
  Object.freeze({ id: 'Y', label: 'Yearly', months: 12 }),
  Object.freeze({ id: '5Y', label: 'Five Years', months: 60 }),
  Object.freeze({ id: 'MAX', label: 'Maximum Available History', months: null })
]);
const CACHE_TTL_MS = 60 * 1000;
const RESPONSE_CACHE_MAX_ENTRIES = 24;
const responseCache = new Map();
const pendingRequests = new Map();
let responseCacheGeneration = 0;

export function normalizeFxPair(base, quote) {
  const first = typeof base === 'string' ? base.trim().toUpperCase() : '';
  const second = typeof quote === 'string' ? quote.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(first) && /^[A-Z]{3}$/.test(second) && first !== second
    ? Object.freeze({ base: first, quote: second }) : null;
}

function sortedPoints(points) {
  if (!Array.isArray(points)) return [];
  return points.filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point?.date || '') &&
    Number.isFinite(point.rate) && point.rate > 0)
    .map(point => Object.freeze({ date: point.date, rate: point.rate }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function subtractPeriod(date, period) {
  const result = new Date(`${date}T00:00:00.000Z`);
  if (period.days) result.setUTCDate(result.getUTCDate() - period.days);
  else {
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() - period.months);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(),
      result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
  }
  return result.toISOString().slice(0, 10);
}

export function pointsForPeriod(points, periodId, anchorDate = points.at(-1)?.date) {
  const period = PERIODS.find(item => item.id === periodId);
  const ordered = sortedPoints(points);
  if (!period || !anchorDate || !ordered.length) return [];
  if (period.id === 'MAX') return ordered;
  const start = subtractPeriod(anchorDate, period);
  return ordered.filter(point => point.date >= start && point.date <= anchorDate);
}

function sampleVolatility(returns) {
  if (returns.length < 20) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (returns.length - 1);
  return Math.sqrt(variance * 252) * 100;
}

export function calculateMetrics(input) {
  const points = sortedPoints(input);
  if (points.length < 2) return Object.freeze({ status: 'INSUFFICIENT_OBSERVATIONS',
    observations: points.length });
  const first = points[0];
  const latest = points[points.length - 1];
  const rates = points.map(point => point.rate);
  const returns = rates.slice(1).map((rate, index) => Math.log(rate / rates[index]));
  const high = points.reduce((best, point) => point.rate > best.rate ? point : best);
  const low = points.reduce((best, point) => point.rate < best.rate ? point : best);
  const percentile = rates.filter(rate => rate <= latest.rate).length / rates.length * 100;
  const positive = returns.filter(value => value > 0).length;
  const negative = returns.filter(value => value < 0).length;
  const flat = returns.length - positive - negative;

  return Object.freeze({
    status: 'AVAILABLE',
    observations: points.length,
    first, latest, high, low,
    change: latest.rate - first.rate,
    changePercent: (latest.rate / first.rate - 1) * 100,
    returns: Object.freeze(returns),
    annualizedVolatility: sampleVolatility(returns),
    movingAverages: Object.freeze(Object.fromEntries([20, 50, 200].map(windowSize => [
      windowSize, points.length >= windowSize
        ? rates.slice(-windowSize).reduce((sum, rate) => sum + rate, 0) / windowSize : null
    ]))),
    historicalPercentile: percentile,
    distribution: Object.freeze({ positive, negative, flat, observations: returns.length })
  });
}

export function previousPeriodPoints(points, periodId, anchorDate = points.at(-1)?.date) {
  const period = PERIODS.find(item => item.id === periodId);
  if (!period || period.id === 'MAX' || !anchorDate) return [];
  const currentStart = subtractPeriod(anchorDate, period);
  const previousEnd = new Date(`${currentStart}T00:00:00.000Z`);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousAnchor = previousEnd.toISOString().slice(0, 10);
  const previousStart = subtractPeriod(previousAnchor, period);
  return sortedPoints(points).filter(point =>
    point.date >= previousStart && point.date <= previousAnchor);
}

function chartSample(points, maxBuckets = 120) {
  if (points.length <= maxBuckets * 4) return points;
  const bucketSize = Math.ceil(points.length / maxBuckets);
  const selected = new Set([0, points.length - 1]);
  for (let start = 0; start < points.length; start += bucketSize) {
    const end = Math.min(points.length, start + bucketSize);
    let lowIndex = start;
    let highIndex = start;
    for (let index = start + 1; index < end; index++) {
      if (points[index].rate < points[lowIndex].rate) lowIndex = index;
      if (points[index].rate > points[highIndex].rate) highIndex = index;
    }
    selected.add(start);
    selected.add(end - 1);
    selected.add(lowIndex);
    selected.add(highIndex);
  }
  return [...selected].sort((left, right) => left - right).map(index => points[index]);
}

export function comparableRateObservation(points, currentRate, tolerancePercent = 1) {
  if (!Number.isFinite(currentRate) || currentRate <= 0) return null;
  const ordered = sortedPoints(points);
  for (let index = ordered.length - 2; index >= 0; index--) {
    const point = ordered[index];
    if (Math.abs(point.rate / currentRate - 1) * 100 <= tolerancePercent) return point;
  }
  return null;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function number(value, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits
  }) : 'Unavailable';
}

function percent(value) {
  if (!Number.isFinite(value)) return 'Unavailable';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function rateDigits(pair) {
  return pair.quote === 'JPY' ? 3 : 5;
}

function rateText(value, pair) {
  return Number.isFinite(value) ? number(value, rateDigits(pair)) : 'Unavailable';
}

function sourceCurrencyOptions(currencies, selected) {
  const entries = Object.entries(currencies || {})
    .map(([code, currency]) => [code,
      typeof currency === 'string' ? currency : currency?.name])
    .filter(([code, name]) => /^[A-Z]{3}$/.test(code) && typeof name === 'string')
    .sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) return `<option value="${escapeHtml(selected)}">${escapeHtml(selected)}</option>`;
  return entries.map(([code, name]) => `<option value="${escapeHtml(code)}"${code === selected ? ' selected' : ''}>${escapeHtml(code)} · ${escapeHtml(name)}</option>`).join('');
}

function chartSvg(points, previousMetrics, pair, allPoints) {
  if (points.length < 2) return '<p class="fxi-unavailable">A trend chart requires at least two source observations in this period.</p>';
  const width = 900;
  const height = 265;
  const margin = { top: 20, right: 24, bottom: 34, left: 80 };
  const indexByDate = new Map(allPoints.map((point, index) => [point.date, index]));
  const averages = [20, 50, 200].map(windowSize => {
    const values = [];
    points.forEach((point, index) => {
      const sourceIndex = indexByDate.get(point.date);
      if (sourceIndex < windowSize - 1) return;
      const window = allPoints.slice(sourceIndex - windowSize + 1, sourceIndex + 1);
      if (window.length === windowSize)
        values.push({ date: point.date,
          rate: window.reduce((sum, item) => sum + item.rate, 0) / windowSize });
    });
    return { windowSize, values };
  });
  const previous = previousMetrics?.status === 'AVAILABLE' ? previousMetrics.latest.rate : null;
  const plottedValues = [...points.map(point => point.rate),
    ...averages.flatMap(series => series.values.map(item => item.rate)),
    ...(Number.isFinite(previous) ? [previous] : [])];
  const min = Math.min(...plottedValues);
  const max = Math.max(...plottedValues);
  const span = max - min || max * 0.02;
  const x = index => margin.left + index / (points.length - 1) * (width - margin.left - margin.right);
  const y = value => margin.top + (max + span * 0.08 - value) /
    (span * 1.16) * (height - margin.top - margin.bottom);
  const path = points.map((point, index) =>
    `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(point.rate).toFixed(2)}`).join(' ');
  const dots = points.map((point, index) =>
    `<circle cx="${x(index).toFixed(2)}" cy="${y(point.rate).toFixed(2)}" r="2.1"><title>${escapeHtml(point.date)} · ${escapeHtml(rateText(point.rate, pair))}</title></circle>`).join('');
  const visibleIndexByDate = new Map(points.map((point, index) => [point.date, index]));
  const averageLines = averages.map(series => series.values.length > 1
    ? `<polyline class="fxi-average-line fxi-average-${series.windowSize}" points="${series.values.map(item => `${x(visibleIndexByDate.get(item.date)).toFixed(2)},${y(item.rate).toFixed(2)}`).join(' ')}"><title>${series.windowSize}-observation moving average using observed fixings</title></polyline>`
    : '').join('');
  const previousLine = Number.isFinite(previous)
    ? `<line class="fxi-previous-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(previous).toFixed(2)}" y2="${y(previous).toFixed(2)}"><title>Previous-period close ${escapeHtml(rateText(previous, pair))}</title></line>` : '';
  return `<svg class="fxi-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(pair.base)}/${escapeHtml(pair.quote)} observed reference rates over time">
    <line class="fxi-axis" x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}"></line>
    <line class="fxi-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${y(min).toFixed(2)}" y2="${y(min).toFixed(2)}"></line>
    <line class="fxi-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${y(max).toFixed(2)}" y2="${y(max).toFixed(2)}"></line>
    <text class="fxi-axis-label" x="8" y="${y(max).toFixed(2)}">${escapeHtml(rateText(max, pair))}</text>
    <text class="fxi-axis-label" x="8" y="${y(min).toFixed(2)}">${escapeHtml(rateText(min, pair))}</text>
    ${averageLines}${previousLine}<path class="fxi-rate-line" d="${path}"></path><g class="fxi-rate-dots">${dots}</g>
    <text class="fxi-date-label" x="${margin.left}" y="${height - 8}">${escapeHtml(points[0].date)}</text>
    <text class="fxi-date-label" x="${width - margin.right}" y="${height - 8}" text-anchor="end">${escapeHtml(points.at(-1).date)}</text>
  </svg>`;
}

function periodMetrics(points, period, anchorDate) {
  return calculateMetrics(pointsForPeriod(points, period.id, anchorDate));
}

function formatMetric(value, pair) {
  return value?.status === 'AVAILABLE' ? percent(value.changePercent) : 'Unavailable';
}

function rangeLadder(points, anchorDate, pair) {
  return PERIODS.map(period => {
    const metrics = periodMetrics(points, period, anchorDate);
    const label = period.id === 'MAX' ? 'Maximum available' : period.label;
    return `<article class="fxi-range-row"><strong>${escapeHtml(label)}</strong><span>${metrics.status === 'AVAILABLE' ? `${escapeHtml(rateText(metrics.low.rate, pair))} – ${escapeHtml(rateText(metrics.high.rate, pair))}` : 'Unavailable'}</span><span class="${metrics.status === 'AVAILABLE' ? metrics.changePercent >= 0 ? 'fxi-up' : 'fxi-down' : ''}">${escapeHtml(formatMetric(metrics, pair))}</span><small>${metrics.status === 'AVAILABLE' ? `${escapeHtml(metrics.low.date)} → ${escapeHtml(metrics.high.date)} · ${metrics.observations} fixings` : 'Insufficient observations'}</small></article>`;
  }).join('');
}

function movementHeatmap(points) {
  const recent = points.slice(-60);
  if (recent.length < 2) return '<p class="fxi-unavailable">Daily movement distribution is unavailable until at least two fixings exist.</p>';
  return `<div class="fxi-heatmap" aria-label="Daily movement symbols: blue upward, orange downward, grey flat">${recent.map((point, index) => {
    if (index === 0) return `<span class="fxi-heat fxi-flat" title="${escapeHtml(point.date)} · reference fixing">•</span>`;
    const delta = point.rate - recent[index - 1].rate;
    const state = delta > 0 ? 'fxi-up' : delta < 0 ? 'fxi-down' : 'fxi-flat';
    const symbol = delta > 0 ? '↑' : delta < 0 ? '↓' : '•';
    return `<span class="fxi-heat ${state}" title="${escapeHtml(point.date)} · ${symbol} ${escapeHtml(percent((point.rate / recent[index - 1].rate - 1) * 100))}">${symbol}</span>`;
  }).join('')}</div>`;
}

function previousLabel(current, previous) {
  if (current.status !== 'AVAILABLE' || previous.status !== 'AVAILABLE')
    return 'Previous-period comparison unavailable: insufficient source observations.';
  const delta = current.changePercent - previous.changePercent;
  return `Current ${percent(current.changePercent)} vs previous ${percent(previous.changePercent)} (${percent(delta)} percentage-point difference).`;
}

function buildCardMarkup(history, capture, captureStatus, selectedPeriod, amount) {
  const pair = normalizeFxPair(...history.pair.split('/'));
  const allPoints = sortedPoints(history.points);
  const anchor = history.lastFixingDate;
  const selectedPoints = pointsForPeriod(allPoints, selectedPeriod, anchor);
  const plottedPoints = chartSample(selectedPoints);
  const metrics = calculateMetrics(selectedPoints);
  const previousPoints = previousPeriodPoints(allPoints, selectedPeriod, anchor);
  const previousMetrics = calculateMetrics(previousPoints);
  const allFiveYears = pointsForPeriod(allPoints, '5Y', anchor);
  const fiveYearMetrics = calculateMetrics(allFiveYears);
  const latest = allPoints.at(-1);
  const currentRate = latest?.rate;
  const closeObservation = comparableRateObservation(allPoints, currentRate);
  const conversion = Number.isFinite(amount) && amount >= 0 && Number.isFinite(currentRate)
    ? amount * currentRate : null;
  const trend = metrics.status === 'AVAILABLE'
    ? metrics.changePercent > 0 ? '↑ Appreciated' : metrics.changePercent < 0 ? '↓ Depreciated' : '• Unchanged'
    : 'Trend unavailable';
  const movementBrief = metrics.status === 'AVAILABLE'
    ? `${pair.base} ${metrics.changePercent > 0 ? 'strengthened' : metrics.changePercent < 0 ? 'weakened' : 'was unchanged'} against ${pair.quote} by ${percent(metrics.changePercent)} over the selected observations. ${metrics.annualizedVolatility == null ? 'Annualised volatility is unavailable with fewer than 20 daily returns.' : `Annualised realised volatility: ${number(metrics.annualizedVolatility, 2)}%.`}`
    : 'Movement and volatility are unavailable because this period does not contain enough observations.';
  const crossBorderBrief = metrics.status === 'AVAILABLE' && Number.isFinite(amount)
    ? `A ${number(amount, 0)} ${pair.base} reference conversion changed by ${number(amount * metrics.change, 2)} ${pair.quote} between the first and latest selected fixings. This is a computed reference comparison, not a remittance quote.`
    : 'Computed cross-border conversion comparison unavailable: insufficient observations or invalid amount.';
  const historyBrief = metrics.status === 'AVAILABLE'
    ? `The selected period contains ${metrics.observations} observed fixings. The latest fixing is at the ${number(metrics.historicalPercentile, 0)}th percentile of this period's observed rates. This describes history only; it is not a forecast.`
    : 'Historical interpretation unavailable: insufficient source observations.';
  const archiveText = captureStatus === 'AVAILABLE' && capture
    ? `Latest GPIR capture: ${escapeHtml(capture.capturedAt)} · ${escapeHtml(capture.source)} · ${escapeHtml(rateText(capture.rate, pair))} (separate capture series).`
    : 'No validated GPIR capture is currently available for this pair.';
  const peerHtml = history.peerStatus === 'AVAILABLE' && history.peerComparisons.length
    ? `<div class="fxi-peer-grid">${history.peerComparisons.map(peer => `<div><strong>${escapeHtml(peer.pair)}</strong><span>${escapeHtml(rateText(peer.rate, normalizeFxPair(...peer.pair.split('/'))))}</span><small>Computed from same-date common EUR reference fixings · ${escapeHtml(peer.date)}</small></div>`).join('')}</div>`
    : '<p class="fxi-unavailable">Same-date validated peer observations are unavailable.</p>';
  const comparableText = closeObservation
    ? `${closeObservation.date} · ${rateText(closeObservation.rate, pair)} (within 1% of latest)`
    : 'No earlier fixing is within 1% of the latest rate.';
  const periodButtons = PERIODS.map(period => `<button type="button" class="fxi-period${period.id === selectedPeriod ? ' is-selected' : ''}" data-period="${period.id}" aria-pressed="${period.id === selectedPeriod}">${escapeHtml(period.label)}</button>`).join('');
  const activeChange = metrics.status === 'AVAILABLE' ? percent(metrics.changePercent) : 'Unavailable';
  const currentVolatility = metrics.annualizedVolatility == null
    ? 'Unavailable' : `${number(metrics.annualizedVolatility, 2)}%`;
  const lastComparable = fiveYearMetrics.status === 'AVAILABLE'
    ? percent(fiveYearMetrics.changePercent) : 'Unavailable';
  const distribution = metrics.status === 'AVAILABLE'
    ? `${metrics.distribution.positive} up · ${metrics.distribution.negative} down · ${metrics.distribution.flat} flat`
    : 'Unavailable';
  const availableYears = allPoints.length > 1
    ? `${allPoints[0].date} – ${allPoints.at(-1).date}` : 'Unavailable';
  const sourceRateLabel = history.rateMethod === 'ECB_EUR_PIVOT_CROSS_RATE'
    ? 'ECB euro-pivot cross-rate via Frankfurter'
    : 'ECB euro reference rate via Frankfurter';
  return `<header class="fxi-header">
    <div><p class="fxi-eyebrow">GPIR · SUBSCRIBER FX INTELLIGENCE</p><h1>${escapeHtml(pair.base)}/${escapeHtml(pair.quote)}</h1><p class="fxi-full-name">${escapeHtml(history.baseName)} to ${escapeHtml(history.quoteName)}</p></div>
    <div class="fxi-header-meta"><span>${escapeHtml(sourceRateLabel)}</span><strong>Latest source fixing · ${escapeHtml(history.lastFixingDate)}</strong><small>Retrieved ${escapeHtml(history.retrievedAt)}</small></div>
    <div class="fxi-pair-controls"><label>Base currency<select data-base>${sourceCurrencyOptions(history.currencies, pair.base)}</select></label><span aria-hidden="true">/</span><label>Quote currency<select data-quote>${sourceCurrencyOptions(history.currencies, pair.quote)}</select></label></div>
  </header>
  <nav class="fxi-periods" aria-label="Historical analysis period">${periodButtons}</nav>
  <section class="fxi-section fxi-chart-section"><div class="fxi-section-heading"><div><p class="fxi-kicker">OBSERVED REFERENCE FIXINGS</p><h2>Historical trend</h2></div><span class="${metrics.status === 'AVAILABLE' ? metrics.changePercent >= 0 ? 'fxi-up' : 'fxi-down' : ''}">${escapeHtml(trend)} · ${escapeHtml(activeChange)}</span></div>
    <div class="fxi-chart-key"><span class="key-rate">Observed daily fixing</span><span class="key-average">20 / 50 / 200-observation averages</span><span class="key-previous">Previous-period close</span></div>
    ${chartSvg(plottedPoints, previousMetrics, pair, allPoints)}
    <p class="fxi-note">Each plotted mark is an actual source observation; dense charts sample each bucket's first, last, high and low fixings. No missing dates are filled or interpolated; metrics use all observations. Moving averages appear only where their full observation windows exist.</p>
    <p class="fxi-comparison">${escapeHtml(previousLabel(metrics, previousMetrics))}</p>
  </section>
  <section class="fxi-quick-grid" aria-label="Quick reference and movement summary">
    <article class="fxi-section"><p class="fxi-kicker">REFERENCE CONVERTER</p><h2>Indicative conversion</h2><label class="fxi-converter">${escapeHtml(pair.base)} amount<input type="number" min="0" step="any" value="${Number.isFinite(amount) ? escapeHtml(amount) : '1000'}" data-amount></label><strong class="fxi-conversion" data-conversion>${conversion == null ? 'Unavailable' : `${number(conversion, 2)} ${escapeHtml(pair.quote)}`}</strong><small>At the latest historical reference fixing; not a transaction quote.</small><p class="fxi-note">Indicative remittance-rate comparison: unavailable — no validated provider quote supplied.</p></article>
    <article class="fxi-section"><p class="fxi-kicker">MOVEMENT &amp; VOLATILITY</p><h2>Selected-period summary</h2><div class="fxi-stat-grid"><div><span>Change</span><strong>${escapeHtml(activeChange)}</strong></div><div><span>Annualised realised volatility</span><strong>${escapeHtml(currentVolatility)}</strong></div><div><span>High · date</span><strong>${metrics.status === 'AVAILABLE' ? `${escapeHtml(rateText(metrics.high.rate, pair))} · ${escapeHtml(metrics.high.date)}` : 'Unavailable'}</strong></div><div><span>Low · date</span><strong>${metrics.status === 'AVAILABLE' ? `${escapeHtml(rateText(metrics.low.rate, pair))} · ${escapeHtml(metrics.low.date)}` : 'Unavailable'}</strong></div><div><span>Historical percentile</span><strong>${metrics.status === 'AVAILABLE' ? `${number(metrics.historicalPercentile, 0)}th` : 'Unavailable'}</strong></div><div><span>Five-year comparison</span><strong>${escapeHtml(lastComparable)}</strong></div><div><span>Daily movement distribution</span><strong>${escapeHtml(distribution)}</strong></div></div><p class="fxi-note">Daily log returns: ${metrics.status === 'AVAILABLE' ? metrics.returns.length : 0} observed intervals. Volatility requires at least 20 returns.</p></article>
  </section>
  <section class="fxi-section"><div class="fxi-section-heading"><div><p class="fxi-kicker">AVAILABLE HISTORY</p><h2>Historical range ladder</h2></div><span>${escapeHtml(availableYears)}</span></div><div class="fxi-range-list">${rangeLadder(allPoints, anchor, pair)}</div><p class="fxi-note">Each range uses only observations actually returned for this pair; maximum history is pair-specific.</p></section>
  <section class="fxi-section"><div class="fxi-section-heading"><div><p class="fxi-kicker">OBSERVATION-BY-OBSERVATION</p><h2>Daily movement</h2></div></div>${movementHeatmap(allPoints)}<p class="fxi-note">↑ Blue = base strengthened · ↓ Orange = base weakened · • Grey = flat. Calendar dates without a source fixing are omitted.</p></section>
  <section class="fxi-section"><div class="fxi-section-heading"><div><p class="fxi-kicker">SAME-DATE REFERENCE COMPARISON</p><h2>${escapeHtml(pair.quote)}-currency peers</h2></div></div>${peerHtml}<p class="fxi-note">Peer rates are deterministic cross-rates calculated from same-date ECB reference fixings, not provider-supplied transaction prices.</p></section>
  <section class="fxi-brief-grid" aria-label="Currency intelligence briefs">
    <article class="fxi-section"><p class="fxi-kicker">COMPUTED</p><h2>Movement &amp; Volatility</h2><p>${escapeHtml(movementBrief)}</p></article>
    <article class="fxi-section"><p class="fxi-kicker">EDITORIAL / CITED</p><h2>Economic &amp; Policy Drivers</h2><p>No validated, pair-specific editorial research is currently attached. No causal driver is inferred from rate movement.</p></article>
    <article class="fxi-section"><p class="fxi-kicker">COMPUTED</p><h2>Cross-Border Implications</h2><p>${escapeHtml(crossBorderBrief)}</p></article>
    <article class="fxi-section"><p class="fxi-kicker">COMPUTED</p><h2>Historical Interpretation</h2><p>${escapeHtml(historyBrief)} Last earlier observation within 1% of the latest rate: ${escapeHtml(comparableText)}.</p></article>
  </section>
  <footer class="fxi-provenance"><p class="fxi-kicker">DATA PROVENANCE &amp; RESEARCH LIMITS</p><p>Source: ${escapeHtml(history.source)}. <a href="${escapeHtml(history.sourceUrl)}" target="_blank" rel="noopener noreferrer">ECB reference-rate methodology</a> · <a href="${escapeHtml(history.sourceTermsUrl)}" target="_blank" rel="noopener noreferrer">ECB source terms</a> · <a href="${escapeHtml(history.providerUrl)}" target="_blank" rel="noopener noreferrer">Frankfurter API</a>.</p><p>Non-EUR pairs are ECB euro-pivot cross-rates formed from same-date reference data; no missing observations are filled. Historical coverage for this pair: ${escapeHtml(availableYears)} · ${allPoints.length} source fixings · fixing dates shown separately from retrieval and GPIR capture timestamps.</p><p>${archiveText} GPIR captures are separate from source fixing dates and are not mixed into the historical reference series.</p><p class="fxi-disclaimer">${DISCLAIMER}</p></footer>`;
}

function endpoint(global) {
  const base = global.GPIR_SUPABASE_PUBLIC_CONFIG?.url;
  if (typeof base !== 'string' || !base.trim()) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) return null;
    return `${url.origin}${API_PATH}`;
  } catch {
    return null;
  }
}

async function loadHistory(global, pair) {
  const auth = global.GPIRReaderAuth;
  let session;
  try {
    session = auth?.sessionReady ? await auth.sessionReady : null;
  } catch {
    throw new Error('READER_SESSION_UNAVAILABLE');
  }
  if (!session?.user?.id || !session.access_token) throw new Error('SESSION_REQUIRED');
  const generation = responseCacheGeneration;
  const key = `${session.user.id}:${pair.base}/${pair.quote}`;
  const cached = responseCache.get(key);
  if (cached?.expiresAt > Date.now()) {
    responseCache.delete(key);
    responseCache.set(key, cached);
    return { history: cached.value.history, capture: cached.value.gpirCapture,
      captureStatus: cached.value.gpirCaptureStatus, session };
  }
  let request = pendingRequests.get(key);
  if (!request) {
    const base = endpoint(global);
    if (!base) throw new Error('READER_CONFIGURATION_UNAVAILABLE');
    const url = new URL(base);
    url.searchParams.set('fxPair', `${pair.base}/${pair.quote}`);
    request = global.fetch(url, { method: 'GET', cache: 'no-store',
      headers: { authorization: `Bearer ${session.access_token}`,
        accept: 'application/json' } }).then(async response => {
      let payload;
      try { payload = await response.json(); } catch { payload = null; }
      if (!response.ok || payload?.status !== 'OK' || payload.history?.status !== 'AVAILABLE')
        throw new Error(payload?.code || `FX_DATA_HTTP_${response.status}`);
      if (payload.history.pair !== `${pair.base}/${pair.quote}` ||
          !Array.isArray(payload.history.points))
        throw new Error('FX_DATA_INVALID_RESPONSE');
      if (generation !== responseCacheGeneration) throw new Error('SESSION_REQUIRED');
      responseCache.delete(key);
      responseCache.set(key, { value: payload, expiresAt: Date.now() + CACHE_TTL_MS });
      while (responseCache.size > RESPONSE_CACHE_MAX_ENTRIES)
        responseCache.delete(responseCache.keys().next().value);
      return payload;
    }).finally(() => {
      if (pendingRequests.get(key) === request) pendingRequests.delete(key);
    });
    pendingRequests.set(key, request);
  }
  const payload = await request;
  if (generation !== responseCacheGeneration) throw new Error('SESSION_REQUIRED');
  return { history: payload.history, capture: payload.gpirCapture,
    captureStatus: payload.gpirCaptureStatus, session };
}

function accessMarkup(error) {
  const code = error?.message || '';
  if (code === 'SESSION_REQUIRED' || code === 'SESSION_INVALID') return `<section class="fxi-access"><h2>Sign in to continue</h2><p>FX Intelligence is available to authenticated subscribers.</p><a href="/reader/sign-in/?returnTo=%2Fpages%2Ffx%2Fintelligence.html">Sign in</a><a href="/reader/create-account/?returnTo=%2Fpages%2Ffx%2Fintelligence.html">Create account</a></section>`;
  if (code === 'SUBSCRIPTION_EXPIRED') return `<section class="fxi-access"><h2>Your subscription has expired</h2><p>Renew your subscription to continue using FX Intelligence.</p><a href="/reader/plan/">Renew subscription</a></section>`;
  if (code === 'SUBSCRIPTION_REQUIRED' || code === 'NOT_ENTITLED') return `<section class="fxi-access"><h2>Subscriber access required</h2><p>Choose an active GPIR subscription to access pair intelligence.</p><a href="/reader/plan/">View Subscription Plans</a></section>`;
  const text = code === 'UNSUPPORTED_CURRENCY'
    ? 'This currency is not currently supported by the historical reference source.'
    : code === 'NO_HISTORICAL_OBSERVATIONS'
      ? 'No historical observations are available for this pair. No values have been inferred.'
      : 'The protected reference-data service is temporarily unavailable. Please retry.';
  return `<section class="fxi-access"><h2>FX Intelligence unavailable</h2><p>${escapeHtml(text)}</p><button type="button" data-retry>Retry</button></section>`;
}

function updateConverter(root, pair) {
  const amount = Number(root.querySelector('[data-amount]')?.value);
  const latest = Number(root.querySelector('[data-card-root]')?.dataset.latestRate);
  const output = root.querySelector('[data-conversion]');
  if (output) output.textContent = Number.isFinite(amount) && amount >= 0 &&
    Number.isFinite(latest) ? `${number(amount * latest, 2)} ${pair.quote}` : 'Unavailable';
}

const HTMLElementBase = globalThis.HTMLElement || class {};

class GpirFxCard extends HTMLElementBase {
  static get observedAttributes() { return ['base', 'quote', 'period']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.requestNumber = 0;
  }

  connectedCallback() {
    if (!this.hasAttribute('period')) this.setAttribute('period', 'M');
    void this.refresh();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && this.isConnected && !this.editingPair)
      void this.refresh();
  }

  async refresh() {
    const sequence = ++this.requestNumber;
    const pair = normalizeFxPair(this.getAttribute('base'), this.getAttribute('quote'));
    const period = PERIODS.some(item => item.id === this.getAttribute('period'))
      ? this.getAttribute('period') : 'M';
    if (!pair) {
      this.shadowRoot.innerHTML = `<link rel="stylesheet" href="/assets/css/fx-intelligence.css"><section class="fxi-access"><h2>Select a valid currency pair</h2><p>Choose two different three-letter currency codes.</p></section>`;
      return;
    }
    this.shadowRoot.innerHTML = `<link rel="stylesheet" href="/assets/css/fx-intelligence.css"><p class="fxi-loading" role="status">Verifying reader access and loading ${pair.base}/${pair.quote} reference observations…</p>`;
    try {
      const { history, capture, captureStatus } = await loadHistory(globalThis, pair);
      if (sequence !== this.requestNumber || !this.isConnected) return;
      this.shadowRoot.innerHTML = `<link rel="stylesheet" href="/assets/css/fx-intelligence.css"><main class="fxi-card-content" data-card-root data-latest-rate="${escapeHtml(history.points.at(-1)?.rate)}">${buildCardMarkup(history, capture, captureStatus, period, 1000)}</main>`;
      this.bindControls(pair);
    } catch (error) {
      if (sequence !== this.requestNumber || !this.isConnected) return;
      this.shadowRoot.innerHTML = `<link rel="stylesheet" href="/assets/css/fx-intelligence.css">${accessMarkup(error)}`;
      this.shadowRoot.querySelector('[data-retry]')?.addEventListener('click', () => void this.refresh());
    }
  }

  bindControls(pair) {
    this.shadowRoot.querySelectorAll('[data-period]').forEach(button => {
      button.addEventListener('click', () => this.setAttribute('period', button.dataset.period));
    });
    for (const [attribute, select] of [
      ['base', this.shadowRoot.querySelector('[data-base]')],
      ['quote', this.shadowRoot.querySelector('[data-quote]')]
    ]) select?.addEventListener('change', () => {
      const base = this.shadowRoot.querySelector('[data-base]')?.value || pair.base;
      const quote = this.shadowRoot.querySelector('[data-quote]')?.value || pair.quote;
      if (!normalizeFxPair(base, quote)) {
        const baseSelect = this.shadowRoot.querySelector('[data-base]');
        const quoteSelect = this.shadowRoot.querySelector('[data-quote]');
        if (baseSelect) baseSelect.value = pair.base;
        if (quoteSelect) quoteSelect.value = pair.quote;
        return;
      }
      this.editingPair = true;
      this.setAttribute('base', base);
      this.setAttribute('quote', quote);
      this.editingPair = false;
      void this.refresh();
    });
    this.shadowRoot.querySelector('[data-amount]')?.addEventListener('input', () =>
      updateConverter(this.shadowRoot, pair));
  }

  showSignedOut() {
    this.requestNumber++;
    this.shadowRoot.innerHTML = `<link rel="stylesheet" href="/assets/css/fx-intelligence.css">${accessMarkup(new Error('SESSION_REQUIRED'))}`;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('gpir-fx-card'))
  customElements.define('gpir-fx-card', GpirFxCard);

globalThis.addEventListener?.('gpir:reader-signed-out', () => {
  responseCacheGeneration++;
  responseCache.clear();
  pendingRequests.clear();
  globalThis.document?.querySelectorAll('gpir-fx-card').forEach(card =>
    card.showSignedOut());
});
