/* GPIR M39 Smart Intelligence section presentation.
   Presentation only: reads the DOM rendered by smart-intelligence.mjs (topic picker and heatmap rows). It never fetches data, never alters values, URLs, text or checkbox state. */
(function () {
    'use strict';
    var root = document.querySelector('[data-smart-root]');
    if (!root) return;
    document.body.classList.add('gpir-sc');

    var ROWS_PER_HEATMAP_ROW = 12;
    var showAllHeat = false;
    var uid = 0;
    var scheduled = false;
    var observer = null;
    var heatTools = null;

    function q(selector) { return root.querySelector(selector); }
    function qa(selector, scope) { return Array.prototype.slice.call((scope || root).querySelectorAll(selector)); }
    function idFor(element, prefix) {
        if (!element.id) element.id = prefix + '-' + (++uid);
        return element.id;
    }
    function trim(value) { return (value || '').replace(/\s+/g, ' ').trim(); }

    function makeTools(host, label, onToggle) {
        var bar = document.createElement('div');
        bar.className = 'gpir-sc-tools';
        var button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-controls', idFor(host, 'gpir-sc-target'));
        var output = document.createElement('output');
        output.setAttribute('aria-live', 'polite');
        output.setAttribute('aria-label', label);
        button.addEventListener('click', function () {
            onToggle();
            enhance();
        });
        bar.appendChild(button);
        bar.appendChild(output);
        host.parentNode.insertBefore(bar, host);
        return { bar: bar, button: button, output: output };
    }

    function setToggle(tools, pressed, allLabel, activeLabel, summary) {
        tools.button.setAttribute('aria-pressed', String(pressed));
        tools.button.textContent = pressed ? activeLabel : allLabel;
        tools.output.textContent = summary;
    }

    function enhancePicker() {
        var details = q('.smi-topic-filter details');
        var controls = q('[data-smart-topic-controls]');
        if (!details || !controls || !controls.children.length) return;
        var summary = details.querySelector('summary');
        var badge = summary.querySelector('.gpir-sc-count');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'gpir-sc-count';
            summary.appendChild(badge);
        }
        var inputs = qa('input', controls);
        var checked = inputs.filter(function (input) { return input.checked; }).length;
        badge.textContent = checked ? checked + ' of ' + inputs.length + ' selected' : 'All ' + inputs.length + ' topics';
    }

    function enhanceHeatmap() {
        var host = q('[data-smart-heatmap]');
        if (!host) return;
        var labels = qa('.smi-row-label', host);
        if (!labels.length) return;
        if (!heatTools) heatTools = makeTools(host.parentNode, 'Heatmap theme display', function () { showAllHeat = !showAllHeat; });
        var scroll = host.parentNode;
        scroll.dataset.gpirRows = showAllHeat ? 'all' : 'active';
        if (!scroll.hasAttribute('tabindex')) {
            scroll.tabIndex = 0;
            scroll.setAttribute('role', 'region');
            scroll.setAttribute('aria-label', 'Preceding 12 weeks signal density by theme');
        }
        var shown = 0;
        labels.forEach(function (label) {
            var cells = [];
            for (var node = label.nextElementSibling; node && cells.length < ROWS_PER_HEATMAP_ROW; node = node.nextElementSibling) cells.push(node);
            var name = trim(label.textContent);
            var active = cells.some(function (cell) { return trim(cell.textContent) !== ''; });
            var visible = showAllHeat || active;
            label.title = name;
            label.hidden = !visible;
            cells.forEach(function (cell) { cell.hidden = !visible; });
            if (visible) shown += 1;
        });
        var visibleCells = qa('.smi-heat-cell', host).filter(function (cell) { return !cell.hidden; });
        if (visibleCells.length && !visibleCells.some(function (cell) { return cell.tabIndex === 0; })) visibleCells[0].tabIndex = 0;
        setToggle(heatTools, showAllHeat, 'Show all ' + labels.length + ' themes', 'Show active themes only',
            'Showing ' + shown + ' of ' + labels.length + ' themes · active themes have at least one verified development in the 12 weeks');
    }

    function enhance() {
        scheduled = false;
        if (observer) observer.disconnect();
        try {
            enhancePicker();
            enhanceHeatmap();
        } finally {
            if (observer) observer.observe(root, { childList: true, subtree: true });
        }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        (window.requestAnimationFrame || window.setTimeout)(enhance);
    }

    root.addEventListener('change', function (event) {
        if (event.target && event.target.matches && event.target.matches('[data-smart-topic-controls] input')) schedule();
    });
    if (window.MutationObserver) {
        observer = new MutationObserver(schedule);
        observer.observe(root, { childList: true, subtree: true });
    }
    schedule();
}());
