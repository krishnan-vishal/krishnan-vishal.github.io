import assert from "node:assert/strict";
import test from "node:test";

import {
    assertOfficialSourceUrl,
    lifecycleForTimestamp,
    ofacDeltaUrl,
    parseFatfStatement,
    parseOfacDelta,
    parseOfacRecentActions,
    parseOfacSnapshotMetadata,
    validateBackfillWindow
} from "../../supabase/functions/_shared/gpir-regulatory-sources.mjs";

test("official source allowlists reject lookalike and non-HTTPS URLs", () => {
    assert.equal(assertOfficialSourceUrl("https://ofac.treasury.gov/recent-actions", "OFAC"),
        "https://ofac.treasury.gov/recent-actions");
    assert.throws(() => assertOfficialSourceUrl("https://ofac.treasury.gov.evil.example/x", "OFAC"),
        /UNAPPROVED_SOURCE_URL/);
    assert.throws(() => assertOfficialSourceUrl("http://www.fatf-gafi.org/x", "FATF"),
        /UNAPPROVED_SOURCE_URL/);
});

test("OFAC current snapshot metadata is never emitted as historical events", () => {
    const metadata = parseOfacSnapshotMetadata(
        '<sdnList><publshInformation><Publish_Date>11/18/2026</Publish_Date><Record_Count>2</Record_Count></publshInformation><sdnEntry/><sdnEntry/></sdnList>',
        "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML"
    );
    assert.equal(metadata.documentKind, "CURRENT_FULL_SNAPSHOT");
    assert.equal(metadata.recordCount, 2);
    assert.equal(metadata.historicalProof, false);
    assert.equal(metadata.eventCount, 0);
    assert.equal("events" in metadata, false);
});

test("OFAC delta actions preserve additions, removals and amendments", () => {
    const xml = '<Delta>' +
        '<DistinctParty action="add"><FixedRef>123</FixedRef><FormattedFullName>Example Entity</FormattedFullName><SanctionsProgram>TEST</SanctionsProgram></DistinctParty>' +
        '<DistinctParty action="remove"><FixedRef>456</FixedRef><FormattedFullName>Removed Entity</FormattedFullName></DistinctParty>' +
        '<DistinctParty action="update"><FixedRef>789</FixedRef><FormattedFullName>Changed Entity</FormattedFullName></DistinctParty>' +
        '</Delta>';
    const rows = parseOfacDelta(xml, {
        sourceUrl: "https://sanctionslistservice.ofac.treas.gov/api/download/delta?filename=DeltaArchive%2F2026-11-18_delta.xml",
        publishedDate: "2026-11-18T15:30:00Z"
    });
    assert.deepEqual(rows.map(row => row.action), ["ADDED", "REMOVED", "AMENDED"]);
    assert(rows.every(row => row.currentSnapshotProof === false));
});

test("OFAC recent actions retain date-only precision instead of inventing a time", () => {
    const rows = parseOfacRecentActions(
        '<article><a href="/recent-actions/20261118_44">Counter Terrorism Designations</a><time>November 18, 2026</time></article>'
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].publicationDate, "2026-11-18");
    assert.equal(rows[0].exactTimestamp, null);
    assert.equal(rows[0].timePrecision, "DATE_ONLY");
});

test("FATF official designations remain separate from GPIR analytical risk and OFAC exposure", () => {
    const rows = parseFatfStatement(
        '<html><body><p>Financial Action Task Force (FATF)</p><p>30 October 2026</p>' +
        '<h3>Angola</h3><h3>Kenya</h3><h3>Viet Nam</h3></body></html>',
        {
            sourceUrl: "https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/increased-monitoring-october-2026.html",
            designation: "FATF_INCREASED_MONITORING",
            publicationDate: "2026-10-30"
        }
    );
    assert.deepEqual(rows.map(row => row.countryCode), ["AGO", "KEN", "VNM"]);
    assert(rows.every(row => row.gpirAnalyticalRisk === "UNRATED"));
    assert(rows.every(row => row.ofacJurisdictionSanctioned === null));
    assert(rows.every(row => row.ofacExposureStatus === "NOT_ASSESSED"));
});

test("backfill is bounded, restartable by window and date-addressed", () => {
    assert.deepEqual(validateBackfillWindow("2026-10-01", "2026-11-01"), {
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-11-01T00:00:00.000Z",
        days: 31
    });
    assert.throws(() => validateBackfillWindow("2026-01-01", "2026-03-01"), /TOO_LARGE/);
    assert.match(ofacDeltaUrl("2026-11-18"), /DeltaArchive%2F2026-11-18_delta\.xml$/);
});

test("12-hour lifecycle never treats missing or date-only timestamps as live", () => {
    const now = Date.parse("2026-11-19T12:00:00Z");
    assert.equal(lifecycleForTimestamp("2026-11-19T06:00:00Z", now), "LIVE_12_HOUR");
    assert.equal(lifecycleForTimestamp("2026-11-18T23:00:00Z", now), "ARCHIVED");
    assert.equal(lifecycleForTimestamp(null, now), "HISTORICAL_DATE_ONLY");
});
