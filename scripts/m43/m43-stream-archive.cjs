'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const { archive } = require('./m43-drive-archive.cjs');
const SIZE = 16 * 1024 * 1024;
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
async function snapshot(path, send = archive, env = process.env) {
  const file = await fs.promises.open(path, 'r');
  const chunks = [];
  const hash = crypto.createHash('sha256');
  let offset = 0;
  try {
    const before = await file.stat();
    if (!before.isFile()) throw Error('Expected immutable snapshot file');
    while (offset < before.size) {
      const b = Buffer.alloc(Math.min(SIZE, before.size - offset));
      let filled = 0;
      while (filled < b.length) {
        const {bytesRead} = await file.read(b, filled, b.length-filled, offset+filled);
        if (!bytesRead) throw Error('Snapshot truncated');
        filled += bytesRead;
      }
      hash.update(b);
      const receipt = await send(b, env);
      if (receipt.status !== 'READBACK_VERIFIED') throw Error('Chunk not verified');
      chunks.push({index:chunks.length, offset, bytes:b.length, sha256:digest(b)});
      offset += b.length;
    }
    const after = await file.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw Error('Snapshot changed during archival');
    const manifest = {format:'GPIR-M43-v1', bytes:offset, sha256:hash.digest('hex'), chunks};
    const encoded = Buffer.from(JSON.stringify(manifest));
    const receipt = await send(encoded, env);
    if (receipt.status !== 'READBACK_VERIFIED') throw Error('Manifest not verified');
    return {status:'CHUNKS_AND_MANIFEST_READBACK_VERIFIED', bytes:offset, chunks:chunks.length, manifestSha256:digest(encoded), verifiedAt:new Date().toISOString()};
  } finally { await file.close(); }
}
if (require.main === module) {
  if (!process.argv[2]) { console.error('Snapshot path required'); process.exitCode=1; }
  else snapshot(process.argv[2]).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={snapshot,SIZE};
