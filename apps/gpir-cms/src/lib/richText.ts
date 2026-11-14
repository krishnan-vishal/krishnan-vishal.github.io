type Json = Record<string, any>

export type ContentfulLinkKind = 'Asset' | 'Entry'
export type ResolvedContentfulLink = { relationTo: string; value: string | number }

function contentfulText(node: Json): Json {
  const format = Array.isArray(node.marks) ? node.marks.map((mark: Json) => mark.type).filter(Boolean) : []
  return { type: 'text', version: 1, text: String(node.value || ''), detail: 0, mode: 'normal', style: '', format: format.includes('bold') ? 1 : format.includes('italic') ? 2 : 0 }
}

function contentfulNode(node: Json,
  resolveLink?: (kind: ContentfulLinkKind, id: string) => ResolvedContentfulLink | null,
  onUnresolved?: (kind: ContentfulLinkKind, id: string) => void): Json | null {
  if (!node || typeof node !== 'object') return null
  if (node.nodeType === 'text') return contentfulText(node)
  const children = Array.isArray(node.content)
    ? node.content.map((item: Json) => contentfulNode(item, resolveLink, onUnresolved)).filter(Boolean) : []
  if (node.nodeType === 'paragraph') return { type: 'paragraph', version: 1, children, direction: null, format: '', indent: 0, textFormat: 0, textStyle: '' }
  if (/^heading-[1-6]$/.test(node.nodeType)) return { type: 'heading', version: 1, tag: `h${node.nodeType.slice(-1)}`, children, direction: null, format: '', indent: 0 }
  if (node.nodeType === 'blockquote') return { type: 'quote', version: 1, children, direction: null, format: '', indent: 0 }
  if (node.nodeType === 'hyperlink') return { type: 'link', version: 1, url: String(node.data?.uri || ''), fields: { newTab: true, url: String(node.data?.uri || ''), linkType: 'custom' }, children, direction: null, format: '' }
  if (node.nodeType === 'embedded-asset-block' || node.nodeType === 'embedded-entry-block') {
    const kind: ContentfulLinkKind = node.nodeType === 'embedded-asset-block' ? 'Asset' : 'Entry'
    const id = String(node.data?.target?.sys?.id || '')
    const resolved = id && resolveLink ? resolveLink(kind, id) : null
    if (!resolved) {
      if (id) onUnresolved?.(kind, id)
      return null
    }
    return kind === 'Asset'
      ? { type: 'upload', version: 3, relationTo: resolved.relationTo, value: resolved.value, fields: {} }
      : { type: 'relationship', version: 1, relationTo: resolved.relationTo, value: resolved.value }
  }
  if (node.nodeType === 'unordered-list' || node.nodeType === 'ordered-list') return { type: 'list', version: 1, listType: node.nodeType === 'ordered-list' ? 'number' : 'bullet', tag: node.nodeType === 'ordered-list' ? 'ol' : 'ul', start: 1, children, direction: null, format: '', indent: 0 }
  if (node.nodeType === 'list-item') return { type: 'listitem', version: 1, value: 1, children, direction: null, format: '', indent: 0 }
  return children.length ? { type: 'paragraph', version: 1, children, direction: null, format: '', indent: 0, textFormat: 0, textStyle: '' } : null
}

export function contentfulToLexical(document: unknown,
  resolveLink?: (kind: ContentfulLinkKind, id: string) => ResolvedContentfulLink | null,
  onUnresolved?: (kind: ContentfulLinkKind, id: string) => void): Json {
  const source = document && typeof document === 'object' ? document as Json : {}
  const children = Array.isArray(source.content)
    ? source.content.map((item: Json) => contentfulNode(item, resolveLink, onUnresolved)).filter(Boolean) : []
  return { root: { type: 'root', version: 1, children, direction: null, format: '', indent: 0 } }
}

export function collectContentfulLinks(document: unknown): { kind: ContentfulLinkKind; id: string }[] {
  const links: { kind: ContentfulLinkKind; id: string }[] = []
  function visit(node: any) {
    if (!node || typeof node !== 'object') return
    if (node.nodeType === 'embedded-asset-block' || node.nodeType === 'embedded-entry-block') {
      const id = node.data?.target?.sys?.id
      if (typeof id === 'string' && id) links.push({ kind: node.nodeType === 'embedded-asset-block' ? 'Asset' : 'Entry', id })
    }
    if (Array.isArray(node.content)) node.content.forEach(visit)
  }
  visit(document)
  return links
}

function lexicalText(node: Json): Json {
  const marks = []
  if ((Number(node.format) & 1) === 1) marks.push({ type: 'bold' })
  if ((Number(node.format) & 2) === 2) marks.push({ type: 'italic' })
  return { nodeType: 'text', value: String(node.text || ''), marks, data: {} }
}

function lexicalNode(node: Json): Json | null {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'text') return lexicalText(node)
  const content = Array.isArray(node.children) ? node.children.map(lexicalNode).filter(Boolean) : []
  if (node.type === 'paragraph') return { nodeType: 'paragraph', data: {}, content }
  if (node.type === 'heading') return { nodeType: `heading-${String(node.tag || 'h2').slice(1)}`, data: {}, content }
  if (node.type === 'quote') return { nodeType: 'blockquote', data: {}, content }
  if (node.type === 'link' || node.type === 'autolink') return { nodeType: 'hyperlink', data: { uri: node.fields?.url || node.url || '' }, content }
  if (node.type === 'list') return { nodeType: node.listType === 'number' ? 'ordered-list' : 'unordered-list', data: {}, content }
  if (node.type === 'listitem') return { nodeType: 'list-item', data: {}, content }
  return content.length ? { nodeType: 'paragraph', data: {}, content } : null
}

export function lexicalToContentful(value: unknown): Json {
  const root = value && typeof value === 'object' ? (value as Json).root : null
  const content = Array.isArray(root?.children) ? root.children.map(lexicalNode).filter(Boolean) : []
  return { nodeType: 'document', data: {}, content }
}
