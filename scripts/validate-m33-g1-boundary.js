#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const LEGACY_PATH = "scraper.js";
const LEGACY_SHA256 = "b004be4cd943aa0b4959af261615706b16f378142a09bd4395b1899779326bd0";
const CODE_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".sql", ".ts", ".yaml", ".yml"]);
const EXCLUDED_DIRECTORIES = new Set([
    ".git",
    "Archive",
    "Master-Libraries",
    "assets/data",
    "docs",
    "node_modules",
    "pages"
]);
const PROTECTED_FILES = new Set([
    ".github/workflows/continuous-intelligence.yml",
    ".github/workflows/run-ticker.yml",
    "CNAME",
    "assets/css/chapter-page.css",
    "assets/css/page.css",
    "assets/css/supabase-ticker.css",
    "assets/data/announcements.json",
    "assets/data/content-registry.json",
    "assets/data/intelligence-candidates.json",
    "assets/data/trusted-sources.json",
    "assets/js/announcement-dashboard.js",
    "assets/js/announcement-lifecycle.js",
    "assets/js/announcements.js",
    "assets/js/supabase-announcements.js",
    "assets/js/supabase-archive.js",
    "assets/js/supabase-combined-engine.js",
    "index.html",
    "scraper.js",
    "scripts/generate-intelligence-pages.js",
    "scripts/publish-intelligence-candidates.js"
]);

function normalizePath(filePath) {
    return String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function sha256(source) {
    return crypto.createHash("sha256").update(source).digest("hex");
}

function directPublicationSignals(source) {
    const text = String(source || "");
    const table = /global_announcements/i.test(text);
    const mutation = /\.(?:insert|upsert|update)\s*\(/i.test(text) ||
        /\b(?:insert\s+into|update)\s+(?:public\.)?["'`]?global_announcements\b/i.test(text) ||
        /\bmethod\s*:\s*["'`](?:POST|PUT|PATCH|DELETE)["'`]/i.test(text);
    const approves = /publication[_-]?status[\s\S]{0,80}approved/i.test(text);
    const tickerEligible = /ticker[_-]?eligible[\s\S]{0,80}(?:true|["'`]true["'`]|=\s*1)/i.test(text);

    return {
        table,
        mutation,
        approves,
        tickerEligible,
        directPublication: table && mutation && (approves || tickerEligible)
    };
}

function classifySource(filePath, source) {
    const relativePath = normalizePath(filePath);
    const signals = directPublicationSignals(source);

    if (!signals.directPublication) {
        return { classification: "SAFE", filePath: relativePath, signals };
    }

    if (relativePath === LEGACY_PATH && sha256(source) === LEGACY_SHA256) {
        return { classification: "LEGACY_BASELINE", filePath: relativePath, signals };
    }

    return { classification: "NEW_VIOLATION", filePath: relativePath, signals };
}

function isExcluded(relativePath) {
    const normalized = normalizePath(relativePath);
    return [...EXCLUDED_DIRECTORIES].some(directory =>
        normalized === directory || normalized.startsWith(`${directory}/`));
}

function collectImplementationFiles(directory = ROOT, collected = []) {
    fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
        const absolutePath = path.join(directory, entry.name);
        const relativePath = normalizePath(path.relative(ROOT, absolutePath));

        if (isExcluded(relativePath)) return;
        if (entry.isDirectory()) {
            collectImplementationFiles(absolutePath, collected);
            return;
        }
        if (!entry.isFile() || !CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return;
        if (/^(?:test-|validate-m33-g1-boundary\.js$)/i.test(entry.name)) return;
        collected.push(relativePath);
    });

    return collected.sort();
}

function git(args) {
    return execFileSync("git", args, {
        cwd: ROOT,
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
    }).trim();
}

function lines(value) {
    return String(value || "").split(/\r?\n/).map(normalizePath).filter(Boolean);
}

function mainBaseline() {
    for (const reference of ["origin/main", "main"]) {
        try {
            git(["rev-parse", "--verify", reference]);
            return git(["merge-base", "HEAD", reference]);
        } catch {
            // Try the next repository-local main reference.
        }
    }
    throw new Error("Unable to resolve a main branch reference for protected-surface validation");
}

function changedFiles() {
    const baseline = mainBaseline();
    const changed = new Set([
        ...lines(git(["diff", "--name-only", "--diff-filter=ACMRTUXB", `${baseline}...HEAD`])),
        ...lines(git(["diff", "--name-only", "--diff-filter=ACMRTUXB"])),
        ...lines(git(["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB"])),
        ...lines(git(["ls-files", "--others", "--exclude-standard"]))
    ]);
    return [...changed].sort();
}

function isProtected(filePath) {
    const normalized = normalizePath(filePath);
    if (PROTECTED_FILES.has(normalized) || normalized.startsWith("pages/")) return true;
    return /^(?:assets\/css|assets\/js)\/[^/]*(?:announcement|ticker)[^/]*\.(?:css|js)$/i.test(normalized);
}

function runSelfTest() {
    let checks = 0;
    const legacySource = fs.readFileSync(path.join(ROOT, LEGACY_PATH), "utf8");
    assert.strictEqual(
        classifySource(LEGACY_PATH, legacySource).classification,
        "LEGACY_BASELINE",
        "known scraper.js condition must remain explicitly classified as LEGACY_BASELINE"
    );
    checks += 1;

    const unsafeFixture = `
        client.from("global_announcements").upsert([{
            publication_status: "approved",
            ticker_eligible: true
        }]);
    `;
    assert.strictEqual(
        classifySource("scripts/m33-new-acquisition.js", unsafeFixture).classification,
        "NEW_VIOLATION",
        "new direct approved/ticker publication must fail"
    );
    checks += 1;

    const rawFixture = `
        client.from("intelligence_raw_evidence").insert([{
            review_state: "REVIEW",
            publication_status: "not_published"
        }]);
    `;
    assert.strictEqual(
        classifySource("scripts/m33-raw-acquisition.js", rawFixture).classification,
        "SAFE",
        "RAW/staging-only acquisition must pass"
    );
    checks += 1;

    return checks;
}

function validateBoundary() {
    const results = collectImplementationFiles().map(filePath =>
        classifySource(filePath, fs.readFileSync(path.join(ROOT, filePath), "utf8")));
    const legacy = results.filter(result => result.classification === "LEGACY_BASELINE");
    const violations = results.filter(result => result.classification === "NEW_VIOLATION");
    const protectedChanges = changedFiles().filter(isProtected);
    const errors = [];

    if (legacy.length !== 1 || legacy[0].filePath !== LEGACY_PATH) {
        errors.push("The exact scraper.js legacy baseline was not detected; baseline drift requires explicit review");
    }
    violations.forEach(result => errors.push(`New direct-publication path: ${result.filePath}`));
    protectedChanges.forEach(filePath => errors.push(`Protected publication surface modified: ${filePath}`));

    return { errors, legacy, violations, protectedChanges };
}

function main() {
    try {
        const selfTestChecks = runSelfTest();
        console.log(`M33-G1 boundary self-test: PASS (${selfTestChecks} checks)`);
        if (process.argv.includes("--self-test")) return;

        const result = validateBoundary();
        console.log(`M33-G1 boundary validation: ${result.errors.length ? "FAIL" : "PASS"}`);
        if (result.legacy.length) {
            result.legacy.forEach(item =>
                console.log(`Legacy direct-publication path detected: ${item.filePath} [LEGACY_BASELINE]`));
        } else {
            console.log("Legacy direct-publication path detected: NONE [BASELINE_DRIFT]");
        }
        console.log(`New direct-publication violations: ${result.violations.length}`);
        console.log(`Protected publication surfaces modified: ${result.protectedChanges.length}`);

        if (result.errors.length) {
            result.errors.forEach(error => console.error(`- ${error}`));
            process.exitCode = 1;
        }
    } catch (error) {
        console.error(`M33-G1 boundary validation: ERROR - ${error.message}`);
        process.exitCode = 1;
    }
}

if (require.main === module) main();

module.exports = {
    classifySource,
    directPublicationSignals,
    isProtected,
    runSelfTest,
    validateBoundary
};
