const required = [
  'PAYLOAD_DATABASE_URI', 'PAYLOAD_SECRET', 'PAYLOAD_PUBLIC_SERVER_URL',
  'SUPABASE_URL', 'GPIR_SUPABASE_SECRET_KEY', 'GPIR_RELEASE_SIGNING_SECRET',
  'S3_BUCKET', 'S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY',
]

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 24 || (major === 24 && minor < 22)) {
  throw new Error(`Node 24.22+ is required; found ${process.versions.node}.`)
}
const missing = required.filter((name) => !process.env[name])
const exposed = Object.keys(process.env).filter((name) => /^NEXT_PUBLIC_.*(SECRET|TOKEN|KEY|DATABASE)/.test(name))
if (exposed.length) throw new Error(`Server credentials must not use NEXT_PUBLIC_*: ${exposed.join(', ')}`)
process.stdout.write(`${JSON.stringify({ node: process.versions.node, configured: required.length - missing.length, missing })}\n`)
if (missing.length) process.exitCode = 2
