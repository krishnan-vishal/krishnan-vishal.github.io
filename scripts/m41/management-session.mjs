import crypto from 'node:crypto'

export const coreProjectRef = 'qlnvhfapctcpzqyuhhth'
const validID = value => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value)
function tokenValue(value) {
  if (typeof value !== 'string' || value.length < 20 || value.length > 4096 || /\s/.test(value)) throw new Error('Existing management credential is unavailable or malformed; value withheld.')
  return value
}
export async function verifyManagementAccess(token, fetchImpl = fetch) {
  tokenValue(token)
  const results = {}
  for (const [name, route] of [['functionsHTTP', 'functions'], ['keyInventoryHTTP', 'api-keys?reveal=true']]) {
    const response = await fetchImpl(`https://api.supabase.com/v1/projects/${coreProjectRef}/${route}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { authorization: `Bearer ${token}` }
    })
    results[name] = response.status
    await response.body?.cancel()
    if (response.status !== 200) throw new Error(`Existing repository deployment credential lacks verified Core management access (${name}: HTTP ${response.status}); no credential was changed.`)
  }
  return results
}
export function sealManagementSession(token, publicPEM, recoveryID, now = Date.now()) {
  tokenValue(token)
  if (!validID(recoveryID)) throw new Error('Invalid recovery request ID.')
  const publicKey = crypto.createPublicKey(publicPEM)
  if (publicKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyDetails.modulusLength < 3072) throw new Error('A private-workspace RSA recipient key of at least 3072 bits is required.')
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12)
  const context = Buffer.from(`GPIR-M41:${coreProjectRef}:${recoveryID}`)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(context)
  const body = Buffer.from(JSON.stringify({ token, recoveryID, coreProjectRef, issuedAt: new Date(now).toISOString() }))
  const ciphertext = Buffer.concat([cipher.update(body), cipher.final()])
  return { schema: 'gpir-m41-management-envelope/v1', recoveryID, coreProjectRef,
    wrappedKey: crypto.publicEncrypt({ key: publicKey, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, key).toString('base64'),
    iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }
}
export function openManagementSession(envelope, privatePEM, expectedID, now = Date.now()) {
  if (!validID(expectedID) || envelope.schema !== 'gpir-m41-management-envelope/v1' || envelope.recoveryID !== expectedID || envelope.coreProjectRef !== coreProjectRef) throw new Error('Encrypted handoff does not match this Core recovery request.')
  const key = crypto.privateDecrypt({ key: privatePEM, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(envelope.wrappedKey, 'base64'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
  decipher.setAAD(Buffer.from(`GPIR-M41:${coreProjectRef}:${expectedID}`))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  const session = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'))
  if (session.recoveryID !== expectedID || session.coreProjectRef !== coreProjectRef || !Number.isFinite(Date.parse(session.issuedAt)) || Math.abs(now - Date.parse(session.issuedAt)) > 60 * 60 * 1000) throw new Error('Encrypted management handoff is stale or belongs to another request.')
  tokenValue(session.token)
  return session
}
