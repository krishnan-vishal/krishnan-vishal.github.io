import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monthlyWindows, argumentsFrom } from '../scripts/intelligence/run-research-source-backfill.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const registration = read('../supabase/release/m39-research-source-registration.sql');
const schedules = read('../supabase/release/m39-research-source-schedules.sql');
const rollback = read('../supabase/rollback/m39-research-source-activation.rollback.sql');

test('five-year backfill is exactly 60 contiguous bounded windows', () => {
    const windows = monthlyWindows();
    assert.equal(windows.length, 60);
    assert.equal(windows[0].from, '2021-11-19T00:00:00.000Z');
    assert.equal(windows.at(-1).to, '2026-11-19T00:00:00.000Z');
    for (let i = 1; i < windows.length; i += 1) assert.equal(windows[i].from, windows[i - 1].to);
    for (const window of windows)
        assert.ok(Date.parse(window.to) - Date.parse(window.from) <= 31 * 24 * 60 * 60 * 1000);
});

test('backfill defaults to plan-only and only permits approved source IDs', () => {
    assert.equal(argumentsFrom([]).mode, 'plan');
    assert.equal(argumentsFrom(['--dry-run']).mode, 'dry-run');
    assert.equal(argumentsFrom(['--apply']).mode, 'apply');
    assert.throws(() => argumentsFrom(['--sources=FXC-GLOBAL-010']), /UNAPPROVED/);
});

test('registration activates verified sources while FXC and Finextra remain fail-closed', () => {
    assert.match(registration, /'FINTECHNEWS-SG-008'[\s\S]*'wordpress-payments-v1', 'GREEN'/);
    assert.match(registration, /'ATLAS-APAC-009'[\s\S]*'wordpress-payments-v1', 'GREEN'/);
    assert.match(registration, /'FXC-GLOBAL-010', 'FXC Intelligence', 'XGL', 'Global'[\s\S]*'standard-html', 'DISABLED'/);
    assert.match(registration, /'FINEXTRA-PAY-006' and source_status = 'DISABLED'/);
    assert.match(registration, /on conflict \(source_id\) do nothing/);
    assert.doesNotMatch(registration, /confidence|threshold|alter table|drop table|delete from/i);
});

test('schedules reuse Vault and rollback preserves acquired records', () => {
    assert.match(schedules, /vault\.decrypted_secrets/);
    assert.match(schedules, /gpir_edge_function_secret/);
    assert.match(schedules, /m39-fintechnews-sg-ingestion/);
    assert.match(schedules, /m39-atlas-payments-ingestion/);
    assert.doesNotMatch(schedules, /eyJ|sb_secret|service_role/);
    assert.match(rollback, /source_status = 'DISABLED'/);
    assert.doesNotMatch(rollback, /delete from|drop table/i);
});
