#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_ROOT = path.join(ROOT, ".cloudflare-preview-dist");

// The repository root mixes public site files with internal tooling and governance.
// Keep every preview input explicit so adding a repository file cannot publish it.
const ROOT_FILES = [
  "404.html",
  "index.html",
  "robots.txt",
  "site.webmanifest",
  "sitemap.xml",
];

const PUBLIC_SITE_DIRECTORIES = [
  "africa-country-directory-gpir-regional-intelligence-fintechoisis",
  "americas-country-directory-gpir-regional-intelligence-fintechoisis",
  "apac-country-directory-gpir-regional-intelligence-fintechoisis",
  "auth",
  "cards-intelligence-gpir-domain-fintechoisis",
  "cross-border-payments",
  "europe-sepa-country-directory-gpir-regional-intelligence-fintechoisis",
  "global-and-cross-border-payments-market-intelligence-report",
  "global-cross-border-bill-payments-family-financial-services-gpir-research-fintechoisis",
  "global-cross-border-corridor-factbook-gpir-research-fintechoisis",
  "global-education-payments-industry-gpir-research-fintechoisis",
  "global-gaming-payments-industry-gpir-research-fintechoisis",
  "global-gig-economy-freelancer-creator-payments-industry-gpir-research-fintechoisis",
  "global-government-tax-public-sector-payments-ecosystem-gpir-research-fintechoisis",
  "global-healthcare-medical-tourism-cross-border-health-payments-gpir-research-fintechoisis",
  "global-legalized-betting-gambling-lottery-wagering-payments-gpir-research-fintechoisis",
  "global-marketplace-e-commerce-seller-payouts-industry-gpir-research-fintechoisis",
  "global-payment-infrastructure-networks-interoperability-gpir-research-fintechoisis",
  "global-payments-landscape",
  "global-remittance-diaspora-payments-industry-c2c-gpir-research-fintechoisis",
  "global-rtp-directory-instant-payments-factbook-gpir-research-fintechoisis",
  "global-trade-payments-industry-b2b-gpir-research-fintechoisis",
  "global-travel-airline-hospitality-payments-ecosystem-gpir-research-fintechoisis",
  "global-wallets-mobile-money-super-apps-financial-inclusion-gpir-research-fintechoisis",
  "india-gpir-country-intelligence-fintechoisis",
  "industry-future-state-2025-2040-gpir-research-fintechoisis",
  "industry-participant-analysis-banks-fintechs-networks-wallets-gpir-research-fintechoisis",
  "latam-country-directory-gpir-regional-intelligence-fintechoisis",
  "middle-east-gcc-country-directory-gpir-regional-intelligence-fintechoisis",
  "pages",
  "reader",
  "singapore-gpir-country-intelligence-fintechoisis",
  "stablecoins-cbdcs-tokenized-money-digital-asset-payments-gpir-research-fintechoisis",
  "stablecoins-cross-border-money-movement-c2c",
  "strategic-opportunities-industry-scorecards-action-frameworks-gpir-research-fintechoisis",
  "top-global-cross-border-payments-companies-industry-participants-gpir-research-fintechoisis",
  "united-arab-emirates-gpir-country-intelligence-fintechoisis",
  "united-kingdom-gpir-country-intelligence-fintechoisis",
];

const PUBLIC_BROWSER_SCRIPTS = [
  "scripts/m34/publication-authorization-provider.js",
  "scripts/m34/supabase-browser-client.js",
];

const PUBLIC_DATA_FILES = [
  "assets/data/announcements.json",
  "assets/data/content-registry.json",
  "assets/data/country-intelligence.json",
  "assets/data/dashboard-metadata.json",
  "assets/data/dashboard-narratives.json",
  "assets/data/africa-countries.json",
  "assets/data/americas-countries.json",
  "assets/data/apac-countries.json",
  "assets/data/latam-countries.json",
  "assets/data/middle-east-countries.json",
  "assets/data/search-index.json",
  "assets/data/sepa-countries.json",
  "assets/data/source-health.json",
  "assets/data/trusted-sources.json",
  "assets/data/world-map-countries.json",
];

const PUBLIC_EXTENSIONS = new Set([
  ".css", ".gif", ".html", ".ico", ".jpeg", ".jpg", ".js", ".json",
  ".mjs", ".otf", ".pdf", ".png", ".svg", ".ttf", ".txt", ".webp",
  ".woff", ".woff2", ".xml",
]);

const EXCLUDED_ASSET_FILES = new Set([
  "assets/css/template.css",
  "assets/js/gpir-paypal-sandbox-checkout.mjs",
  "assets/js/template.js",
]);

const FORBIDDEN_EXTENSIONS = new Set([
  ".docx", ".md", ".patch", ".sql", ".toml", ".xlsx", ".yaml", ".yml",
]);

function normalise(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function assertSafeOutputPath() {
  const expectedParent = `${ROOT}${path.sep}`;
  if (path.basename(OUTPUT_ROOT) !== ".cloudflare-preview-dist"
      || !OUTPUT_ROOT.startsWith(expectedParent)) {
    throw new Error(`Refusing to manage unsafe output path: ${OUTPUT_ROOT}`);
  }
}

function copyFile(relativePath) {
  const source = path.join(ROOT, relativePath);
  const destination = path.join(OUTPUT_ROOT, relativePath);
  if (!fs.statSync(source).isFile()) {
    throw new Error(`Required public file is not a regular file: ${relativePath}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyTree(relativeDirectory, shouldCopy = () => true) {
  const sourceDirectory = path.join(ROOT, relativeDirectory);
  if (!fs.statSync(sourceDirectory).isDirectory()) {
    throw new Error(`Required public directory is missing: ${relativeDirectory}`);
  }

  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativeDirectory, entry.name);
    const publicPath = normalise(relativePath);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symlinks are not permitted in preview output: ${publicPath}`);
    }
    if (entry.isDirectory()) {
      copyTree(relativePath, shouldCopy);
    } else if (entry.isFile() && shouldCopy(publicPath)) {
      copyFile(relativePath);
    }
  }
}

function collectFiles(relativeDirectory = "") {
  const absoluteDirectory = path.join(OUTPUT_ROOT, relativeDirectory);
  const files = [];
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(relativePath));
    } else if (entry.isFile()) {
      files.push(normalise(relativePath));
    }
  }
  return files;
}

function resolvePublicReference(reference) {
  const withoutQuery = reference.split(/[?#]/, 1)[0];
  if (!withoutQuery || /^(?:[a-z]+:|\/\/)/i.test(withoutQuery)) {
    return null;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    throw new Error(`Invalid URL encoding in homepage reference: ${reference}`);
  }
  const relativePath = decoded.replace(/^\/+/, "");
  const absolutePath = path.resolve(OUTPUT_ROOT, relativePath);
  if (absolutePath !== OUTPUT_ROOT && !absolutePath.startsWith(`${OUTPUT_ROOT}${path.sep}`)) {
    throw new Error(`Homepage reference escapes preview output: ${reference}`);
  }
  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
    return path.join(absolutePath, "index.html");
  }
  return decoded.endsWith("/") ? path.join(absolutePath, "index.html") : absolutePath;
}

function verifyOutput() {
  const files = collectFiles();
  const fileSet = new Set(files);
  const requiredFiles = [
    "index.html",
    "404.html",
    "assets/css/header.css",
    "assets/css/market.css",
    "assets/js/script.js",
    "assets/js/announcements.js",
    "assets/data/announcements.json",
    "assets/data/search-index.json",
    "assets/branding/logos/fo-mark.svg",
    "assets/branding/logos/fo-logo-horizontal.svg",
    "pages/intelligence/index.html",
    "reader/sign-in/index.html",
    "auth/callback/index.html",
    ...PUBLIC_BROWSER_SCRIPTS,
  ];
  for (const requiredFile of requiredFiles) {
    if (!fileSet.has(requiredFile)) {
      throw new Error(`Required public asset was not generated: ${requiredFile}`);
    }
  }

  const forbiddenPrefixes = [
    ".github/", "Archive/", "artifacts/", "docs/", "Master-Libraries/",
    "release/", "schemas/", "supabase/", "tests/",
  ];
  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (forbiddenPrefixes.some((prefix) => file.startsWith(prefix))
        || FORBIDDEN_EXTENSIONS.has(extension)
        || (file.startsWith("scripts/") && !PUBLIC_BROWSER_SCRIPTS.includes(file))) {
      throw new Error(`Internal or development file reached preview output: ${file}`);
    }
  }

  for (const forbiddenFile of [
    "AGENTS.md", "README.md", "SECURITY.md", "wrangler.jsonc",
    "assets/data/content-model.json", "assets/data/intelligence-candidates.json",
    "assets/data/wave-a-country-matrix.json",
    "assets/js/gpir-paypal-sandbox-checkout.mjs",
  ]) {
    if (fileSet.has(forbiddenFile)) {
      throw new Error(`Forbidden file reached preview output: ${forbiddenFile}`);
    }
  }

  const homepage = fs.readFileSync(path.join(OUTPUT_ROOT, "index.html"), "utf8");
  const referencePattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  for (const match of homepage.matchAll(referencePattern)) {
    const target = resolvePublicReference(match[1]);
    if (target && (!fs.existsSync(target) || !fs.statSync(target).isFile())) {
      throw new Error(`Homepage reference is missing from preview output: ${match[1]}`);
    }
  }

  const totalBytes = files.reduce(
    (sum, file) => sum + fs.statSync(path.join(OUTPUT_ROOT, file)).size,
    0,
  );
  const digest = crypto.createHash("sha256");
  for (const file of files) {
    digest.update(file);
    digest.update("\0");
    digest.update(fs.readFileSync(path.join(OUTPUT_ROOT, file)));
  }
  console.log(
    `Cloudflare preview output verified: ${files.length} public files, ${totalBytes} bytes, SHA-256 ${digest.digest("hex")}.`,
  );
}

function main() {
  assertSafeOutputPath();
  fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  if (process.argv.includes("--clean")) {
    console.log(`Removed ${OUTPUT_ROOT}`);
    return;
  }

  for (const rootFile of ROOT_FILES) copyFile(rootFile);
  for (const directory of PUBLIC_SITE_DIRECTORIES) {
    copyTree(directory, (publicPath) => PUBLIC_EXTENSIONS.has(path.extname(publicPath).toLowerCase()));
  }

  copyTree("assets", (publicPath) => {
    if (publicPath.startsWith("assets/data/")) return false;
    if (EXCLUDED_ASSET_FILES.has(publicPath)) return false;
    return PUBLIC_EXTENSIONS.has(path.extname(publicPath).toLowerCase());
  });
  for (const dataFile of PUBLIC_DATA_FILES) copyFile(dataFile);
  copyTree("assets/data/fx", (publicPath) => path.extname(publicPath).toLowerCase() === ".json");
  for (const browserScript of PUBLIC_BROWSER_SCRIPTS) copyFile(browserScript);

  verifyOutput();
}

main();
