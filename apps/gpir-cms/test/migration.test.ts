import assert from 'node:assert/strict'
import test from 'node:test'
import { contentfulErrorMessage, localeValue, normalizeManagementEntry } from '../src/migration/contentful'
import { collectContentfulLinks, contentfulToLexical, lexicalToContentful } from '../src/lib/richText'

test('localized management entries retain the configured locale and source id', () => {
  const entry = normalizeManagementEntry({ sys: { id: 'abc' }, fields: { title: { 'en-US': 'Title', fr: 'Titre' } } }, 'en-US')
  assert.equal(entry.entryId, 'abc')
  assert.equal(entry.fields.title, 'Title')
  assert.equal(localeValue({ fr: 'Titre' }, 'en-US'), 'Titre')
})

test('Contentful rich text converts to editable Lexical and back without dropping basic semantics', () => {
  const source = { nodeType: 'document', data: {}, content: [{ nodeType: 'heading-2', data: {}, content: [{ nodeType: 'text', value: 'Heading', marks: [{ type: 'bold' }], data: {} }] }] }
  const result = lexicalToContentful(contentfulToLexical(source))
  assert.equal(result.content[0].nodeType, 'heading-2')
  assert.equal(result.content[0].content[0].value, 'Heading')
  assert.deepEqual(result.content[0].content[0].marks, [{ type: 'bold' }])
})

test('Contentful organization-grant failures are actionable and do not expose tokens', () => {
  assert.match(contentfulErrorMessage(401, { sys: { id: 'OrganizationAccessGrantRequired' } }), /organization access grant/i)
})

test('embedded Contentful relationships are collected and resolved only in pass two', () => {
  const source = { nodeType: 'document', data: {}, content: [
    { nodeType: 'embedded-asset-block', data: { target: { sys: { id: 'asset-1' } } }, content: [] },
    { nodeType: 'embedded-entry-block', data: { target: { sys: { id: 'entry-2' } } }, content: [] },
  ] }
  assert.deepEqual(collectContentfulLinks(source), [{ kind: 'Asset', id: 'asset-1' }, { kind: 'Entry', id: 'entry-2' }])
  const unresolved: string[] = []
  const lexical = contentfulToLexical(source,
    (kind, id) => kind === 'Asset' && id === 'asset-1' ? { relationTo: 'media', value: 'media-1' } : null,
    (kind, id) => unresolved.push(`${kind}:${id}`))
  assert.equal(lexical.root.children[0].type, 'upload')
  assert.deepEqual(unresolved, ['Entry:entry-2'])
})
