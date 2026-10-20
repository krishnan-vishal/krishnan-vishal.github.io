'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  buildEditorialBody,
  formatContentfulValidationError,
  richTextInventory,
  rowsFromTable
} = require('../../scripts/m36/synchronize-cl03c-contentful');

const root = path.resolve(__dirname, '../..');
const mappings = JSON.parse(fs.readFileSync(path.join(root,
  'artifacts/m36/cl03-scaleout/content-module-mappings.json'), 'utf8'));
const reconciliation = JSON.parse(fs.readFileSync(path.join(root,
  'artifacts/m36/cl03a-five/content-reconciliation-report.json'), 'utf8'));
const liveSchemaNodeTypes = [
  'asset-hyperlink', 'blockquote', 'embedded-asset-block', 'embedded-entry-block',
  'embedded-entry-inline', 'entry-hyperlink', 'heading-1', 'heading-2', 'heading-3',
  'heading-4', 'heading-5', 'heading-6', 'hr', 'hyperlink', 'ordered-list', 'table',
  'unordered-list'
];
const liveSchemaMarks = [
  'bold', 'code', 'italic', 'strikethrough', 'subscript', 'superscript', 'underline'
];

function expectedTablesFromModule(sourceHtml, module) {
  const id = module.source.selector.replace(/^#/, '');
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const section = sourceHtml.match(new RegExp(
    `<section\\s+id=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/section>`, 'i'));
  assert.ok(section, `Expected source section ${module.source.selector}`);
  return [...section[1].matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)]
    .map((match, index) => rowsFromTable(match[0], `expected:${index + 1}`));
}

function sourceTableValuesFromModule(sourceHtml, module) {
  const id = module.source.selector.replace(/^#/, '');
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const section = sourceHtml.match(new RegExp(
    `<section\\s+id=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/section>`, 'i'));
  assert.ok(section, `Expected source section ${module.source.selector}`);
  return [...section[1].matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(table =>
    [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
      [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(cell =>
        cell[1].replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '')
          .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
            const named = {
              amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
              ndash: '–', mdash: '—', rarr: '→', larr: '←', rsquo: '’',
              lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', plusmn: '±'
            };
            if (entity[0] === '#') {
              const code = entity[1].toLowerCase() === 'x'
                ? Number.parseInt(entity.slice(2), 16)
                : Number.parseInt(entity.slice(1), 10);
              return Number.isFinite(code) && code <= 0x10ffff
                ? String.fromCodePoint(code) : whole;
            }
            return named[entity.toLowerCase()] ?? whole;
          })
          .replace(/[ \t\r\f\v]+/g, ' ').replace(/ *\n */g, '\n').trim())));
}

function cellText(cell) {
  return cell.content.flatMap(paragraph => paragraph.content.map(text => text.value)).join('');
}

test('all five generated payloads use schema-compatible native Rich Text table nodes', () => {
  assert.equal(reconciliation.publications.length, 5);

  for (const publication of reconciliation.publications) {
    const mapping = mappings.publications[publication.publicationId];
    const sourceHtml = fs.readFileSync(path.join(root, mapping.sourcePath), 'utf8');
    const body = buildEditorialBody(mapping, sourceHtml, publication.publicationId);
    const inventory = richTextInventory(body, liveSchemaNodeTypes, liveSchemaMarks);
    const tables = body.content.filter(node => node.nodeType === 'table');
    const expectedTables = mapping.modules.flatMap(module =>
      expectedTablesFromModule(sourceHtml, module));
    const expectedSourceValues = mapping.modules.flatMap(module =>
      sourceTableValuesFromModule(sourceHtml, module));
    const expectedSourceReferences = mapping.modules.flatMap(module => {
      const tableCount = expectedTablesFromModule(sourceHtml, module).length;
      return Array.from({ length: tableCount }, (_, index) =>
        `${publication.publicationId}:${module.source.selector}:table:${index + 1}`);
    });

    assert.equal(body.nodeType, 'document', publication.publicationId);
    assert.equal(inventory.findings.length, 0,
      `${publication.publicationId}: ${JSON.stringify(inventory.findings)}`);
    assert.equal(tables.length, publication.contentAssessment.sourceTableCount);
    assert.equal(expectedTables.length, tables.length);
    assert.equal(inventory.nodeCounts.has('gpir-table'), false);

    tables.forEach((table, tableIndex) => {
      const expected = expectedTables[tableIndex];
      assert.equal(table.data.sourceBlock, expectedSourceReferences[tableIndex]);
      assert.equal(table.content.length, expected.content.length);
      assert.deepEqual(table.content.map(row =>
        row.content.map(cell => cell.nodeType)), expected.content.map(row =>
        row.content.map(cell => cell.nodeType)));
      assert.deepEqual(table.content.map(row =>
        row.content.map(cellText)), expected.content.map(row =>
        row.content.map(cellText)));
      assert.deepEqual(table.content.map(row =>
        row.content.map(cellText)), expectedSourceValues[tableIndex]);
      for (const row of table.content) {
        assert.equal(row.nodeType, 'table-row');
        assert.ok(row.content.length > 0);
        for (const cell of row.content) {
          assert.ok(['table-cell', 'table-header-cell'].includes(cell.nodeType));
          assert.ok(cell.content.every(node => node.nodeType === 'paragraph'));
        }
      }
    });
  }
});

test('header rows remain table-header-cell rows while body rows remain table-cell rows', () => {
  const table = rowsFromTable(
    '<table><tr><th>Column A</th><th>Column B</th></tr><tr><td>Value A</td><td>Value B</td></tr></table>',
    'publication:#section:table:1');

  assert.equal(table.nodeType, 'table');
  assert.equal(table.data.sourceBlock, 'publication:#section:table:1');
  assert.deepEqual(table.content[0].content.map(cell => cell.nodeType),
    ['table-header-cell', 'table-header-cell']);
  assert.deepEqual(table.content[1].content.map(cell => cell.nodeType),
    ['table-cell', 'table-cell']);
  assert.deepEqual(table.content.map(row => row.content.map(cellText)), [
    ['Column A', 'Column B'],
    ['Value A', 'Value B']
  ]);
});

test('Contentful validation errors expose sanitized path, validator and safe message only', () => {
  const message = formatContentfulValidationError({
    details: {
      errors: [{
        name: 'enabledNodeTypes',
        path: ['fields', 'editorialBody', 'en-US', 'content', 3, 'nodeType'],
        details: 'private unpublished paragraph text',
        value: 'private unpublished paragraph text'
      }]
    }
  });

  assert.match(message, /fields\.editorialBody\.en-US\.content\[3\]\.nodeType/);
  assert.match(message, /enabledNodeTypes/);
  assert.match(message, /Rich Text node type is not enabled/);
  assert.doesNotMatch(message, /private unpublished paragraph text/);
  assert.doesNotMatch(message, /"value"|details/);
});
