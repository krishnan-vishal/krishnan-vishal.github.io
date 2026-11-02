import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const navigationSource = fs.readFileSync(path.join(root, "assets/js/script.js"), "utf8");
const headerCss = fs.readFileSync(path.join(root, "assets/css/header.css"), "utf8");
const timelineCss = fs.readFileSync(path.join(root, "assets/css/payments-timeline.css"), "utf8");
const homeHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const contentSearchSource = fs.readFileSync(path.join(root, "assets/js/content-search.js"), "utf8");
const searchIndex = JSON.parse(fs.readFileSync(path.join(root, "assets/data/search-index.json"), "utf8"));
const dashboardMetadata = JSON.parse(fs.readFileSync(path.join(root, "assets/data/dashboard-metadata.json"), "utf8"));
const lifecycleSource = fs.readFileSync(path.join(root, "assets/js/announcement-lifecycle.js"), "utf8");
const announcementsSource = fs.readFileSync(path.join(root, "assets/js/announcements.js"), "utf8");
const marketCss = fs.readFileSync(path.join(root, "assets/css/market.css"), "utf8");

class FakeClassList {
    constructor(){ this.values = new Set(); }
    add(...names){ names.forEach(name => this.values.add(name)); }
    remove(...names){ names.forEach(name => this.values.delete(name)); }
    contains(name){ return this.values.has(name); }
    toggle(name){
        if(this.contains(name)){ this.remove(name); return false; }
        this.add(name); return true;
    }
}

class FakeEventTarget {
    constructor(){ this.listeners = new Map(); }
    addEventListener(type, listener){
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }
    removeEventListener(){}
    fire(type, event = {}){
        const payload = { target: this, preventDefault(){ this.defaultPrevented = true; }, ...event };
        for(const listener of this.listeners.get(type) || []) listener(payload);
        return payload;
    }
}

function createNavigationHarness({ mobile = false } = {}){
    const document = new FakeEventTarget();
    const item = new FakeEventTarget();
    const trigger = new FakeEventTarget();
    const menu = new FakeEventTarget();
    const styleValues = new Map();

    item.classList = new FakeClassList();
    trigger.classList = new FakeClassList();
    trigger.attributes = new Map();
    trigger.setAttribute = (name, value) => trigger.attributes.set(name, String(value));
    trigger.focused = false;
    trigger.focus = () => { trigger.focused = true; };
    menu.id = "";
    menu.scrollHeight = 400;
    menu.style = {
        maxHeight: "",
        setProperty(name, value){ styleValues.set(name, value); },
        removeProperty(name){ styleValues.delete(name); }
    };
    menu.getBoundingClientRect = () => ({ left: 100, right: 700 });
    menu.querySelectorAll = () => [];
    item.querySelector = selector => selector.includes("nav-mega-trigger") ? trigger : selector === ".mega-menu" ? menu : null;
    item.contains = target => target === item || target === trigger || target === menu;
    document.querySelectorAll = selector => selector === ".nav-item-mega" ? [item] : [];
    document.querySelector = () => null;
    document.readyState = "loading";

    const media = query => ({ matches: query.includes("max-width") ? mobile : false, addEventListener(){} });
    const windowTarget = new FakeEventTarget();
    Object.assign(windowTarget, {
        matchMedia: media,
        innerWidth: 1200,
        scrollY: 0,
        requestAnimationFrame(callback){ callback(); }
    });

    const context = vm.createContext({
        document,
        window: windowTarget,
        requestAnimationFrame(callback){ callback(); },
        setTimeout,
        clearTimeout,
        console
    });
    vm.runInContext(navigationSource, context);
    context.initializeMegaMenuHoverIntent();
    if(mobile) context.initializeMobileMegaAccordion();
    return { document, item, trigger, menu, windowTarget };
}

function htmlEscape(value){
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function createAlertsHarness({ alerts = [], apiFailure = false } = {}){
    const track = {
        classList: new FakeClassList(),
        style: { setProperty(){} },
        parentElement: {},
        _innerHTML: "",
        set innerHTML(value){ this._innerHTML = value; },
        get innerHTML(){ return this._innerHTML; },
        querySelector(selector){
            if(selector !== ".ticker-sequence" || !this._innerHTML.includes("ticker-sequence")) return null;
            return {
                getBoundingClientRect: () => ({ width: 640 }),
                cloneNode: () => ({ setAttribute(){}, querySelectorAll: () => [] })
            };
        },
        querySelectorAll: () => [],
        appendChild(){}
    };
    const overlay = {
        classList: new FakeClassList(),
        attributes: new Map(),
        setAttribute(name, value){ this.attributes.set(name, String(value)); },
        querySelectorAll: () => []
    };
    const body = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
    const document = new FakeEventTarget();
    document.readyState = "complete";
    document.getElementById = id => ({ announcementTicker: track, "intel-overlay": overlay, "intel-panel-body": body }[id] || null);
    document.createElement = () => {
        let text = "";
        return {
            set textContent(value){ text = value == null ? "" : String(value); },
            get innerHTML(){ return htmlEscape(text); }
        };
    };
    document.dispatchEvent = () => true;

    const now = Date.now();
    const staticRecent = {
        id: "static-recent",
        title: "Static historical announcement",
        headline: "Static historical announcement",
        summary: "This static record must remain archive-only even when its timestamp is recent.",
        category: "Payments",
        country: "Archive",
        status: "GPIR_CLASSIFIED",
        contentStatus: "CONTENT_VERIFIED",
        sourcePublicationTimestamp: new Date(now - 30 * 60 * 1000).toISOString(),
        publishedDate: new Date(now).toISOString().slice(0, 10),
        source: { name: "Archive Publisher", publicationTitle: "Archive Publisher", url: "https://archive.example/notice" }
    };

    const windowTarget = {};
    const context = vm.createContext({
        document,
        window: windowTarget,
        globalThis: windowTarget,
        URL,
        Date,
        CustomEvent: class { constructor(type, options){ this.type = type; this.detail = options && options.detail; } },
        ResizeObserver: class { observe(){} },
        requestAnimationFrame(callback){ callback(); },
        setTimeout,
        clearTimeout,
        console: { error(){} },
        fetch: async url => {
            if(String(url).includes("announcements.json")) return { ok: true, json: async () => ({ records: [staticRecent] }) };
            if(String(url).includes("content-registry.json")) return { ok: true, json: async () => ({ records: [] }) };
            if(String(url).includes("gpir-public-alerts")){
                if(apiFailure) throw new Error("network unavailable");
                return { ok: true, json: async () => ({ alerts, windowHours: 12 }) };
            }
            throw new Error(`Unexpected request: ${url}`);
        }
    });
    vm.runInContext(lifecycleSource, context);
    vm.runInContext(announcementsSource, context);
    for(let attempt = 0; attempt < 12; attempt += 1) await new Promise(resolve => setImmediate(resolve));
    return { track, overlay, body, api: windowTarget.GPIRAnnouncements };
}

function validAlert(overrides = {}){
    return {
        id: "live-alert",
        title: "Central bank launches verified instant-payment service",
        summary: "The authority confirmed a new instant-payment service for regulated participants.",
        publishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        category: "Payment Infrastructure",
        country: "India",
        countryCode: "IN",
        sourceName: "Reserve Bank Example",
        sourceUrl: "https://centralbank.example/releases/instant-payments",
        publicationStatus: "approved",
        tickerEligible: true,
        sourceVerified: true,
        ...overrides
    };
}

test("desktop mega-menu opens on pointer movement and toggles on intentional click", () => {
    const { item, trigger } = createNavigationHarness();
    item.fire("pointermove", { pointerType: "mouse" });
    assert.equal(item.classList.contains("is-open"), true);
    assert.equal(trigger.attributes.get("aria-expanded"), "true");
    trigger.fire("click");
    assert.equal(item.classList.contains("is-open"), false);
    trigger.fire("click");
    assert.equal(item.classList.contains("is-open"), true);
});

test("stationary pointer during scroll does not open a desktop mega-menu", () => {
    const { item, trigger, windowTarget } = createNavigationHarness();
    assert.equal(item.listeners.has("mouseenter"), false);
    windowTarget.fire("scroll");
    item.fire("pointermove", { pointerType: "mouse" });
    assert.equal(item.classList.contains("is-open"), false);
    assert.equal(trigger.attributes.get("aria-expanded"), undefined);
});

test("desktop outside click and Escape close, with Escape restoring focus", () => {
    const { document, item, trigger } = createNavigationHarness();
    trigger.fire("click");
    document.fire("click", { target: {} });
    assert.equal(item.classList.contains("is-open"), false);
    trigger.fire("click");
    document.fire("keydown", { key: "Escape" });
    assert.equal(item.classList.contains("is-open"), false);
    assert.equal(trigger.focused, true);
});

test("mobile tap accordion still opens and closes", () => {
    const { item, trigger, menu } = createNavigationHarness({ mobile: true });
    trigger.fire("click");
    assert.equal(item.classList.contains("is-expanded"), true);
    assert.equal(menu.style.maxHeight, "400px");
    trigger.fire("click");
    assert.equal(item.classList.contains("is-expanded"), false);
});

test("desktop panel and caret visibility remain controller-class driven", () => {
    assert.match(headerCss, /\.nav-item-mega\.is-open > \.mega-menu\s*\{[^}]*opacity:1/s);
    assert.doesNotMatch(headerCss, /\.nav-item-mega:(?:hover|focus-within) > \.nav-mega-trigger \.mega-caret/);
    assert.doesNotMatch(headerCss, /\.nav-item-mega:(?:hover|focus-within) > \.mega-menu\s*\{[^}]*opacity:1/s);
});

test("timeline keeps three bounded desktop columns and contained SVG icons", () => {
    assert.match(timelineCss, /#payments-timeline \.timeline-eras\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/s);
    assert.match(timelineCss, /#payments-timeline \.era-icon > svg\s*\{[^}]*width:24px;[^}]*height:24px;[^}]*max-width:24px;[^}]*max-height:24px;/s);
    assert.match(timelineCss, /@media \(max-width:1024px\)\s*\{[\s\S]*#payments-timeline \.timeline-eras\s*\{[^}]*grid-template-columns:1fr/);
    assert.match(homeHtml, /payments-timeline\.css\?v=20261102a/);
});

test("Search GPIR still returns indexed Australia and TerraPay research", async () => {
    const module = { exports: {} };
    const context = vm.createContext({
        module,
        console,
        document: {
            currentScript: null,
            querySelector: () => null,
            createElement: () => {
                let value = "";
                return {
                    set textContent(text){ value = text == null ? "" : String(text); },
                    get innerHTML(){ return htmlEscape(value); }
                };
            }
        },
        fetch: async url => {
            const value = String(url);
            if(value.includes("search-index.json")) return { ok: true, json: async () => searchIndex };
            if(value.includes("dashboard-metadata.json")) return { ok: true, json: async () => dashboardMetadata };
            if(value.includes("gpir-public-intelligence")) return { ok: true, json: async () => ({ records: [] }) };
            throw new Error(`Unexpected Search GPIR request: ${value}`);
        }
    });
    vm.runInContext(contentSearchSource, context);
    await module.exports.load();
    for(const query of ["Australia", "TerraPay"]){
        const result = module.exports.search(query, { limit: 8 });
        assert.ok(result.total > 0, `${query} should retain indexed research results`);
        assert.ok(result.results.some(item => `${item.pageTitle} ${item.sectionTitle} ${item.excerptHtml}`.toLowerCase().includes(query.toLowerCase())));
    }
});

test("valid recent approved alert renders summary, classification and verified source", async () => {
    const harness = await createAlertsHarness({ alerts: [validAlert()] });
    assert.match(harness.track.innerHTML, /Central bank launches verified instant-payment service/);
    assert.match(harness.track.innerHTML, /Payment Infrastructure/);
    assert.match(harness.track.innerHTML, /https:\/\/centralbank\.example\/releases\/instant-payments/);
    assert.doesNotMatch(harness.track.innerHTML, /pages\/intelligence\/live-alert\.html/);
    harness.api.openDetail("live-alert");
    assert.match(harness.body.innerHTML, /GPIR Summary/);
    assert.match(harness.body.innerHTML, /authority confirmed a new instant-payment service/);
    assert.match(harness.body.innerHTML, /Read Original Source/);
});

test("expired API alert and recent static archive record do not render live", async () => {
    const expired = validAlert({ publishedAt: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString() });
    const harness = await createAlertsHarness({ alerts: [expired] });
    assert.match(harness.track.innerHTML, /No verified alerts published in the last 12 hours/);
    assert.doesNotMatch(harness.track.innerHTML, /Static historical announcement/);
    assert.equal(harness.api.getRecords().some(record => record.id === "static-recent"), true);
});

test("unapproved alert is excluded", async () => {
    const harness = await createAlertsHarness({ alerts: [validAlert({ publicationStatus: "pending" })] });
    assert.match(harness.track.innerHTML, /No verified alerts published in the last 12 hours/);
    assert.doesNotMatch(harness.track.innerHTML, /Central bank launches/);
});

test("missing summary and malformed source URL are excluded", async () => {
    const alerts = [validAlert({ id: "missing-summary", summary: "" }), validAlert({ id: "bad-source", sourceUrl: "javascript:alert(1)" })];
    const harness = await createAlertsHarness({ alerts });
    assert.match(harness.track.innerHTML, /No verified alerts published in the last 12 hours/);
    assert.equal(harness.api.getRecordById("missing-summary"), null);
    assert.equal(harness.api.getRecordById("bad-source"), null);
});

test("API failure and legitimate empty feed render distinct readable stationary states", async () => {
    const failed = await createAlertsHarness({ apiFailure: true });
    assert.match(failed.track.innerHTML, /temporarily unavailable/);
    assert.equal(failed.track.classList.contains("ticker-track--status"), true);
    const empty = await createAlertsHarness({ alerts: [] });
    assert.match(empty.track.innerHTML, /No verified alerts published in the last 12 hours/);
    assert.doesNotMatch(empty.track.innerHTML, /temporarily unavailable/);
    assert.equal(empty.track.classList.contains("ticker-track--status"), true);
});

test("Global Alerts dark ribbon has high-contrast text, hover pause and static status styling", () => {
    assert.match(marketCss, /#market-ribbon \.ticker-card--compact\s*\{[^}]*color:#f5f7fa/s);
    assert.match(marketCss, /#market-ribbon \.ticker-empty\s*\{[^}]*color:#f7e7b2/s);
    assert.match(marketCss, /#market-ribbon \.ticker-track:hover,[\s\S]*animation-play-state:paused/);
    assert.match(marketCss, /#market-ribbon \.ticker-track\.ticker-track--status\s*\{[^}]*animation:none/s);
});
