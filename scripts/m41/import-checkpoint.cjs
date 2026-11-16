'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const phases = ['blobs', 'archives', 'entries', 'editorial', 'manifest'];
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ?
    Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function identity(plan) {
    if (plan?.schema !== 'gpir-import-plan/v1' || !/^[a-f0-9]{40}$/.test(plan.sourceCommit || '') ||
        !/^[a-f0-9]{64}$/.test(plan.snapshot || '') || !/^[a-f0-9]{64}$/.test(plan.deliveryDigest || '') ||
        phases.some(phase => !Number.isSafeInteger(plan.counts?.[phase]) || plan.counts[phase] < 0) ||
        plan.counts.manifest !== 1) throw new Error('Invalid import plan; original evidence preserved.');
    return digest(plan);
}
function normalize(plan, cursor) {
    while (cursor.phase !== 'complete' && cursor.index === plan.counts[cursor.phase]) {
        const next = phases.indexOf(cursor.phase) + 1;
        cursor = { ...cursor, phase: phases[next] || 'complete', index: 0 };
    }
    return cursor;
}
function validate(plan, cursor) {
    const hash = identity(plan);
    if (cursor?.schema !== 'gpir-import-cursor/v1' || cursor.planDigest !== hash ||
        ![...phases, 'complete'].includes(cursor.phase) || !Number.isSafeInteger(cursor.index) || cursor.index < 0 ||
        !Number.isSafeInteger(cursor.created) || cursor.created < 0 || !Number.isSafeInteger(cursor.reconciled) || cursor.reconciled < 0 ||
        cursor.index > (plan.counts[cursor.phase] || 0)) throw new Error('Import cursor does not match the pinned plan.');
    const phaseIndex = cursor.phase === 'complete' ? phases.length : phases.indexOf(cursor.phase);
    const completed = phases.slice(0, phaseIndex).reduce((sum, phase) => sum + plan.counts[phase], 0) + cursor.index;
    if (cursor.created + cursor.reconciled !== completed) throw new Error('Import cursor counts do not prove its saved position.');
    return normalize(plan, cursor);
}
function initialize(plan, saved = null, legacy = null) {
    const planDigest = identity(plan);
    if (saved) return validate(plan, saved);
    let index = 0, created = 0, reconciled = 0;
    if (legacy) {
        if (!['RECONCILING_CONTENT', 'RECONCILING_BLOBS'].includes(legacy.phase) || legacy.sourceCommit !== plan.sourceCommit ||
            legacy.snapshot !== plan.snapshot || legacy.totalBlobs !== plan.counts.blobs ||
            !Number.isSafeInteger(legacy.created) || legacy.created < 0 || !Number.isSafeInteger(legacy.reconciled) || legacy.reconciled < 0 ||
            legacy.created + legacy.reconciled > plan.counts.blobs) throw new Error('Legacy import progress cannot establish this blob checkpoint.');
        created = legacy.created; reconciled = legacy.reconciled; index = created + reconciled;
    }
    return validate(plan, { schema: 'gpir-import-cursor/v1', planDigest, phase: 'blobs', index, created, reconciled, lastKey: null });
}
function atomic(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    if (fs.existsSync(file + '.tmp')) {
        const evidence = path.join(path.dirname(file), 'checkpoints');
        fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
        fs.renameSync(file + '.tmp', path.join(evidence, `${path.basename(file)}-interrupted-${crypto.randomUUID()}.tmp`));
    }
    fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
}
async function runBatch(plan, saved, perform, persist, { maxTasks = 25, maxBytes = 32 * 1024 * 1024 } = {}) {
    if (!Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 25 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid bounded import batch.');
    let cursor = validate(plan, { ...saved });
    let tasks = 0, bytes = 0;
    while (cursor.phase !== 'complete' && tasks < maxTasks && bytes < maxBytes) {
        const result = await perform(cursor.phase, cursor.index);
        if (!['created', 'reconciled'].includes(result?.disposition) || typeof result.key !== 'string' ||
            !Number.isSafeInteger(result.bytes) || result.bytes < 0) throw new Error('Import operation returned no verified disposition.');
        cursor = validate(plan, { ...cursor, index: cursor.index + 1, [result.disposition]: cursor[result.disposition] + 1, lastKey: result.key });
        // A cursor advances only after the existing immutable database operation
        // succeeds. A crash before this save can replay at most that operation.
        await persist(cursor);
        tasks++; bytes += result.bytes;
    }
    return { cursor, tasks, bytes, status: cursor.phase === 'complete' ? 'IMPORT_COMPLETE' : 'BATCH_CHECKPOINT_SAVED' };
}
function failureCode(error) {
    const known = ['23505', '42703', '42P01', '28P01', '42501', '57014', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'];
    if (known.includes(error?.code)) return error.code;
    const message = String(error?.message || '');
    if (/Existing Payload content differs|Payload editorial changes exist/.test(message)) return 'CONTENT_CONFLICT';
    if (/Duplicate (?:migration|editorial) identity/.test(message)) return 'DUPLICATE_IDENTITY';
    if (/Legacy import progress|Import cursor|Invalid import plan|Import plan changed/.test(message)) return 'CHECKPOINT_MISMATCH';
    if (/Delivery snapshot differs|delivery snapshot|published estate/.test(message)) return 'DELIVERY_SNAPSHOT_FAILURE';
    if (/Managed content digest mismatch/.test(message)) return 'SOURCE_BYTES_MISMATCH';
    if (message === 'Source entry has no identity.') return 'SOURCE_IDENTITY_MISSING';
    return 'DETAILS_WITHHELD';
}
async function closeBatch(destroy, { timeoutMs = 5000 } = {}) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('Invalid standalone shutdown deadline.');
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(destroy).then(() => ({ status: 'CLOSED' }), error => ({ status: 'CLEANUP_ERROR', errorCode: failureCode(error) })),
            new Promise(resolve => { timer = setTimeout(() => resolve({ status: 'CLEANUP_DEADLINE_REACHED' }), timeoutMs); })
        ]);
    } finally { clearTimeout(timer); }
}
module.exports = { phases, digest, identity, initialize, validate, atomic, runBatch, failureCode, closeBatch };
