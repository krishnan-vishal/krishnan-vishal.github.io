#!/usr/bin/env node
/*
 * GPIR Performance Governance Audit
 * ----------------------------------
 * A dev-time (not runtime) check that flags likely performance
 * regressions before a new page/asset is published — per
 * docs/PERFORMANCE_ARCHITECTURE.md's governance rules. It does not
 * block anything by itself; run it locally (`node scripts/gpir-perf-
 * audit.js`) before committing new content and read the report.
 *
 * Checks:
 *   1. Images: missing width/height, missing alt attribute, large
 *      images with no responsive variant/srcset.
 *   2. Duplicate/near-duplicate media (identical bytes, or filenames
 *      suggesting an accidental "-final"/"-new"/"-copy" duplicate).
 *   3. Search index size vs the documented 2/3/4/5MB warning ladder.
 *   4. Reduced-motion coverage for every continuous (infinite) CSS
 *      animation found (heuristic — flags for human review, not a
 *      hard guarantee).
 *   5. Global-script audit: which <script> files are loaded on how
 *      many pages, flagging component-specific scripts (the world
 *      map) that have started loading somewhere they shouldn't.
 *
 * Exit code is always 0 -- this is advisory, matching "the objective
 * is not to block development unnecessarily" in the v3 sprint spec.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const LARGE_IMAGE_BYTES = 150 * 1024; // 150KB - above this, expect a responsive variant
const SEARCH_INDEX_THRESHOLDS = [2, 3, 4, 5]; // MB warning ladder per spec
const PAGE_SPECIFIC_SCRIPTS = ["world-map.js"]; // must load on exactly the pages that use them

let warnCount = 0;
let infoCount = 0;
const warn = (msg) => { console.log("WARN  " + msg); warnCount++; };
const info = (msg) => { console.log("info  " + msg); infoCount++; };
const ok = (msg) => console.log("ok    " + msg);
const section = (title) => console.log("\n=== " + title + " ===");

function walk(dir, filterExt, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "Archive" || entry.name === "node_modules" || entry.name.startsWith(".git")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, filterExt, out);
        else if (!filterExt || filterExt.some(ext => entry.name.toLowerCase().endsWith(ext))) out.push(full);
    }
    return out;
}

const htmlFiles = walk(ROOT, [".html"]).filter(f => !f.includes(path.sep + "Archive" + path.sep));

/* ---------------------------------------------------------
   1. IMAGE AUDIT
--------------------------------------------------------- */
section("1. Image audit (dimensions, alt, responsive delivery)");

const IMG_TAG_RE = /<img\b[^>]*>/gi;

for (const file of htmlFiles) {
    const rel = path.relative(ROOT, file);
    const html = fs.readFileSync(file, "utf8");
    const tags = html.match(IMG_TAG_RE) || [];

    for (const tag of tags) {
        const src = (tag.match(/\bsrc=["']([^"']+)["']/) || [])[1];
        if (!src || src.startsWith("data:")) continue;

        const hasWidth = /\bwidth=["']\d+["']/.test(tag);
        const hasHeight = /\bheight=["']\d+["']/.test(tag);
        const hasAlt = /\balt=/.test(tag); // alt="" is valid (decorative) — only flag if the attribute is absent entirely
        const hasSrcset = /\bsrcset=/.test(tag);
        // These classes carry explicit CSS width/height everywhere they're
        // used (header.css / footer.css / country-intelligence.css) — CSS
        // is render-blocking and parsed before the image fetches, so the
        // box is already reserved. The HTML attribute would be redundant,
        // not a real CLS gap. Add a class here only after confirming it
        // has an unconditional CSS width+height rule, not just a max-width.
        const CSS_SIZED_CLASSES = ["flag-icon", "brand-logo", "footer-logo"];
        const isCssSizedIcon = CSS_SIZED_CLASSES.some(cls =>
            new RegExp(`class=["'][^"']*\\b${cls}\\b[^"']*["']`).test(tag)
        );

        if ((!hasWidth || !hasHeight) && !isCssSizedIcon) {
            warn(`${rel}: <img src="${src}"> missing width/height (CLS risk)`);
        }
        if (!hasAlt) {
            warn(`${rel}: <img src="${src}"> has no alt attribute at all`);
        }

        // Resolve the actual file to check size, skipping external/absolute URLs.
        if (!/^https?:\/\//.test(src)) {
            const imgPath = path.resolve(path.dirname(file), src.split("?")[0]);
            if (fs.existsSync(imgPath)) {
                const bytes = fs.statSync(imgPath).size;
                if (bytes > LARGE_IMAGE_BYTES && !hasSrcset && !tag.includes("<picture")) {
                    warn(`${rel}: ${src} is ${(bytes/1024).toFixed(0)}KB with no srcset — needs a responsive variant (see docs/PERFORMANCE_ARCHITECTURE.md §3.3 GPIRImage convention)`);
                }
            }
        }
    }
}
ok("image audit complete");

/* ---------------------------------------------------------
   2. DUPLICATE / NEAR-DUPLICATE MEDIA
--------------------------------------------------------- */
section("2. Duplicate / near-duplicate media");

// assets/master-libraries is a source/staging archive, never referenced
// from any served page (verified: `grep -rl master-libraries **/*.html`
// finds nothing) -- comparing it against served assets doesn't inform
// page performance, which is what this check exists for.
const NON_SERVED_DIRS = ["master-libraries"];

const mediaFiles = walk(path.join(ROOT, "assets"), [".png", ".jpg", ".jpeg", ".webp", ".svg"])
    .filter(f => !NON_SERVED_DIRS.some(d => f.includes(path.sep + d + path.sep)))
    .filter(f => fs.statSync(f).size > 0); // 0-byte stub files hash-match trivially and aren't a real duplicate

const hashToFiles = new Map();
const suspiciousNameRe = /-(final|final2|new|copy|old|v2|v3|draft)(\.[a-z]+)$/i;
const suspiciousNames = [];

for (const f of mediaFiles) {
    const buf = fs.readFileSync(f);
    const hash = crypto.createHash("sha1").update(buf).digest("hex");
    const rel = path.relative(ROOT, f);
    if (!hashToFiles.has(hash)) hashToFiles.set(hash, []);
    hashToFiles.get(hash).push(rel);
    if (suspiciousNameRe.test(path.basename(f))) suspiciousNames.push(rel);
}

let dupGroups = 0;
for (const [, files] of hashToFiles) {
    if (files.length > 1) {
        dupGroups++;
        warn(`byte-identical duplicate media (${files.length} copies): ${files.join(", ")}`);
    }
}
if (dupGroups === 0) ok("no byte-identical duplicate media found");

if (suspiciousNames.length) {
    for (const n of suspiciousNames) info(`filename suggests a leftover duplicate/draft, review before publishing: ${n}`);
} else {
    ok("no filenames matching the -final/-new/-copy/-old duplicate pattern");
}

/* ---------------------------------------------------------
   3. SEARCH INDEX SIZE
--------------------------------------------------------- */
section("3. Search index growth");

const indexPath = path.join(ROOT, "assets/data/search-index.json");
if (fs.existsSync(indexPath)) {
    const mb = fs.statSync(indexPath).size / (1024 * 1024);
    const crossed = SEARCH_INDEX_THRESHOLDS.filter(t => mb >= t);
    if (crossed.length) {
        warn(`search-index.json is ${mb.toFixed(2)}MB — has crossed the ${crossed[crossed.length-1]}MB warning level (migration trigger is ~3-5MB, see docs/PERFORMANCE_ARCHITECTURE.md §7)`);
    } else {
        ok(`search-index.json is ${mb.toFixed(2)}MB (next warning level: ${SEARCH_INDEX_THRESHOLDS.find(t => t > mb)}MB)`);
    }
} else {
    warn("assets/data/search-index.json not found");
}

/* ---------------------------------------------------------
   4. REDUCED-MOTION COVERAGE (heuristic)
--------------------------------------------------------- */
section("4. Reduced-motion coverage for continuous animations");

const cssFiles = walk(path.join(ROOT, "assets/css"), [".css"]);
const jsFiles = walk(path.join(ROOT, "assets/js"), [".js"]);

const reducedMotionBlocks = [];
for (const f of cssFiles) {
    const css = fs.readFileSync(f, "utf8");
    const re = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}/g;
    let m;
    while ((m = re.exec(css))) reducedMotionBlocks.push({ file: path.relative(ROOT, f), body: m[1] });
}

// A reduced-motion override virtually never repeats the @keyframes name
// (it sets animation:none on the SELECTOR that uses it) -- so the useful
// heuristic is "does the selector declaring this animation also appear
// as a selector inside some prefers-reduced-motion block", not "does the
// animation name appear inside that block".
const infiniteAnimations = [];
for (const f of cssFiles) {
    const css = fs.readFileSync(f, "utf8");
    const re = /([^{}]+)\{[^{}]*\banimation\s*:\s*([A-Za-z0-9_-]+)[^;{}]*\binfinite\b[^{}]*\}/g;
    let m;
    while ((m = re.exec(css))) {
        const selector = m[1].trim().split("\n").pop().trim(); // last selector before the opening brace, handles multi-line rules
        infiniteAnimations.push({ file: path.relative(ROOT, f), name: m[2], selector });
    }
}
for (const f of jsFiles) {
    const js = fs.readFileSync(f, "utf8");
    const re = /\.style\.animation\s*=\s*["'`][^"'`]*?([A-Za-z0-9_-]+)\s+[\d.]+s[^"'`]*\binfinite\b/g;
    let m;
    while ((m = re.exec(js))) infiniteAnimations.push({ file: path.relative(ROOT, f), name: m[1], jsApplied: true });
}

for (const anim of infiniteAnimations) {
    const covered = anim.selector && reducedMotionBlocks.some(b => b.body.includes(anim.selector))
        || (anim.jsApplied && jsFiles.some(f => {
            const js = fs.readFileSync(f, "utf8");
            return js.includes("reduceMotion") && js.includes(anim.name.replace(/Flow$|Pulse$/, ""));
        }));
    if (covered) {
        ok(`@keyframes ${anim.name} (${anim.file}, selector ${anim.selector || "n/a"}): reduced-motion coverage found`);
    } else {
        warn(`@keyframes ${anim.name} (${anim.file}, selector ${anim.selector || "n/a"}): no matching prefers-reduced-motion override found — verify manually before publishing`);
    }
}
if (!infiniteAnimations.length) ok("no continuous (infinite) animations found");

/* ---------------------------------------------------------
   5. GLOBAL SCRIPT LOAD AUDIT
--------------------------------------------------------- */
section("5. Global vs page-specific script loading");

const scriptCounts = new Map();
for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const re = /<script[^>]*\bsrc=["']([^"']*assets\/js\/[^"']+)["']/g;
    let m;
    const seenInFile = new Set();
    while ((m = re.exec(html))) {
        const name = m[1].split("/").pop().split("?")[0];
        if (seenInFile.has(name)) continue;
        seenInFile.add(name);
        scriptCounts.set(name, (scriptCounts.get(name) || 0) + 1);
    }
}

const totalPages = htmlFiles.length;
for (const scriptName of PAGE_SPECIFIC_SCRIPTS) {
    const count = scriptCounts.get(scriptName) || 0;
    if (count > 1) {
        warn(`${scriptName} is loaded on ${count} pages but is documented as page-specific (homepage-only) — check for scope creep`);
    } else if (count === 1) {
        ok(`${scriptName} loads on exactly 1 page, as expected`);
    } else {
        info(`${scriptName} not found in any page (removed or renamed?)`);
    }
}

for (const [name, count] of [...scriptCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const pct = ((count / totalPages) * 100).toFixed(0);
    if (count === totalPages) console.log(`  global   ${name} — all ${totalPages} pages`);
    else console.log(`  scoped   ${name} — ${count}/${totalPages} pages (${pct}%)`);
}

/* ---------------------------------------------------------
   SUMMARY
--------------------------------------------------------- */
section("SUMMARY");
console.log(`${warnCount} warning(s), ${infoCount} informational note(s).`);
console.log("This is advisory only — review flagged items, it does not block anything.");
process.exit(0);
