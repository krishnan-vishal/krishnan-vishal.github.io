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

test("homepage uses the compact directory and only three published feature cards", () => {
    assert.match(html, /<body class="m39-aligned-home">/);
    assert.match(html, /id="m39-domain-grid"/);
    assert.equal((html.match(/class="m39-feature-card"/g) || []).length, 3);
    assert.match(css, /body\.m39-aligned-home > :is\([^)]*#command-centre[^)]*#founder[^)]*\)\s*\{[^}]*display:none!important/s);
    assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
    assert.match(css, /@media\(max-width:360px\)/);
});

test("menu, footer and ASK GPIR share the aligned discovery model", () => {
    assert.match(scriptSource, /function initializeM39Alignment\(\)/);
    assert.match(scriptSource, /m39-aligned-nav/);
    assert.match(html, /class="m39-footer-links"/);
    assert.match(css, /#footer \.footer-grid,#footer \.footer-utility\{display:none!important\}/);
    assert.match(scriptSource, /gpir-public-alerts/);
    assert.match(scriptSource, /gpir-public-intelligence\?limit=100/);
    assert.match(scriptSource, /Global Alerts and historical intelligence/);
    assert.match(scriptSource, /<h3>Repository intelligence<\/h3>/);
    assert.match(scriptSource, /<h3>Coming Soon<\/h3>/);
    assert.match(scriptSource, /No result or source has been invented/);
});
