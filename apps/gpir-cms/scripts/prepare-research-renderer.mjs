import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const target = fileURLToPath(new URL('../src/release/generated-renderer/', import.meta.url))
const files = ['m41/research-edition.cjs','m35/contentful-publication-adapter.js','m35/contentful-publication-renderer.js','m35/research-publication-model.js','m35/contentful-auth-boundary.js','m39/build-fx-editorial-bridge.js']
mkdirSync(target, { recursive: true })
writeFileSync(join(target,'package.json'), JSON.stringify({type:'commonjs'}))
for (const file of files) {
  let source = readFileSync(join(root,'scripts',file),'utf8')
  if (file.startsWith('m39/')) {
    source = source.replace(/^const (fs|path) = require\('node:(fs|path)'\);\n/gm,'')
    const start = source.indexOf('if (require.main === module)')
    const end = source.indexOf('module.exports =',start)
    if (start < 0 || end < 0) throw Error('FX renderer CLI boundary changed')
    source = source.slice(0,start) + source.slice(end)
  }
  const output = join(target,file)
  mkdirSync(dirname(output),{recursive:true})
  writeFileSync(output,source)
}
