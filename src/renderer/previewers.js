/*
 * Rich previews for the full-screen viewer: tables for CSV/TSV, rendered Markdown and HTML,
 * syntax-highlighted code and JSON, audio playback and SVG images.
 * Text files arrive already read (and possibly truncated) by the main process.
 */

const PREVIEW_TEXT_LIMIT = 500000
const PREVIEW_ROW_LIMIT = 5000
const AUDIO_EXT = /^(mp3|wav|flac|m4a|aac|ogg|opus)$/
const MARKUP_EXT = /^(html?|xhtml|xml|svg|vue)$/
const CODE_ALIASES = { javascript: 'js', typescript: 'ts', python: 'py', shell: 'sh', bash: 'sh', powershell: 'ps1', yml: 'yaml' }
const NUMERIC_CELL = /^[-+]?[\d.,' ]*\d[\d.,' ]*%?$/

const KEYWORDS = new Set((
  'abstract and as async await break case catch class const continue def default del do elif else enum ' +
  'export extends false final finally fn for from func function go if impl implements import in instanceof ' +
  'interface is lambda let match mut new nil none not null of or package private protected pub public raise ' +
  'return self static struct super switch this throw true try type typeof undefined use var void where while ' +
  'with yield select insert update delete into values create table join on group order by limit param ' +
  'module include'
).split(' '))

const escapeHtml = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const token = (kind, text) => `<span class="tk-${kind}">${escapeHtml(text)}</span>`

/* ---------- syntax highlighting ---------- */

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//.source
const LINE_COMMENT = {
  slash: /\/\/[^\n]*/.source,
  hash: /#[^\n]*/.source,
  dash: /--[^\n]*/.source,
  semicolon: /;[^\n]*/.source,
}
const STRING = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/.source
const NUMBER = /\b0x[\da-f]+\b|\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b/.source
const WORD = /[A-Za-z_$][\w$]*/.source

function lineCommentFor(ext) {
  if (/^(py|rb|sh|ps1|yaml|toml|r|conf|cfg|dockerfile)$/.test(ext)) return LINE_COMMENT.hash
  if (ext === 'sql' || ext === 'lua') return LINE_COMMENT.dash
  if (ext === 'ini') return LINE_COMMENT.semicolon
  return LINE_COMMENT.slash
}

// A single-pass tokenizer: good enough to color most languages without per-language grammars.
function highlightCode(text, ext = '') {
  ext = CODE_ALIASES[ext] || ext
  if (MARKUP_EXT.test(ext)) return highlightMarkup(text)
  const pattern = new RegExp(`(${BLOCK_COMMENT}|${lineCommentFor(ext)})|(${STRING})|(${NUMBER})|(${WORD})`, 'gi')
  let html = ''
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const [tok, comment, string, number, word] = match
    html += escapeHtml(text.slice(last, match.index))
    last = match.index + tok.length
    if (comment) html += token('com', tok)
    else if (string) html += token(/^\s*:/.test(text.slice(last, last + 20)) ? 'key' : 'str', tok)
    else if (number) html += token('num', tok)
    else if (KEYWORDS.has(word.toLowerCase())) html += token('kw', tok)
    else if (/^[A-Z][a-z]/.test(word)) html += token('type', tok)
    else html += escapeHtml(tok)
  }
  return html + escapeHtml(text.slice(last))
}

function highlightMarkup(text) {
  const tag = /(<!--[\s\S]*?-->)|(<\/?)([\w:.-]+)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)(\s*\/?>)/g
  const attribute = /([^\s=]+)(\s*=\s*)?("[^"]*"|'[^']*'|[^\s>]+)?/g
  let html = ''
  let last = 0
  for (const match of text.matchAll(tag)) {
    const [whole, comment, open, name, attrs, close] = match
    html += escapeHtml(text.slice(last, match.index))
    last = match.index + whole.length
    if (comment) { html += token('com', comment); continue }
    html += token('punct', open) + token('tag', name)
    html += attrs.replace(/\S+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?|\s+/g, part =>
      /^\s+$/.test(part) ? part : part.replace(attribute, (_, key, eq = '', value = '') =>
        token('attr', key) + escapeHtml(eq) + (value ? token('str', value) : '')))
    html += token('punct', close)
  }
  return html + escapeHtml(text.slice(last))
}

// Code with a line-number gutter.
function codeView(text, ext) {
  const view = el('div', 'codeview')
  const gutter = el('pre', 'gutter')
  const lines = text.split('\n').length
  gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n')
  const code = el('pre', 'code')
  code.innerHTML = highlightCode(text, ext)
  view.append(gutter, code)
  return view
}

/* ---------- CSV ---------- */

function detectDelimiter(text) {
  const sample = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : 2000)
  return [',', ';', '\t', '|'].map(d => [d, sample.split(d).length]).sort((a, b) => b[1] - a[1])[0][0]
}

// RFC 4180 parsing: quoted fields may contain delimiters, doubled quotes and line breaks.
function parseCsv(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length && rows.length <= PREVIEW_ROW_LIMIT; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') { field += '"'; i++ }
      else quoted = false
    } else if (c === '"' && field === '') quoted = true
    else if (c === delimiter) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function csvTable(text, ext, truncated) {
  const rows = parseCsv(text, ext === 'tsv' ? '\t' : detectDelimiter(text))
  const [head = [], ...body] = rows.slice(0, PREVIEW_ROW_LIMIT + 1)
  const width = Math.max(head.length, ...body.map(r => r.length))
  const numeric = Array.from({ length: width }, (_, c) => {
    const values = body.map(r => (r[c] || '').trim()).filter(Boolean)
    return values.length > 0 && values.filter(v => NUMERIC_CELL.test(v)).length / values.length > 0.8
  })

  const table = el('table', 'csv')
  const thead = el('thead')
  const headRow = el('tr')
  headRow.append(el('th', 'rownum'))
  for (let c = 0; c < width; c++) {
    const th = el('th', numeric[c] ? 'num' : '', head[c] ?? '')
    th.style.setProperty('--col', `var(--col-${c % 6})`)
    headRow.append(th)
  }
  thead.append(headRow)
  const tbody = el('tbody')
  body.forEach((r, i) => {
    const tr = el('tr')
    tr.append(el('td', 'rownum', i + 1))
    for (let c = 0; c < width; c++) tr.append(el('td', numeric[c] ? 'num' : '', r[c] ?? ''))
    tbody.append(tr)
  })
  table.append(thead, tbody)

  const wrap = el('div', 'tablewrap')
  wrap.append(table)
  const limited = truncated || rows.length > PREVIEW_ROW_LIMIT
  const caption = t('preview.size', { rows: body.length, cols: width }) + (limited ? ' · ' + t('preview.partial') : '')
  return { node: wrap, caption }
}

/* ---------- Markdown ---------- */

function markdownInline(raw) {
  const code = []
  let html = escapeHtml(raw).replace(/`([^`]+)`/g, (_, c) => `\u0000${code.push(c) - 1}\u0000`)
  html = html
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '<span class="md-image">$1</span>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="md-link" title="$2">$1</span>')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`)
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)|(^|\W)_(?!\s)(.+?)_(?!\w)/g, (_, p1, a, p2, b) => `${p1 ?? p2}<em>${a ?? b}</em>`)
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${code[i]}</code>`)
}

// Covers the common subset: headings, paragraphs, lists, quotes, rules, fenced code, inline styles.
function renderMarkdown(text) {
  const lines = text.split(/\r?\n/)
  const out = []
  let paragraph = []
  const flush = () => { if (paragraph.length) out.push(`<p>${markdownInline(paragraph.join(' '))}</p>`); paragraph = [] }
  const LIST = /^\s*([-*+]|\d+[.)])\s+/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let m
    if ((m = line.match(/^\s*```\s*([\w-]*)/))) {
      flush()
      const code = []
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i])
      out.push(`<pre class="code">${highlightCode(code.join('\n'), m[1].toLowerCase())}</pre>`)
    } else if ((m = line.match(/^(#{1,6})\s+(.*)/))) {
      flush()
      out.push(`<h${m[1].length}>${markdownInline(m[2])}</h${m[1].length}>`)
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      out.push('<hr>')
    } else if (/^>\s?/.test(line)) {
      flush()
      const quote = [line.replace(/^>\s?/, '')]
      while (/^>\s?/.test(lines[i + 1] || '')) quote.push(lines[++i].replace(/^>\s?/, ''))
      out.push(`<blockquote>${markdownInline(quote.join(' '))}</blockquote>`)
    } else if (LIST.test(line)) {
      flush()
      const ordered = /^\s*\d/.test(line)
      const items = [line.replace(LIST, '')]
      while (LIST.test(lines[i + 1] || '')) items.push(lines[++i].replace(LIST, ''))
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag}>${items.map(item => `<li>${markdownInline(item)}</li>`).join('')}</${tag}>`)
    } else if (!line.trim()) {
      flush()
    } else {
      paragraph.push(line.trim())
    }
  }
  flush()
  const node = el('article', 'markdown')
  node.innerHTML = out.join('')
  return node
}

/* ---------- entry point ---------- */

function prettyJson(text) {
  try { return JSON.stringify(JSON.parse(text), null, 2) } catch { return text }
}

/*
 * Builds the viewer content for a non-media file. Returns null when the file is binary and has
 * no dedicated preview, so the caller can fall back to the document icon.
 */
async function richPreview(file) {
  const ext = extensionOf(file.name)
  if (AUDIO_EXT.test(ext)) {
    const node = el('div', 'audioview')
    node.append(docIcon(file.name, 'large'), Object.assign(el('audio'), { src: fileUrl(file.path), controls: true, autoplay: true }))
    return { node, bare: true }
  }
  if (ext === 'svg') return { node: Object.assign(el('img'), { src: fileUrl(file.path) }), bare: true }

  const raw = await call('readText', file.path, PREVIEW_TEXT_LIMIT)
  if (raw == null) return null
  const truncated = raw.length >= PREVIEW_TEXT_LIMIT
  // CRLF and lone CR (classic Mac) line breaks become \n, so line numbers match what is rendered
  const text = raw.replace(/\r\n?/g, '\n')

  if (ext === 'csv' || ext === 'tsv') return csvTable(text, ext, truncated)
  if (ext === 'json') return { node: codeView(prettyJson(text), 'json') }
  if (ext === 'md' || ext === 'markdown') return { node: renderMarkdown(text), source: () => codeView(text, 'md') }
  if (/^html?$/.test(ext)) {
    const page = Object.assign(el('iframe', 'page'), { src: fileUrl(file.path) })
    page.sandbox = 'allow-same-origin' // renders the page but never runs its scripts
    return { node: page, source: () => codeView(text, 'html') }
  }
  if (/^(txt|log)$/.test(ext) || !ext) return { node: el('pre', 'textview', text) }
  return { node: codeView(text, ext) }
}

// Wraps a preview with an optional rendered/source switch and a caption.
function richPreviewFrame({ node, source, caption }) {
  const frame = el('div', 'rich')
  const body = el('div', 'rich-body')
  body.append(node)
  if (source) {
    const switcher = el('div', 'segmented rich-switch')
    let sourceNode = null
    const options = [[t('preview.rendered'), () => node], [t('preview.source'), () => (sourceNode ??= source())]]
    options.forEach(([label, view], i) => {
      const b = el('button', i === 0 ? 'on' : '', label)
      b.onclick = () => {
        switcher.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b))
        body.replaceChildren(view())
      }
      switcher.append(b)
    })
    frame.append(switcher)
  }
  frame.append(body)
  if (caption) frame.append(el('div', 'rich-caption', caption))
  return frame
}
