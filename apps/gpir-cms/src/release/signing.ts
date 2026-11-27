import { createHash, createHmac } from 'node:crypto'

function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stable(value))
}

export function signArtifact(value: unknown, secret: string) {
  const body = stableJson(value)
  return {
    sha256: createHash('sha256').update(body).digest('hex'),
    signature: createHmac('sha256', secret).update(body).digest('hex'),
  }
}

