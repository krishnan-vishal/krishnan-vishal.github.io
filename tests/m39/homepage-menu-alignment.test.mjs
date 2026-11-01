import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptSource = fs.readFileSync(path.join(root, "assets/js/script.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/css/m39-homepage-finalization.css"), "utf8");

function readDomains(){
    const match = scriptSource.match(/const GPIR_M39_DOMAINS = Object\.freeze\((\[[\s\S]*?\])\);\s*if\(typeof window/);
    assert.ok(match, "M39 domain catalogue is present");
    return vm.runInNewContext(`(${match[1]})`);
}

const domains = readDomains();

test("workbook taxonomy is represented once across eight primary groups", () => {
    assert.deepEqual(Array.from(domains, domain => domain.title), [
        "Markets",
        "Money Movement",
        "Ecosystem",
        "Rails & Infrastructure",
        "Intelligence",
        "Regulation",
        "Resources",
        "Search GPIR"
    ]);
    assert.equal(new Set(domains.map(domain => domain.id)).size, 8);
    assert.equal(domains.flatMap(domain => domain.topics).length, 51);
});

test("published and Coming Soon status counts match the canonical alignment", () => {
    const topics = domains.flatMap(domain => domain.topics);
    const published = topics.filter(topic => topic.status !== "coming-soon");
    const comingSoon = topics.filter(topic => topic.status === "coming-soon");
    assert.equal(published.length, 38);
    assert.equal(comingSoon.length, 13);
    assert.ok(published.every(topic => topic.href && topic.authority));
    assert.ok(comingSoon.every(topic => !topic.href));
});

test("every published local destination resolves to an existing route", () => {
    const hrefs = domains.flatMap(domain => [domain.landing, ...domain.topics.map(topic => topic.href)]).filter(Boolean);
    for(const href of new Set(hrefs)){
        if(href.startsWith("mailto:") || href.startsWith("/#")) continue;
        assert.ok(href.startsWith("/"), `route is root-relative: ${href}`);
        const routePath = href.slice(1).split("#")[0];
        const filePath = routePath.endsWith("/") ? path.join(root, routePath, "index.html") : path.join(root, routePath);
        assert.equal(fs.existsSync(filePath), true, `published destination exists: ${href}`);
    }
});

test("homepage restores the approved production visual structure", () => {
    assert.match(html, /<body>/);
    assert.doesNotMatch(html, /m39-aligned-home|id="m39-directory"|id="featured-intelligence"/);
    for(const id of ["command-centre", "dashboard-gallery", "architecture-library", "intelligence-library", "payments-timeline", "repository", "research", "market-gallery", "global", "observatory", "about", "founder"]){
        assert.match(html, new RegExp(`id="${id}"`), `production section is present: ${id}`);
    }
    assert.match(html, /Payment Verticals/i);
    assert.match(html, /Industry &amp; Infrastructure/i);
    assert.match(html, /Regional &amp; Strategic/i);
    assert.match(html, /class="footer-grid"/);
    assert.match(html, /class="footer-utility"/);
});

test("production mega-menu and footer remain authoritative while ASK GPIR stays aligned", () => {
    assert.doesNotMatch(scriptSource, /function initializeM39Alignment\(\)|m39-aligned-nav/);
    assert.match(html, /class="mega-menu-inner mega-menu-inner--headed"/);
    assert.ok((html.match(/class="mega-col mega-col--headed"/g) || []).length >= 3);
    assert.match(html, /class="mega-col-icon"/);
    assert.match(html, /class="footer-cta"/);
    assert.doesNotMatch(html, /class="m39-footer-links"/);
    assert.doesNotMatch(css, /body:has|m39-domain|m39-menu-inner|#footer/);
    assert.match(css, /\.m39-ask-context/);
    assert.match(css, /#intelligence-library \.m39-coming-soon/);
    assert.match(scriptSource, /gpir-public-alerts/);
    assert.match(scriptSource, /gpir-public-intelligence\?limit=100/);
    assert.match(scriptSource, /Global Alerts and historical intelligence/);
    assert.match(scriptSource, /<h3>Repository intelligence<\/h3>/);
    assert.match(scriptSource, /<h3>Coming Soon<\/h3>/);
    assert.match(scriptSource, /No result or source has been invented/);
});
