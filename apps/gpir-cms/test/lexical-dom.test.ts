import assert from 'node:assert/strict'
import test from 'node:test'
import { createHeadlessEditor } from '@lexical/headless'
import { withDOM } from '@lexical/headless/dom'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $getRoot } from 'lexical'

test('patched Happy DOM preserves Lexical HTML import, JSON state and HTML export', () => {
  const previousDocument = globalThis.document
  const result = withDOM(window => {
    const editor = createHeadlessEditor({ namespace: 'gpir-security-compatibility', onError: error => { throw error } })
    const document = new window.DOMParser().parseFromString('<p>GPIR <strong>validated</strong> research</p>', 'text/html')
    editor.update(() => {
      $getRoot().append(...$generateNodesFromDOM(editor, document))
    }, { discrete: true })
    const state = editor.getEditorState().toJSON()
    const restored = createHeadlessEditor({ namespace: 'gpir-restored', onError: error => { throw error } })
    restored.setEditorState(restored.parseEditorState(state))
    return restored.read(() => {
      const html = $generateHtmlFromNodes(restored)
      return {
        text: $getRoot().getTextContent(),
        bold: new window.DOMParser().parseFromString(html, 'text/html').querySelector('strong')?.textContent,
      }
    })
  })
  assert.equal(result.text, 'GPIR validated research')
  assert.equal(result.bold, 'validated')
  assert.equal(globalThis.document, previousDocument)
})
