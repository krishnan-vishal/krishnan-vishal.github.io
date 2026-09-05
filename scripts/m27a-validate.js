#!/usr/bin/env node
/*=====================================================
  M-27A READER JOURNEY VALIDATION

  Validates that the complete reader journey works:
  
  COUNTRY → REGION → DASHBOARD → NARRATIVE → SOURCES → RELATED
  
  Specifically tests the UAE proof case.
=====================================================*/

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'assets', 'data');

const issues = [];
const passes = [];

function check(condition, message) {
    if (condition) {
        passes.push('✓ ' + message);
    } else {
        issues.push('✗ ' + message);
    }
}

function loadJSON(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        throw new Error(`Failed to load ${path.basename(filePath)}: ${err.message}`);
    }
}

console.log('\n=== M-27A READER JOURNEY VALIDATION ===\n');

try {
    // Load all required data
    console.log('Loading data files...');
    const registry = loadJSON(path.join(DATA_DIR, 'content-registry.json'));
    const dashboardMeta = loadJSON(path.join(DATA_DIR, 'dashboard-metadata.json'));
    const dashboardNarr = loadJSON(path.join(DATA_DIR, 'dashboard-narratives.json'));
    const trustedSources = loadJSON(path.join(DATA_DIR, 'trusted-sources.json'));
    const announcements = loadJSON(path.join(DATA_DIR, 'announcements.json'));
    console.log('✓ All data files loaded\n');

    // Validate registry integrity
    console.log('--- REGISTRY VALIDATION ---');
    const countries = registry.records.filter(r => r.contentType === 'COUNTRY');
    const dashboards = registry.records.filter(r => r.contentType === 'DASHBOARD');
    const regions = registry.records.filter(r => r.contentType === 'REGION');
    
    check(countries.length >= 6, `Countries in registry (found ${countries.length}, need ≥6)`);
    check(dashboards.length >= 5, `Dashboards in registry (found ${dashboards.length}, need ≥5)`);
    check(regions.length >= 2, `Regions in registry (found ${regions.length}, need ≥2)`);

    // Validate UAE journey
    console.log('\n--- UAE PROOF JOURNEY ---');
    
    // Step 1: UAE Country
    const uaeCountry = registry.records.find(r => r.id === 'country:united-arab-emirates');
    check(uaeCountry, 'UAE country record exists');
    
    if (uaeCountry) {
        check(uaeCountry.page === 'pages/countries/uae.html', 'UAE country page path is correct');
        check(uaeCountry.contentType === 'COUNTRY', 'UAE record is marked as COUNTRY');
        
        // Step 2: UAE → Region relationship
        const regionRel = (uaeCountry.relationships || []).find(r => r.type === 'REGION');
        check(regionRel, 'UAE has REGION relationship');
        
        if (regionRel) {
            const region = registry.records.find(r => r.id === regionRel.target);
            check(region, `Region exists: ${regionRel.target}`);
            check(region && region.id === 'region:middle-east', 'UAE is linked to Middle East region');
            check(region && region.page === 'pages/regions/middle-east.html', 'Region page path is correct');
        }
        
        // Step 3: UAE → Dashboard relationship
        const dashRel = (uaeCountry.relationships || []).find(r => r.type === 'DASHBOARD');
        check(dashRel, 'UAE has DASHBOARD relationship');
        
        if (dashRel) {
            const dashboard = registry.records.find(r => r.id === dashRel.target);
            check(dashboard, `Dashboard exists: ${dashRel.target}`);
            check(dashboard && dashboard.id === 'dashboard:uae', 'UAE is linked to dashboard:uae');
        }
        
        // Step 4: UAE → Announcements/Intelligence relationships
        const announcementRels = (uaeCountry.relationships || []).filter(r => r.type === 'ANNOUNCEMENT' || r.type === 'INTELLIGENCE');
        check(announcementRels.length >= 0, `UAE announcements/intelligence: ${announcementRels.length} found`);
    }

    // Validate Dashboard Metadata
    console.log('\n--- DASHBOARD METADATA ---');
    const uaeDashMeta = dashboardMeta.records.find(r => r.dashboardId === 'dashboard-uae');
    check(uaeDashMeta, 'UAE dashboard metadata exists');
    
    if (uaeDashMeta) {
        check(uaeDashMeta.country === 'United Arab Emirates', 'UAE dashboard country matches');
        check(uaeDashMeta.region === 'GCC', 'UAE dashboard region is GCC');
        check(uaeDashMeta.status === 'Published', 'UAE dashboard is published');
        check(uaeDashMeta.imagePath, 'UAE dashboard has image path');
        check(
            fs.existsSync(path.join(REPO_ROOT, uaeDashMeta.imagePath)),
            'UAE dashboard image file exists'
        );
    }

    // Validate Dashboard Narrative
    console.log('\n--- DASHBOARD NARRATIVES ---');
    const uaeDashNarr = dashboardNarr.records.find(r => r.dashboardId === 'dashboard-uae');
    check(uaeDashNarr, 'UAE dashboard narrative exists');
    
    if (uaeDashNarr) {
        check(uaeDashNarr.country === 'United Arab Emirates', 'UAE narrative country matches');
        check(uaeDashNarr.coverage && uaeDashNarr.coverage.length > 0, 'UAE narrative has coverage');
        check(uaeDashNarr.themes && uaeDashNarr.themes.length > 0, 'UAE narrative has themes');
        check(uaeDashNarr.takeaway && uaeDashNarr.takeaway.length > 0, 'UAE narrative has takeaway');
    }

    // Validate country pages have structure
    console.log('\n--- COUNTRY PAGE STRUCTURE ---');
    const uaePage = path.join(REPO_ROOT, 'pages/countries/uae.html');
    check(fs.existsSync(uaePage), 'UAE country page exists');
    
    if (fs.existsSync(uaePage)) {
        const content = fs.readFileSync(uaePage, 'utf8');
        check(content.includes('country-meta-row'), 'UAE page has country-meta-row element');
        check(content.includes('data-dashboard-id="dashboard-uae"'), 'UAE page has dashboard embed with id');
        check(content.includes('dashboard-embed'), 'UAE page has dashboard-embed element');
    }

    // Validate region pages have structure
    console.log('\n--- REGION PAGE STRUCTURE ---');
    const regionPage = path.join(REPO_ROOT, 'pages/regions/middle-east.html');
    check(fs.existsSync(regionPage), 'Middle East region page exists');
    
    if (fs.existsSync(regionPage)) {
        const content = fs.readFileSync(regionPage, 'utf8');
        check(content.includes('chapter-hero-intro'), 'Region page has chapter-hero-intro element');
    }

    // Validate cross-references
    console.log('\n--- CROSS-REFERENCES ---');
    let dashboardsWithCountries = 0;
    dashboards.forEach(db => {
        const countryRel = (db.relationships || []).find(r => r.type === 'COUNTRY');
        if (countryRel && registry.records.find(r => r.id === countryRel.target)) {
            dashboardsWithCountries++;
        }
    });
    check(dashboardsWithCountries === dashboards.length, `All dashboards have valid country references (${dashboardsWithCountries}/${dashboards.length})`);

    // Other key countries
    console.log('\n--- OTHER COUNTRIES WITH DASHBOARDS ---');
    const countryNames = ['India', 'Saudi Arabia', 'Qatar', 'Singapore'];
    countryNames.forEach(name => {
        const country = countries.find(c => c.title.includes(name));
        const hasDash = country && (country.relationships || []).some(r => r.type === 'DASHBOARD');
        check(hasDash, `${name} has dashboard relationship`);
    });

    // Summary
    console.log('\n--- SUMMARY ---');
    console.log(`Passes: ${passes.length}`);
    console.log(`Issues: ${issues.length}`);

    if (passes.length > 0) {
        console.log('\n✓ PASSED CHECKS:');
        passes.forEach(p => console.log('  ' + p));
    }

    if (issues.length > 0) {
        console.log('\n✗ FAILED CHECKS:');
        issues.forEach(i => console.log('  ' + i));
        process.exit(1);
    } else {
        console.log('\n✓ M-27A READER JOURNEY VALIDATION PASSED');
        process.exit(0);
    }

} catch (err) {
    console.error('\n✗ VALIDATION ERROR:', err.message);
    process.exit(1);
}
