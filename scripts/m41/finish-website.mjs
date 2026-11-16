// Post-merge continuation only. Never imports, merges, edits secrets, or deploys CMS/functions.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { acquireReleaseLock } from './release-access.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const directory = path.join(root, '.migration-data/m41-cutover')
const reportFile = path.join(directory, 'consolidated-report.json')
const repository = 'krishnan-vishal/krishnan-vishal.github.io'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
function save(file, data) {
    const temporary = `${file}.${process.pid}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    fs.renameSync(temporary, file)
}
export function resumeIdentity(report, lock, pr) {
    if (report.repository !== repository || report.pr !== 580 || !/^[a-f0-9]{40}$/.test(report.mergeCommit || '') ||
        !pr.merged || pr.merge_commit_sha !== report.mergeCommit) throw Error('Saved PR #580 merge identity does not match GitHub.')
    if (report.coverage?.status !== 'MIGRATED_NOT_CUT_OVER' || lock.source !== 'payload' ||
        !/^[a-f0-9]{64}$/.test(lock.snapshot || '') || lock.snapshot !== report.coverage.snapshot) throw Error('Completed import and source lock must name the same immutable snapshot.')
    if (report.contentfulWrites !== 0 || report.contentfulDeleted !== 0 || report.contentfulExistingEntriesModified !== 0) throw Error('Zero-Contentful-write evidence is required.')
    return lock.snapshot
}
async function main() {
    const report = read(reportFile)
    if (process.argv.includes('--background')) {
        const launchFile = path.join(directory, 'website-recovery-launch.json')
        if (fs.existsSync(launchFile)) {
            const prior = read(launchFile)
            try { process.kill(prior.pid, 0); throw Error('Website continuation already running; no second process started.') }
            catch (error) { if (error.code !== 'ESRCH') throw error }
        }
        const log = path.join(directory, `website-recovery-${Date.now()}.log`)
        const fd = fs.openSync(log, 'wx', 0o600)
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--execute'], {
            cwd: root, detached: true, stdio: ['ignore', fd, fd], env: process.env
        })
        child.on('error', error => { console.error('Website continuation could not start: ' + error.code); process.exitCode = 1 })
        child.unref(); fs.closeSync(fd)
        save(launchFile, { pid: child.pid, log, report: reportFile, startedAt: new Date().toISOString() })
        console.log(JSON.stringify({ status: 'WEBSITE_CONTINUATION_STARTED_NOT_COMPLETE', pid: child.pid, log, report: reportFile }))
        return
    }
    if (!process.argv.includes('--execute')) throw Error('Use --background or --execute for the already-authorized website continuation.')
    const release = acquireReleaseLock(directory)
    let stage = 'verify saved post-merge identity'
    let secrets = []
    const clean = value => {
        let text = String(value)
        for (const secret of secrets) text = text.replaceAll(secret, '[redacted]')
        return text.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[database URI redacted]')
    }
    function run(command, args, inherit = false) {
        const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 60 * 60 * 1000,
            maxBuffer: 8 * 1024 * 1024, ...(inherit ? { stdio: 'inherit' } : {}),
            env: { ...process.env, CI: 'true', NO_COLOR: '1', WRANGLER_LOG_SANITIZE: 'true', WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' } })
        if (result.status !== 0) throw Error(clean(result.stderr || result.stdout || result.error?.message || `Stage exited ${result.status}, signal=${result.signal || 'none'}`).slice(-4000))
        return result.stdout || ''
    }
    function step(name) {
        stage = name
        save(reportFile, { ...report, status: 'IN_PROGRESS', currentStage: name })
        console.log('M41: ' + name)
    }
    try {
        fs.copyFileSync(reportFile, path.join(directory, `pre-website-recovery-${Date.now()}-${process.pid}.json`), fs.constants.COPYFILE_EXCL)
        const pr = JSON.parse(run('gh', ['api', `repos/${repository}/pulls/580`]))
        const snapshot = resumeIdentity(report, read(path.join(root, 'gpir-content-source.json')), pr)
        process.loadEnvFile('/workspaces/m41-payload/apps/gpir-cms/.env')
        secrets = Object.entries(process.env).filter(([key, value]) => /SECRET|TOKEN|PASSWORD|KEY|DATABASE_URI/.test(key) && value.length > 5)
            .map(([, value]) => value).sort((a, b) => b.length - a.length)
        process.env.PAYLOAD_PUBLIC_SERVER_URL = 'https://gpir-payload-cms.krishnanvishal12.workers.dev'
        process.env.GPIR_CONTENT_SOURCE = 'payload'
        process.env.GPIR_PAYLOAD_SITE_SNAPSHOT = snapshot
        // Reuse the same release API/signing credentials. No Supabase management access is needed here.
        report.websiteRecovery = { snapshot, startedAt: new Date().toISOString(), source: run('git', ['rev-parse', 'HEAD']).trim() }
        const markerURL = `https://www.fintechoisis.com/assets/data/cms-source.json?m41=${snapshot}`
        const response = await fetch(markerURL, { redirect: 'follow', signal: AbortSignal.timeout(30000) })
        if (!['www.fintechoisis.com', 'fintechoisis.com'].includes(new URL(response.url).hostname)) throw Error('Unexpected live marker redirect.')
        let alreadyLive = false
        if (response.ok) {
            const marker = await response.json()
            alreadyLive = marker.source === 'payload' && marker.snapshot === snapshot
        } else {
            await response.body?.cancel()
            if (response.status !== 404) throw Error(`Live marker unavailable: HTTP ${response.status}; deployment not repeated blindly.`)
        }
        if (!alreadyLive) {
            step('reconstruct website from the saved signed Payload snapshot; retain verified downloads')
            run(process.execPath, ['scripts/build-cloudflare-preview.js'], true)
            const built = read(path.join(root, '.cloudflare-preview-dist/assets/data/cms-source.json'))
            if (built.source !== 'payload' || built.snapshot !== snapshot || built.managedFiles !== report.coverage.managedFiles) throw Error('Build marker differs from completed migration.')
            step('deploy only the existing website Worker')
            const deployed = run(process.execPath, ['apps/gpir-cms/node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', 'wrangler.jsonc'])
            report.websiteDeploymentVersion = deployed.match(/Current Version ID:\s*([a-f0-9-]+)/i)?.[1] || 'NOT_REPORTED'
            save(reportFile, { ...report, status: 'IN_PROGRESS', currentStage: stage })
        } else console.log('M41: selected snapshot already live; skip redeployment and verify delivery')
        step('verify live managed bytes and preserved engine bytes')
        const liveFile = path.join(directory, 'live-verification.json')
        run(process.execPath, ['scripts/m41/verify-live.cjs', liveFile], true)
        report.live = read(liveFile)
        const protectedURL = 'https://qlnvhfapctcpzqyuhhth.supabase.co/functions/v1/gpir-protected-publication'
        const input = { publicationId: process.env.GPIR_ACCEPTANCE_PUBLICATION_ID || 'VK-GPIR-P-000000000001-8',
            supabaseRecordId: process.env.GPIR_ACCEPTANCE_RECORD_ID || '8ea94d2b-3254-4ddc-a50a-f10444b252f4' }
        const request = async headers => fetch(protectedURL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
            headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(input) })
        step('verify protected delivery through existing reader authentication and entitlements')
        const anonymous = await request({})
        report.anonymousProtectedHTTP = anonymous.status
        await anonymous.body?.cancel()
        if (![401, 403].includes(anonymous.status)) throw Error('Anonymous protected delivery did not fail closed.')
        report.authenticatedReaderAcceptance = 'NOT_PERFORMED_NO_EXISTING_PRIVATE_READER_SESSION'
        if (process.env.GPIR_ACCEPTANCE_READER_TOKEN) {
            const response = await request({ authorization: `Bearer ${process.env.GPIR_ACCEPTANCE_READER_TOKEN}` })
            const body = await response.json()
            report.authenticatedReaderHTTP = response.status
            report.protectedEditorialSource = response.headers.get('x-gpir-editorial-source')
            report.authenticatedReaderAcceptance = response.ok && body.status === 'ALLOW' && body.publication?.identity === input.publicationId &&
                body.publication?.supabaseRecordId === input.supabaseRecordId && report.protectedEditorialSource === 'payload'
                ? 'LIVE_PAYLOAD_PROTECTED_READ_VERIFIED' : 'NOT_ACCEPTED_EXISTING_SESSION_OR_ENTITLEMENT_OR_SOURCE'
        }
        report.status = report.authenticatedReaderAcceptance === 'LIVE_PAYLOAD_PROTECTED_READ_VERIFIED'
            ? 'LIVE_PUBLIC_AND_PROTECTED_PAYLOAD_DELIVERY_VERIFIED' : 'LIVE_STATIC_CUTOVER_VERIFIED_PROTECTED_ACCEPTANCE_PENDING'
        report.coverage.publicSourceSwitched = true
        report.websiteRecovery.finishedAt = new Date().toISOString()
        delete report.failedStage; delete report.message; delete report.currentStage
        save(reportFile, report)
        console.log(JSON.stringify({ status: report.status, websiteDeploymentVersion: report.websiteDeploymentVersion,
            live: report.live, authenticatedReaderAcceptance: report.authenticatedReaderAcceptance, report: reportFile }))
    } catch (error) {
        save(reportFile, { ...report, status: 'BLOCKED_NOT_COMPLETE', failedStage: stage, message: clean(error.message) })
        throw Error(clean(error.message))
    } finally { release() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
