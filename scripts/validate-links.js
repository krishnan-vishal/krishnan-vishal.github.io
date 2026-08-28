#!/usr/bin/env node
/*
 * GPIR internal HTML link check.
 *
 * Checks repository-relative HTML hrefs and src values without making network
 * requests. External URLs, fragments, data URLs and non-HTML asset paths are
 * outside this check's scope.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const failures = [];
const htmlFiles = [];

function walk(dir){
    for(const entry of fs.readdirSync(dir, { withFileTypes: true })){
        if(entry.name === ".git" || entry.name === "Archive") continue;
        const fullPath = path.join(dir, entry.name);
        if(entry.isDirectory()) walk(fullPath);
        else if(entry.name.toLowerCase().endsWith(".html")) htmlFiles.push(fullPath);
    }
}

function decode(value){
    try { return decodeURIComponent(value); }
    catch(error) { return value; }
}

walk(ROOT);

for(const file of htmlFiles){
    const source = fs.readFileSync(file, "utf8");
    for(const match of source.matchAll(/(?:href|src)=["']([^"']+)["']/gi)){
        const rawTarget = match[1].split(/[?#]/)[0];
        if(!rawTarget || /^(?:#|https?:|mailto:|javascript:|data:|tel:)/i.test(rawTarget)) continue;
        const target = decode(rawTarget);
        if(!target.toLowerCase().endsWith(".html")) continue;
        const targetPath = path.resolve(path.dirname(file), target);
        if(!fs.existsSync(targetPath)) failures.push(`${path.relative(ROOT, file)} -> ${rawTarget}`);
    }
}

if(failures.length){
    console.error(`GPIR internal HTML link validation failed: ${failures.length} missing target(s)`);
    failures.forEach(failure => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log(`GPIR internal HTML link validation passed: ${htmlFiles.length} HTML files checked.`);
}
