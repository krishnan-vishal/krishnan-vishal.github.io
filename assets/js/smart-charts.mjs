// DOM glue for Apache ECharts. ECharts is loaded by the page as a pinned, integrity-checked script.
// When it is unavailable the accessible data tables remain the complete, equivalent presentation.
import { WORLD_GEOJSON } from './smart-world.mjs';

const CHARTS = ['weekly', 'momentum', 'distribution', 'geography'];

export function createChartController(global, root, handlers = {}) {
  const echarts = global.echarts;
  const instances = new Map();
  const pending = new Map();
  const navigation = new Map();
  const cursors = new Map();
  const sources = new Map();
  let resizeObserver = null;

  const host = name => root.querySelector(`[data-smart-chart="${name}"]`);
  const dispose = name => { instances.get(name)?.dispose(); instances.delete(name); };
  const announce = text => { const live = root.querySelector('[data-smart-chart-live]'); if (live) live.textContent = text; };
  if (echarts && !echarts.getMap?.('gpir-world')) echarts.registerMap('gpir-world', WORLD_GEOJSON);

  // Options may depend on the host size (the regional map scales to its card).
  const resolve = (option, element) => typeof option === 'function' ? option({ width: element.clientWidth, height: element.clientHeight }) : option;

  function show(name, index) {
    const chart = instances.get(name);
    const point = navigation.get(name)?.points[index];
    if (!chart || !point) return;
    cursors.set(name, index);
    chart.dispatchAction({ type: 'downplay' });
    chart.dispatchAction({ type: 'highlight', seriesIndex: point.seriesIndex, dataIndex: point.dataIndex });
    chart.dispatchAction({ type: 'showTip', seriesIndex: point.seriesIndex, dataIndex: point.dataIndex });
    announce(point.label);
  }

  function hide(name) {
    const chart = instances.get(name);
    if (!chart) return;
    chart.dispatchAction({ type: 'downplay' });
    chart.dispatchAction({ type: 'hideTip' });
  }

  // Charts are canvas based, so the keyboard drives a cursor across ordered data points and Enter drills down.
  function bindKeyboard(name, element) {
    if (element.dataset.chartKeys) return;
    element.dataset.chartKeys = 'true';
    element.addEventListener('keydown', event => {
      const nav = navigation.get(name);
      if (!nav?.points.length) return;
      const last = nav.points.length - 1;
      const current = cursors.get(name) ?? -1;
      const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      let next;
      if (event.key in steps) next = Math.min(last, Math.max(0, current + steps[event.key]));
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = last;
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (current >= 0) nav.activate(nav.points[current]);
        return;
      } else if (event.key === 'Escape') { hide(name); cursors.delete(name); return; }
      else return;
      event.preventDefault();
      show(name, next);
    });
    element.addEventListener('blur', () => { hide(name); cursors.delete(name); });
  }

  function mount(name, option, activate, points) {
    const element = host(name);
    if (!element) return;
    if (!echarts) { element.dataset.chartState = 'fallback'; return; }
    if (!option) { pending.delete(name); dispose(name); navigation.delete(name); element.dataset.chartState = 'empty'; return; }
    if (!element.clientWidth || !element.clientHeight) {
      pending.set(name, { option, activate, points });
      dispose(name);
      element.dataset.chartState = 'deferred';
      return;
    }
    pending.delete(name);
    element.dataset.chartState = 'ready';
    navigation.set(name, { points, activate });
    sources.set(name, option);
    let chart = instances.get(name);
    if (!chart || chart.isDisposed?.()) {
      chart = echarts.init(element, null, { renderer: 'canvas' });
      instances.set(name, chart);
      if (name === 'weekly') {
        // Lines have no useful hit area, so a click inside the plot selects the nearest week.
        chart.getZr().on('click', event => {
          const point = [event.offsetX, event.offsetY];
          if (!chart.containPixel('grid', point)) return;
          const index = Math.round(chart.convertFromPixel({ gridIndex: 0 }, point)[0]);
          navigation.get(name)?.activate({ seriesIndex: 0, dataIndex: index });
        });
      } else chart.on('click', params => navigation.get(name)?.activate({ seriesIndex: params.seriesIndex, dataIndex: params.dataIndex }));
      if (resizeObserver) resizeObserver.observe(element);
      bindKeyboard(name, element);
    }
    chart.setOption(resolve(option, element), true);
    chart.resize();
  }

  if (!echarts) root.querySelectorAll('.smp-data').forEach(details => { details.open = true; });
  if (echarts && global.ResizeObserver) {
    resizeObserver = new global.ResizeObserver(entries => entries.forEach(entry => {
      const name = entry.target.dataset.smartChart;
      const delayed = pending.get(name);
      if (delayed && entry.contentRect.width && entry.contentRect.height) mount(name, delayed.option, delayed.activate, delayed.points);
      else {
        const chart = instances.get(name);
        chart?.resize();
        if (chart && typeof sources.get(name) === 'function') chart.setOption(resolve(sources.get(name), entry.target), true);
      }
    }));
    CHARTS.forEach(name => { const element = host(name); if (element) resizeObserver.observe(element); });
  }

  return {
    available: Boolean(echarts),
    render({ trend, momentum, donut, regional, options, points }) {
      mount('weekly', trend.total ? options.weekly : null, point => {
        const week = trend.weeks[point.dataIndex];
        if (week) handlers.onWeek?.({ start: week.start, end: week.start + 6 * 86400000 });
      }, points.weekly);
      mount('momentum', momentum.some(row => row.current || row.previous) ? options.momentum : null, point => {
        const row = momentum[point.dataIndex];
        if (row) handlers.onTheme?.(row.id);
      }, points.momentum);
      mount('distribution', donut.unique ? options.distribution : null, point => {
        const slice = donut.slices.filter(item => item.count)[point.dataIndex];
        if (slice && slice.id !== 'other-themes') handlers.onTheme?.(slice.id);
      }, points.distribution);
      mount('geography', regional.mapped ? options.geography : null, point => {
        const region = regional.regions[point.dataIndex];
        if (region) handlers.onRegion?.(region.key);
      }, points.geography);
    },
    resize() {
      pending.forEach((delayed, name) => mount(name, delayed.option, delayed.activate, delayed.points));
      instances.forEach(chart => chart.resize());
    },
    destroy() { resizeObserver?.disconnect(); [...instances.keys()].forEach(dispose); pending.clear(); navigation.clear(); }
  };
}
