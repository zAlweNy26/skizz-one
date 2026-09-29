import { describe, expect, it } from 'vitest'
import { sanitizeSvg } from '#shared/utils/svg'

describe('sanitizeSvg', () => {
  it.each([
    '<path d="M 10,20 L 150,800"/>',
    '<path fill="transparent" stroke="#000000" d="M 84.00,84.00 C 184.00,144.00" data-drauu_index="0"></path>',
    '<path fill="transparent" stroke="#000000" stroke-width="16" stroke-linecap="round" d="M0 0L1 1"></path>',
    '<rect fill="transparent" stroke="#e11d48" stroke-width="4" x="1.00" y="2.00" width="30.00" height="40.00"></rect>',
    '<ellipse fill="#fff" stroke="#000" cx="5" cy="5" rx="3" ry="2" opacity="0.4"></ellipse>',
    '<g><defs><marker id="1a2b-3c" viewBox="0 -5 10 10" refX="5" refY="0" markerWidth="4" markerHeight="4" '
    + 'orient="auto"><path fill="#000" d="M0,-5L10,0L0,5"></path></marker></defs>'
    + '<line fill="transparent" x1="0" y1="0" x2="9" y2="9" marker-end="url(#1a2b-3c)"></line></g>',
    '<defs data-drauu-eraser=""><mask id="drauu-eraser-mask" maskUnits="userSpaceOnUse" x="-100%" y="-100%" '
    + 'width="300%" height="300%"><rect fill="#fff" x="-100%" y="-100%" width="300%" height="300%"></rect></mask></defs>'
    + '<path mask="url(#drauu-eraser-mask)" d="M0 0"></path>',
    '<path data-drauu-fill="" d="M0 0Z" fill="#000" stroke="none" fill-opacity="0.5"></path>',
    '<g data-sync-id="abc" stroke-dasharray="4 4" stroke-linejoin="round"><path d="M1 1"></path></g>',
    '',
  ])('keeps what drauu draws: %s', (markup) => {
    expect(sanitizeSvg(markup)).toBe(markup)
  })

  it('keeps a whole canvas of sibling nodes, dropping the whitespace between them', () => {
    expect(sanitizeSvg(' <path d="M0 0"></path>\n<path d="M1 1"/> ')).toBe('<path d="M0 0"></path><path d="M1 1"/>')
  })

  it.each([
    ['an event handler', '<g><animate attributeName="x" dur="1s" onbegin="alert(1)"/></g>'],
    ['a handler on an allowed element', '<path d="M0 0" onload="alert(1)"></path>'],
    ['a script', '<script>alert(1)</script>'],
    ['a foreign object', '<foreignObject><img src="x" onerror="alert(1)"></foreignObject>'],
    ['an image', '<image href="x" onerror="alert(1)"/>'],
    ['a link', '<a href="javascript:alert(1)"><path d="M0 0"/></a>'],
    ['a style attribute', '<path style="fill:red" d="M0 0"/>'],
    ['an external reference', '<path fill="url(https://evil.test/x.svg#a)" d="M0 0"/>'],
    ['a reference where none belongs', '<path d="url(#a)"/>'],
    ['an odd id', '<marker id="a b"></marker>'],
    ['text', '<g>hello</g>'],
    ['an entity', '<path d="M0 0&#x3c;"/>'],
    ['an unquoted attribute', '<path d=M0/>'],
    ['a single-quoted attribute', '<path d=\'M0\'/>'],
    ['an unclosed element', '<g><path d="M0 0"/>'],
    ['a stray closing tag', '</g>'],
    ['mismatched tags', '<g></path>'],
    ['a comment', '<!-- x --><path d="M0 0"/>'],
    ['an uppercase element', '<PATH d="M0 0"/>'],
    ['not a string', { svg: '<path/>' }],
  ])('rejects %s', (_, markup) => {
    expect(sanitizeSvg(markup)).toBeNull()
  })
})
