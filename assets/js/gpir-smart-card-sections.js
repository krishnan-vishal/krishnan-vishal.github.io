/* GPIR M39 Smart Intelligence section presentation.
   Presentation only: reads the DOM rendered by smart-intelligence.mjs and the existing topic
   checkboxes. It never fetches data, never alters values, URLs, text or checkbox state. */
(function () {
    'use strict';
    var root = document.querySelector('[data-smart-root]');
    if (!root) return;
    document.body.classList.add('gpir-sc');

    var ROWS_PER_HEATMAP_ROW = 12;
    var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    var showAllCards = false;
    var showAllHeat = false;
    var focusTopic = '';
    var uid = 0;
    var scheduled = false;
    var observer = null;
    var openedPicker = false;
    var cardTools = null;
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

    function selectedTopics() {
        var set = {};
        qa('[data-smart-topic-controls] input:checked').forEach(function (input) { set[input.value] = true; });
        return set;
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
        if (!openedPicker) {
            openedPicker = true;
            if (window.matchMedia && window.matchMedia('(min-width:1100px)').matches) details.open = true;
        }
    }

    function enhanceCards() {
        var host = q('[data-smart-topic-cards]');
        if (!host) return;
        var cards = qa('.smi-topic-card', host);
        if (!cards.length) return;
        if (!cardTools) cardTools = makeTools(host, 'Topic ranking display', function () { showAllCards = !showAllCards; });
        var selected = selectedTopics();
        var items = cards.map(function (card, index) {
            var count = parseInt((card.querySelector('.smi-topic-count') || {}).textContent, 10) || 0;
            return { card: card, index: index, count: count };
        });
        var max = items.reduce(function (value, item) { return Math.max(value, item.count); }, 0);
        items.forEach(function (item) {
            var card = item.card;
            card.dataset.gpirActive = String(item.count > 0);
            card.dataset.selected = String(!!selected[card.dataset.topic]);
            card.style.setProperty('--gpir-sc-share', max ? (item.count / max).toFixed(3) : '0');
            card.hidden = !(showAllCards || item.count > 0);
        });
        var ordered = items.slice().sort(function (left, right) {
            return right.count - left.count || left.index - right.index;
        });
        ordered.forEach(function (item, position) {
            if (host.children[position] !== item.card) host.insertBefore(item.card, host.children[position] || null);
        });
        var active = items.filter(function (item) { return item.count > 0; }).length;
        setToggle(cardTools, showAllCards, 'Show all ' + items.length + ' topics', 'Show active topics only',
            'Showing ' + (showAllCards ? items.length : active) + ' of ' + items.length +
            ' topics · ' + active + ' active in the selected context, ranked by signal count');
        if (focusTopic) {
            var target = host.querySelector('[data-topic="' + focusTopic + '"]');
            if (target && (!document.activeElement || document.activeElement === document.body)) target.focus({ preventScroll: true });
            focusTopic = '';
        }
    }

    function enhanceHeatmap() {
        var host = q('[data-smart-heatmap]');
        if (!host) return;
        var labels = qa('.smi-row-label', host);
        if (!labels.length) return;
        if (!heatTools) heatTools = makeTools(host.parentNode, 'Heatmap topic display', function () { showAllHeat = !showAllHeat; });
        var activeInCards = {};
        qa('.smi-topic-card').forEach(function (card) {
            var heading = card.querySelector('h3');
            if (heading) activeInCards[trim(heading.textContent)] = card.dataset.gpirActive === 'true';
        });
        var scroll = host.parentNode;
        scroll.dataset.gpirRows = showAllHeat ? 'all' : 'active';
        if (!scroll.hasAttribute('tabindex')) {
            scroll.tabIndex = 0;
            scroll.setAttribute('role', 'region');
            scroll.setAttribute('aria-label', 'Preceding 12 weeks signal density by topic');
        }
        var shown = 0;
        labels.forEach(function (label) {
            var cells = [];
            for (var node = label.nextElementSibling; node && cells.length < ROWS_PER_HEATMAP_ROW; node = node.nextElementSibling) cells.push(node);
            var name = trim(label.textContent);
            var active = !!activeInCards[name] || cells.some(function (cell) { return trim(cell.textContent) !== ''; });
            var visible = showAllHeat || active;
            label.title = name;
            label.hidden = !visible;
            cells.forEach(function (cell) { cell.hidden = !visible; });
            if (visible) shown += 1;
        });
        setToggle(heatTools, showAllHeat, 'Show all ' + labels.length + ' topics', 'Show active topics only',
            'Showing ' + shown + ' of ' + labels.length + ' topics · active topics have a signal in the 12 weeks or the selected period');
    }

    function fitDescription(article) {
        var text = article.querySelector(':scope > p');
        var button = article.querySelector('.gpir-sc-more');
        if (!text || !button || button.getAttribute('aria-expanded') === 'true') return;
        text.dataset.gpirClamped = 'true';
        var overflow = text.scrollHeight > text.clientHeight + 1;
        button.hidden = !overflow;
        text.dataset.gpirClamped = String(overflow);
        if (overflow) text.title = trim(text.textContent); else text.removeAttribute('title');
    }

    function enhanceEvidence() {
        var articles = qa('[data-smart-results] .smi-record');
        articles.forEach(function (article) {
            if (article.dataset.gpirEnhanced) return;
            article.dataset.gpirEnhanced = 'true';
            var metas = qa(':scope > .smi-record-meta', article);
            var dateSpan = metas.length > 1 ? metas[metas.length - 1].firstElementChild : null;
            var match = dateSpan && /^(\d{4})-(\d{2})-(\d{2})$/.exec(trim(dateSpan.textContent));
            if (match && MONTHS[Number(match[2]) - 1]) {
                var tile = document.createElement('span');
                tile.className = 'gpir-sc-date';
                tile.setAttribute('aria-hidden', 'true');
                tile.innerHTML = MONTHS[Number(match[2]) - 1] + '<b>' + match[3] + '</b>' + match[1];
                article.insertBefore(tile, article.firstChild);
                article.dataset.gpirDated = 'true';
                dateSpan.classList.add('gpir-sc-visually-hidden');
            }
            if (metas.length > 1) {
                metas[0].classList.add('gpir-sc-pills');
                metas[1].insertBefore(metas[0], metas[1].firstChild);
            }
            var text = article.querySelector(':scope > p');
            if (!text || !metas.length) return;
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'gpir-sc-more';
            button.textContent = 'More';
            button.setAttribute('aria-label', 'Show full description');
            button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-controls', idFor(text, 'gpir-sc-desc'));
            button.hidden = true;
            button.addEventListener('click', function () {
                var expanded = button.getAttribute('aria-expanded') !== 'true';
                button.setAttribute('aria-expanded', String(expanded));
                button.textContent = expanded ? 'Less' : 'More';
                button.setAttribute('aria-label', expanded ? 'Show shorter description' : 'Show full description');
                text.dataset.gpirClamped = String(!expanded);
            });
            metas[metas.length - 1].appendChild(button);
        });
        articles.forEach(fitDescription);
    }

    function enhance() {
        scheduled = false;
        if (observer) observer.disconnect();
        try {
            enhancePicker();
            enhanceCards();
            enhanceHeatmap();
            enhanceEvidence();
        } finally {
            if (observer) observer.observe(root, { childList: true, subtree: true });
        }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        (window.requestAnimationFrame || window.setTimeout)(enhance);
    }

    root.addEventListener('keydown', function (event) {
        var card = event.target && event.target.closest ? event.target.closest('.smi-topic-card') : null;
        if (card && event.target === card && (event.key === 'Enter' || event.key === ' ')) focusTopic = card.dataset.topic || '';
    });
    root.addEventListener('change', function (event) {
        if (event.target && event.target.matches && event.target.matches('[data-smart-topic-controls] input')) schedule();
    });
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () { qa('[data-smart-results] .smi-record').forEach(fitDescription); }, 150);
    });

    if (window.MutationObserver) {
        observer = new MutationObserver(schedule);
        observer.observe(root, { childList: true, subtree: true });
    }
    schedule();
}());
