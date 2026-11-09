// DOM glue for Apache ECharts. ECharts is loaded by the page as a pinned, integrity-checked script.
// When it is unavailable the accessible data tables remain the complete, equivalent presentation.
import { geographyList, orderMomentum } from './smart-presentation.mjs';

const CHARTS = ['weekly', 'momentum', 'distribution', 'geography'];

export function createChartController(global, root, handlers = {}) {
  const echarts = global.echarts;
  const instances = new Map();
  let resizeObserver = null;

  const host = name => root.querySelector(`[data-smart-chart="${name}"]`);
  const dispose = name => { instances.get(name)?.dispose(); instances.delete(name); };

  function mount(name, option, onClick) {
    const element = host(name);
    if (!element) return;
    if (!echarts) { element.dataset.chartState = 'fallback'; return; }
    if (!option) { dispose(name); element.dataset.chartState = 'empty'; return; }
    element.dataset.chartState = 'ready';
    let chart = instances.get(name);
    if (!chart || chart.isDisposed?.()) {
      chart = echarts.init(element, null, { renderer: 'canvas' });
      chart.on('click', params => instances.get(name)?.__onClick?.(params));
      instances.set(name, chart);
      if (resizeObserver) resizeObserver.observe(element);
    }
    chart.__onClick = onClick;
    chart.setOption(option, true);
    chart.resize();
  }

  if (!echarts) root.querySelectorAll('.smp-data').forEach(details => { details.open = true; });
  if (echarts && global.ResizeObserver) {
    resizeObserver = new global.ResizeObserver(() => instances.forEach(chart => chart.resize()));
    CHARTS.forEach(name => { const element = host(name); if (element) resizeObserver.observe(element); });
  }

  return {
    available: Boolean(echarts),
    render({ weekly, momentum, distribution, geography, geographyMode, options }) {
      mount('weekly', weekly.total || weekly.max ? options.weekly : null, params => {
        const week = weekly.weeks[params.dataIndex];
        if (week) handlers.onWeek?.(week);
      });
      const shown = orderMomentum(momentum);
      mount('momentum', shown.length ? options.momentum : null, params => {
        const row = shown[params.dataIndex];
        if (row) handlers.onTheme?.(row.id);
      });
      mount('distribution', distribution.unique ? options.distribution : null, params => {
        if (params.data?.id && params.data.id !== 'other') handlers.onTheme?.(params.data.id);
      });
      const places = geographyList(geography, geographyMode);
      mount('geography', places.length ? options.geography : null, params => {
        const place = places[params.dataIndex];
        if (place && geographyMode === 'regions') handlers.onRegion?.(place.key);
      });
    },
    resize() { instances.forEach(chart => chart.resize()); },
    destroy() { resizeObserver?.disconnect(); [...instances.keys()].forEach(dispose); }
  };
}
