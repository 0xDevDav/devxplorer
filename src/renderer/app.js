/* ========== helpers ========== */

const $ = selector => document.querySelector(selector)
const $$ = selector => [...document.querySelectorAll(selector)]

function el(tag, cls, text) {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text != null) node.textContent = text
  return node
}

// Windows paths only; drive roots keep their trailing backslash ("C:\").
const baseName = p => { const trimmed = p.replace(/\\$/, ''); return trimmed.slice(trimmed.lastIndexOf('\\') + 1) }
const parentDir = p => {
  const head = p.slice(0, p.lastIndexOf('\\', p.length - 2))
  return head.endsWith(':') || !head ? (head || p.slice(0, 2)) + '\\' : head
}
const joinPath = (dir, name) => dir.endsWith('\\') ? dir + name : dir + '\\' + name
const samePath = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
const fileUrl = p => 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')

/* ========== language ========== */

// "system" follows the Windows display language; unsupported languages fall back to English.
const languagePreference = () => localStorage.language || 'system'
const language = pickLanguage(languagePreference() === 'system' ? navigator.language : languagePreference())
const t = translator(language)
document.documentElement.lang = language

function translateStaticText() {
  for (const node of $$('[data-i18n]')) node.textContent = t(node.dataset.i18n)
  for (const node of $$('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder)
  for (const node of $$('[data-i18n-title]')) node.title = node.ariaLabel = t(node.dataset.i18nTitle)
}

const collator = new Intl.Collator(language, { numeric: true, sensitivity: 'base' })
const byName = (a, b) => collator.compare(a.name, b.name)
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

/* ========== icons ========== */

// Outline icons on a 24x24 grid, drawn with currentColor so CSS sets their color.
const ICONS = {
  desktop: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  downloads: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  documents: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  pictures: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  videos: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  drive: '<rect x="2" y="13" width="20" height="7" rx="2"/><path d="M5 13 7.5 5h9L19 13M17 16.5h.01"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  gear: '<path d="M19.23 10.41L21.53 10.87L21.53 13.13L19.23 13.59L18.23 15.99L19.54 17.94L17.94 19.54L15.99 18.23L13.59 19.23L13.13 21.53L10.87 21.53L10.41 19.23L8.01 18.23L6.06 19.54L4.46 17.94L5.77 15.99L4.77 13.59L2.47 13.13L2.47 10.87L4.77 10.41L5.77 8.01L4.46 6.06L6.06 4.46L8.01 5.77L10.41 4.77L10.87 2.47L13.13 2.47L13.59 4.77L15.99 5.77L17.94 4.46L19.54 6.06L18.23 8.01Z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path fill="currentColor" stroke="none" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>',
  // two-tone filled folder in the style of the Finder
  folderFill: '<path fill="currentColor" stroke="none" opacity=".6" d="M2 6.5A2.5 2.5 0 0 1 4.5 4h4.4l2 2h8.6A2.5 2.5 0 0 1 22 8.5V10H2z"/><path fill="currentColor" stroke="none" d="M2 9h20v9.5a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18.5z"/>',
}

function icon(name, cls = '') {
  const node = el('span', `icon icon-${name} ${cls}`.trim())
  node.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
  return node
}

/*
 * Files without a preview show a document icon in the style of macOS: a page with a folded
 * corner and a label in the color of the file family.
 */
const DOC_KINDS = [
  ['pdf', /^pdf$/],
  ['word', /^(docx?|odt|rtf|pages)$/],
  ['sheet', /^(xlsx?|ods|numbers)$/],
  ['slides', /^(pptx?|odp|key)$/],
  ['archive', /^(zip|rar|7z|tar|gz|bz2|xz)$/],
  ['audio', /^(mp3|wav|flac|m4a|aac|ogg|opus)$/],
  ['app', /^(exe|msi|bat|cmd|ps1|lnk|url|appx|msix)$/],
]

function docIcon(name, cls = '') {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  const kind = DOC_KINDS.find(([, test]) => test.test(ext))?.[0] || 'other'
  const node = el('div', `doc doc-${kind} ${cls}`.trim())
  const page = el('div', 'page')
  page.append(el('span', '', (ext || 'file').slice(0, 4).toUpperCase()))
  node.append(page)
  return node
}

/* ========== state ========== */

const state = {
  cwd: null,
  focus: null, // folder whose content is shown in the right pane
  meta: {}, // path -> annotations, filled from every listing
  items: new Map(), // path -> listing entry (size, type), for the status bar
  allMeta: [], // annotations of the whole library, for extension filter chips
  places: [],
  drives: [],
  selection: new Set(),
  anchor: null,
  sort: localStorage.sort || 'name',
  group: localStorage.group || 'none',
  query: '',
}

const store = {
  get: (key, fallback) => { try { return JSON.parse(localStorage[key]) ?? fallback } catch { return fallback } },
  set: (key, value) => { localStorage[key] = JSON.stringify(value) },
}

let pins = store.get('pins', null)

let tabs = []
let tabIndex = 0
const currentTab = () => tabs[tabIndex]
const saveTabs = () => { store.set('tabs', tabs); store.set('tabIndex', tabIndex) }

async function call(name, ...args) {
  try {
    return await api.call(name, ...args)
  } catch (e) {
    toast(e.message.replace(/^.*Error: /, ''))
    return null
  }
}

function remember(items) {
  for (const item of items) {
    state.meta[item.path] = item.meta
    state.items.set(item.path, item)
  }
  return items
}

async function list(dir) {
  const data = (await call('list', dir)) || { folders: [], files: [] }
  remember(data.folders)
  remember(data.files)
  if (needsPhotoDates()) await attachPhotoDates(data.files)
  return data
}

/*
 * Photos are dated by their EXIF capture time when they have one, every other file by its
 * modification time. Capture dates are read only while sorting or grouping by date.
 */
const PHOTO_FILE = /\.(jpe?g|heic|heif)$/i
const fileDate = item => item.taken ?? item.mtime
const needsPhotoDates = () => state.sort === 'date' || state.group === 'day' || state.group === 'month'

async function attachPhotoDates(files) {
  const photos = files.filter(f => f.taken === undefined && PHOTO_FILE.test(f.name))
  if (!photos.length) return
  const dates = (await call('photoDates', photos.map(f => [f.path, f.mtime]))) || []
  photos.forEach((f, i) => { f.taken = dates[i] ?? null })
}

function toast(message) {
  const box = $('#toast')
  box.textContent = message
  box.hidden = false
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => { box.hidden = true }, 4000)
}

const sorted = items => items.sort(state.sort === 'date' ? (a, b) => fileDate(b) - fileDate(a) : byName)
const nameMatches = item => !state.query || item.name.toLowerCase().includes(state.query)

/* ========== extensions ========== */

/*
 * Extensions are registered by the scripts in ./extensions and receive a small API.
 * Every hook is optional:
 *   badges(meta) -> Node[]            labels drawn on thumbnails and folder rows
 *   dimmed(meta) -> boolean           render the item faded
 *   menu(paths, metas) -> items[]     context menu entries for the selection
 *   chips(allMetas) -> Node[]         filter chips shown in the places bar (none hides the group)
 *   filter: { active(), match(meta), reset() }
 *   viewer: { hint, onKey(event, path) -> boolean }
 */
const extensions = []
const enabledExtensions = store.get('ext', {})
const activeExtensions = () => extensions.filter(x => enabledExtensions[x.id] ?? x.enabledByDefault ?? true)

// Filter item in the places bar, styled like a Finder tag; count goes in the tooltip.
function chip(on, children, onclick, count) {
  const b = el('button', 'chip' + (on ? ' on' : ''))
  b.append(...children)
  if (count != null) b.title = t.n('count.items', count)
  b.onclick = onclick
  return b
}

const extensionApi = {
  language, // extensions ship their own strings and pick them with this code
  el,
  chip,
  compare: collator.compare,
  ask,
  setMeta,
  render,
  refreshViewer: () => { if (viewerOpen()) showViewer() },
}

function registerExtension(factory) {
  extensions.push(factory(extensionApi))
}

// Extension filters query the library, so their results span every folder on the PC.
const filtering = () => activeExtensions().some(x => x.filter?.active())
const metaMatches = m => !!m && activeExtensions().every(x => !x.filter?.active() || x.filter.match(m))

function badges(p) {
  const box = el('span', 'badges')
  const m = state.meta[p]
  if (m) activeExtensions().forEach(x => box.append(...(x.badges?.(m) || [])))
  return box
}

const dimmed = p => !!state.meta[p] && activeExtensions().some(x => x.dimmed?.(state.meta[p]))

/* ========== theme ========== */

const THEMES = [['system', 'settings.system'], ['light', 'theme.light'], ['dark', 'theme.dark']]
const systemDark = matchMedia('(prefers-color-scheme: dark)')
const themePreference = () => localStorage.theme || 'system'

// macOS accent colors: [id, label key, dark appearance, light appearance, text on accent]
const ACCENTS = [
  ['violet', 'accent.violet', '#8b7bff', '#6d5dfc', '#fff'],
  ['blue', 'accent.blue', '#0a84ff', '#007aff', '#fff'],
  ['pink', 'accent.pink', '#ff375f', '#ff2d55', '#fff'],
  ['red', 'accent.red', '#ff453a', '#ff3b30', '#fff'],
  ['orange', 'accent.orange', '#ff9f0a', '#f08c00', '#fff'],
  ['yellow', 'accent.yellow', '#ffd60a', '#e6b800', '#1b1b22'],
  ['green', 'accent.green', '#30d158', '#28a745', '#fff'],
  ['graphite', 'accent.graphite', '#98989d', '#8e8e93', '#fff'],
]
const currentAccent = () => ACCENTS.find(a => a[0] === localStorage.accent) || ACCENTS[0]
const resolvedTheme = () => themePreference() === 'system' ? (systemDark.matches ? 'dark' : 'light') : themePreference()

const glassOn = () => state.supportsGlass && localStorage.glass !== 'false'

function applyTheme() {
  const root = document.documentElement
  const theme = resolvedTheme()
  const [, , dark, light, onAccent] = currentAccent()
  root.dataset.theme = theme
  root.classList.toggle('glass', glassOn())
  root.style.setProperty('--accent', theme === 'dark' ? dark : light)
  root.style.setProperty('--on-accent', onAccent)
  // Window-level appearance waits for init, which tells whether the glass material is available.
  if (state.supportsGlass === undefined) return
  call('appearance', { theme: themePreference(), glass: glassOn(), language })
  if (!viewerOpen()) syncWindowControls()
}

function renderAccentPicker() {
  const theme = resolvedTheme()
  $('#accentPicker').replaceChildren(...ACCENTS.map(([id, label, dark, light]) => {
    const b = el('button', 'swatch' + (currentAccent()[0] === id ? ' on' : ''))
    b.type = 'button'
    b.title = t(label)
    b.style.setProperty('--swatch', theme === 'dark' ? dark : light)
    b.onclick = () => {
      localStorage.accent = id
      applyTheme()
      renderAccentPicker()
    }
    return b
  }))
}

// The native window controls are drawn by Windows and must be recolored to match the theme.
function syncWindowControls() {
  const css = getComputedStyle(document.documentElement)
  call('overlay', {
    color: glassOn() ? '#00000000' : css.getPropertyValue('--bg').trim(),
    symbolColor: css.getPropertyValue('--overlay-symbols').trim(),
    remember: true,
  })
}

function renderThemePicker() {
  $('#themePicker').replaceChildren(...THEMES.map(([value, label]) => {
    const b = el('button', themePreference() === value ? 'on' : '', t(label))
    b.type = 'button'
    b.onclick = () => {
      localStorage.theme = value
      applyTheme()
      renderThemePicker()
      renderAccentPicker()
    }
    return b
  }))
}

/* ========== settings ========== */

function renderLanguagePicker() {
  const options = [['system', t('settings.system')], ...LANGUAGES]
  $('#languagePicker').replaceChildren(...options.map(([value, label]) => {
    const b = el('button', languagePreference() === value ? 'on' : '', label)
    b.type = 'button'
    b.onclick = () => {
      if (value === languagePreference()) return
      localStorage.language = value
      location.reload()
    }
    return b
  }))
}

function openSettings() {
  renderLanguagePicker()
  renderThemePicker()
  renderAccentPicker()
  $('#glassRow').hidden = !state.supportsGlass
  $('#glassToggle').checked = glassOn()
  $('#extList').replaceChildren(...extensions.map(x => {
    const row = el('label', 'ext-row')
    const toggle = Object.assign(el('input'), { type: 'checkbox', checked: activeExtensions().includes(x) })
    const text = el('div')
    text.append(el('b', '', x.name), el('p', 'hint', x.description))
    toggle.onchange = () => {
      enabledExtensions[x.id] = toggle.checked
      store.set('ext', enabledExtensions)
      x.filter?.reset()
      render()
    }
    row.append(text, toggle, el('span', 'switch'))
    return row
  }))
  $('#settings').showModal()
}

async function exportLibrary() {
  const count = await call('exportLibrary')
  if (count != null) toast(t('data.exported', { n: count }))
}

async function importLibrary() {
  const count = await call('importLibrary')
  if (count == null) return
  toast(t('data.imported', { n: count }))
  refresh()
}

/* ========== previews ========== */

// Images and videos use shell thumbnails; other files show their text or a document icon.
async function loadPreview(path, type) {
  if (type !== 'file') return { img: await call('thumb', path) }
  const text = await call('readText', path)
  return text != null ? { text } : {}
}

const previews = new Map()
const loadedPreviews = new Set()
const previewObserver = new IntersectionObserver(entries => entries.forEach(async entry => {
  if (!entry.isIntersecting) return
  previewObserver.unobserve(entry.target)
  const img = entry.target
  const key = img.dataset.src + '|' + img.dataset.mtime
  if (!previews.has(key)) previews.set(key, loadPreview(img.dataset.src, img.dataset.type))
  // Only the first appearance fades in; re-renders show cached previews immediately.
  const instant = loadedPreviews.has(key)
  const preview = await previews.get(key)
  loadedPreviews.add(key)
  let node = img
  if (preview.text != null) img.replaceWith(node = el('div', 'paper', preview.text.slice(0, 600)))
  else if (preview.img) img.src = preview.img
  else img.replaceWith(node = docIcon(baseName(img.dataset.src)))
  if (instant) node.classList.add('instant')
}))

function previewImg(item) {
  const img = el('img')
  img.draggable = false
  Object.assign(img.dataset, { src: item.path, mtime: item.mtime, type: item.type })
  previewObserver.observe(img)
  return img
}

const countLabel = data => [
  data.files.length && t.n('count.files', data.files.length),
  data.folders.length && t.n('count.folders', data.folders.length),
].filter(Boolean).join(' · ') || t('count.empty')

// Fills a 2x2 collage with the first files of a folder; runs after the row is on screen.
async function fillFolderPreview(path, collage, countEl, filesOnly = false) {
  const data = await list(path)
  countEl.textContent = filesOnly ? t.n('count.files', data.files.length) : countLabel(data)
  const files = sorted(data.files).slice(0, 4)
  if (files.length) collage.append(...files.map(previewImg))
  else collage.replaceChildren(icon('folderFill', 'finder-folder'))
}

/* ========== main view: folder list + content pane ========== */

/*
 * Entering a folder plays a cascade: the folder list fades in, its rows slide in one after
 * another, then the content pane follows. Refreshing the same folder does not replay it.
 */
const EASE = 'cubic-bezier(.2, .8, .2, 1)'
const CASCADE_STEP_MS = 30
const CASCADE_MAX_STEPS = 12
const CASCADE_ROW_MS = 320
let contentDelay = 0

function playCascade(pane, rows) {
  if (reducedMotion.matches) return
  pane.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out', fill: 'backwards' })
  rows.forEach((row, i) => row.animate(
    [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }],
    { duration: CASCADE_ROW_MS, delay: Math.min(i, CASCADE_MAX_STEPS) * CASCADE_STEP_MS, easing: EASE, fill: 'backwards' },
  ))
  contentDelay = Math.min(rows.length, 4) * CASCADE_STEP_MS
}

let renderId = 0
async function render() {
  if (!state.cwd) return
  const id = ++renderId

  state.allMeta = (await call('allMeta')) || []
  if (filtering()) {
    const all = remember((await call('annotated')) || []).filter(i => metaMatches(i.meta))
    if (needsPhotoDates()) await attachPhotoDates(all.filter(i => !i.isDir))
    if (id !== renderId) return
    const folders = all.filter(i => i.isDir && nameMatches(i))
    const files = all.filter(i => !i.isDir && nameMatches(i))
    const count = folders.length + files.length
    $('#folders').hidden = true
    showContent(null, [
      el('p', 'hint', t('filter.results', { items: t.n('count.items', count) })),
      count ? grid(folders, files, null) : el('p', 'empty', t('filter.none')),
    ])
  } else {
    const data = await list(state.cwd)
    if (id !== renderId) return
    const folders = sorted(data.folders).filter(nameMatches)
    const here = { name: t('folder.here'), path: state.cwd, self: true }
    const pane = $('#folders')
    const entering = !samePath(pane.dataset.cwd, state.cwd)
    pane.dataset.cwd = state.cwd
    if (!folders.length) {
      pane.hidden = true
      await renderPane({ ...here, name: baseName(state.cwd) }, data)
    } else {
      const entries = data.files.length ? [here, ...folders] : folders
      if (!entries.some(e => samePath(e.path, state.focus))) setFocus(entries[0].path)
      const scroll = pane.scrollTop
      const rows = entries.map(folderRow)
      pane.replaceChildren(...rows)
      pane.hidden = false
      pane.scrollTop = scroll
      if (entering) playCascade(pane, rows)
      const focused = entries.find(e => samePath(e.path, state.focus))
      await renderPane(focused, focused.self ? data : null)
    }
  }

  renderCrumbs()
  renderTabs()
  renderExtensionFilters()
  paintSelection()
  renderDiskSpace()
}

function folderRow(entry) {
  const row = el('div', 'frow' + (samePath(entry.path, state.focus) ? ' focus' : '') + (!entry.self && dimmed(entry.path) ? ' dim' : ''))
  row.entry = entry
  const collage = el('div', 'collage')
  const count = el('div', 'fcount')
  const info = el('div', 'finfo')
  info.append(el('div', 'fname', entry.name), count)
  if (!entry.self) info.append(badges(entry.path))
  row.append(collage, info)
  fillFolderPreview(entry.path, collage, count, entry.self)

  row.addEventListener('click', e => { if (!e.ctrlKey && !e.shiftKey) focusEntry(entry) })
  dropTarget(row, entry.path)
  if (!entry.self) {
    selectable(row, entry.path, true)
    row.addEventListener('dblclick', () => navigate(entry.path))
  }
  return row
}

let paneId = 0
async function renderPane(entry, data) {
  const id = ++paneId
  data ??= await list(entry.path)
  if (id !== paneId) return
  const files = sorted(data.files).filter(nameMatches)
  // The cwd's own subfolders are already listed on the left.
  const folders = entry.self ? [] : sorted(data.folders).filter(nameMatches)

  const head = el('div', 'pane-head')
  const title = el('div', 'pane-title')
  title.append(el('h2', '', entry.name), el('span', 'fcount', entry.self ? t.n('count.files', data.files.length) : countLabel(data)))
  if (!entry.self) title.append(badges(entry.path))
  head.append(title)
  if (!entry.self) {
    const open = el('button', 'ghost', t('folder.open') + '  →')
    open.onclick = () => navigate(entry.path)
    head.append(open)
  }

  showContent(entry.path, [
    head,
    folders.length || files.length ? grid(folders, files, entry.path) : el('p', 'empty', t('folder.empty')),
  ])
  paintSelection()
}

function showContent(path, nodes) {
  const content = $('#content')
  const samePane = samePath(content.dataset.path, path)
  const scroll = content.scrollTop
  content.dataset.path = path || ''
  content.replaceChildren(...nodes)
  content.scrollTop = samePane ? scroll : 0
  if (!samePane && !reducedMotion.matches) {
    content.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: 220, delay: contentDelay, easing: EASE, fill: 'backwards' })
  }
  contentDelay = 0
}

/* ========== grouping ========== */

const dayFormat = new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const monthFormat = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' })
const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1)
const startOfDay = time => new Date(time).setHours(0, 0, 0, 0)
const extensionOf = name => name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''

function dayLabel(day) {
  const daysAgo = Math.round((startOfDay(Date.now()) - day) / 86400000)
  if (daysAgo === 0) return t('day.today')
  if (daysAgo === 1) return t('day.yesterday')
  return capitalize(dayFormat.format(day))
}

const FILE_KINDS = [
  ['kind.images', f => f.type === 'img'],
  ['kind.videos', f => f.type === 'video'],
  ['kind.documents', f => /^(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|md|csv)$/.test(extensionOf(f.name))],
  ['kind.audio', f => /^(mp3|wav|flac|m4a|aac|ogg|opus)$/.test(extensionOf(f.name))],
  ['kind.archives', f => /^(zip|rar|7z|tar|gz|bz2|xz)$/.test(extensionOf(f.name))],
  ['kind.programs', f => /^(exe|msi|bat|cmd|ps1|lnk|url)$/.test(extensionOf(f.name))],
  ['kind.other', () => true],
]

// Date groups use the same date as the "most recent" sort (capture time for photos).
const GROUPINGS = {
  day: { key: f => startOfDay(fileDate(f)), label: dayLabel, compare: (a, b) => b - a },
  month: {
    key: f => { const d = new Date(fileDate(f)); return new Date(d.getFullYear(), d.getMonth()).getTime() },
    label: month => capitalize(monthFormat.format(month)),
    compare: (a, b) => b - a,
  },
  kind: { key: f => FILE_KINDS.findIndex(([, test]) => test(f)), label: i => t(FILE_KINDS[i][0]), compare: (a, b) => a - b },
  extension: { key: f => extensionOf(f.name), label: ext => ext ? ext.toUpperCase() : t('extension.none'), compare: collator.compare },
}

// Splits already sorted files into labelled groups; without a grouping returns a single unlabelled one.
function groupFiles(files) {
  const grouping = GROUPINGS[state.group]
  if (!grouping) return [{ files }]
  const groups = new Map()
  for (const f of files) {
    const key = grouping.key(f)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(f)
  }
  return [...groups.keys()].sort(grouping.compare).map(key => ({ label: grouping.label(key), files: groups.get(key) }))
}

// Collapsed groups are remembered by grouping and label, so e.g. "Altro" stays collapsed in every folder.
const collapsedGroups = new Set(store.get('collapsedGroups', []))

function groupSection(label, count, content) {
  const id = state.group + ':' + label
  const head = el('div', 'group-head')
  const body = el('div', 'group-body')
  const inner = el('div')
  head.append(icon('chevron', 'chev'), el('span', '', label), el('small', '', count))
  inner.append(content)
  body.append(inner)
  const apply = () => {
    const collapsed = collapsedGroups.has(id)
    head.classList.toggle('collapsed', collapsed)
    body.classList.toggle('collapsed', collapsed)
  }
  head.onclick = () => {
    collapsedGroups.has(id) ? collapsedGroups.delete(id) : collapsedGroups.add(id)
    store.set('collapsedGroups', [...collapsedGroups])
    apply()
  }
  apply()
  return [head, body]
}

function grid(folders, files, dir) {
  const groups = groupFiles(files)
  const displayOrder = groups.flatMap(g => g.files) // viewer navigation follows what is on screen
  const block = (items, folderItems = []) => {
    const node = el('div', 'grid')
    folderItems.forEach(f => node.append(folderTile(f)))
    items.forEach(f => node.append(fileCard(f, displayOrder)))
    if (dir) dropTarget(node, dir)
    return node
  }
  if (!groups[0]?.label) return block(files, folders)

  const root = el('div', 'groups')
  if (folders.length) root.append(...groupSection(t('group.folders'), folders.length, block([], folders)))
  for (const g of groups) root.append(...groupSection(g.label, g.files.length, block(g.files)))
  return root
}

function setFocus(path) {
  state.focus = path
  currentTab().focus = path
  saveTabs()
}

function focusEntry(entry) {
  if (samePath(entry.path, state.focus)) return
  setFocus(entry.path)
  for (const row of $$('#folders .frow')) {
    const on = row.entry === entry
    row.classList.toggle('focus', on)
    if (on) row.scrollIntoView({ block: 'nearest' })
  }
  renderPane(entry, null)
}

function moveFocus(step) {
  const rows = $$('#folders .frow')
  if (!rows.length || $('#folders').hidden) return
  const i = rows.findIndex(r => r.classList.contains('focus'))
  focusEntry(rows[Math.max(0, Math.min(rows.length - 1, i + step))].entry)
}

function enterFocus() {
  if (!filtering() && state.focus && !samePath(state.focus, state.cwd) && !$('#folders').hidden) navigate(state.focus)
}

function folderTile(folder) {
  const tile = el('div', 'item folder' + (dimmed(folder.path) ? ' dim' : ''))
  const thumb = el('div', 'thumb')
  const collage = el('div', 'collage')
  const count = el('div', 'fcount')
  thumb.append(collage, badges(folder.path))
  tile.append(thumb, el('div', 'name', folder.name), count)
  tile.title = folder.path
  fillFolderPreview(folder.path, collage, count)
  selectable(tile, folder.path, true)
  tile.addEventListener('dblclick', () => navigate(folder.path))
  dropTarget(tile, folder.path)
  return tile
}

function fileCard(file, siblings) {
  const card = el('div', 'item' + (dimmed(file.path) ? ' dim' : ''))
  const thumb = el('div', 'thumb')
  thumb.append(previewImg(file), badges(file.path))
  if (file.type === 'video') thumb.append(icon('play', 'play'))
  card.append(thumb, el('div', 'name', file.name))
  card.title = file.path
  selectable(card, file.path, false)
  // Double click opens photos and videos in the viewer and every other file in its default program;
  // Space previews any file (see preview below).
  const isMedia = f => f.type === 'img' || f.type === 'video'
  card.preview = () => openViewer(siblings, file)
  card.addEventListener('dblclick', () => {
    if (isMedia(file)) openViewer(siblings.filter(isMedia), file)
    else call('open', file.path)
  })

  // Dropping on a card inserts before or after it, depending on the pointer's half.
  const after = e => { const r = card.getBoundingClientRect(); return e.clientX > r.left + r.width / 2 }
  card.addEventListener('dragover', e => {
    e.preventDefault()
    e.stopPropagation()
    card.classList.toggle('ins-after', after(e))
    card.classList.toggle('ins-before', !after(e))
  })
  card.addEventListener('dragleave', () => card.classList.remove('ins-before', 'ins-after'))
  card.addEventListener('drop', async e => {
    e.preventDefault()
    e.stopPropagation()
    const insertAfter = after(e)
    card.classList.remove('ins-before', 'ins-after')
    const paths = droppedPaths(e)
    const dir = parentDir(file.path)
    if (!paths.length) return
    if (paths.every(p => samePath(parentDir(p), dir))) await reorder(dir, paths, file.path, insertAfter)
    else await call('move', paths, dir)
    refresh()
  })
  return card
}

/* ========== selection ========== */

const isShown = node => !node.closest('.group-body.collapsed')
const visiblePaths = () => $$('#main [data-path]').filter(isShown).map(n => n.dataset.path)
const selectedInOrder = () => [...new Set(visiblePaths().filter(p => state.selection.has(p)))]

function selectable(node, path, isFolder) {
  node.dataset.path = path
  if (isFolder) node.dataset.folder = ''
  node.draggable = true
  node.addEventListener('click', e => { e.stopPropagation(); select(path, e) })
  node.addEventListener('contextmenu', e => {
    e.stopPropagation()
    if (!state.selection.has(path)) select(path, {})
    itemMenu(e)
  })
  node.addEventListener('dragstart', e => {
    e.preventDefault()
    if (!state.selection.has(path)) select(path, {})
    const src = node.querySelector('img')?.src
    api.drag(selectedInOrder(), src?.startsWith('data:') ? src : null)
  })
}

function select(path, e) {
  const sel = state.selection
  if (e.shiftKey && state.anchor) {
    const all = visiblePaths()
    const [from, to] = [all.indexOf(state.anchor), all.indexOf(path)].sort((a, b) => a - b)
    if (!e.ctrlKey) sel.clear()
    all.slice(from, to + 1).forEach(p => sel.add(p))
  } else if (e.ctrlKey) {
    sel.has(path) ? sel.delete(path) : sel.add(path)
    state.anchor = path
  } else {
    state.selection = new Set([path])
    state.anchor = path
  }
  paintSelection()
}

function clearSelection() {
  state.selection.clear()
  paintSelection()
}

function paintSelection() {
  $$('#main [data-path]').forEach(n => n.classList.toggle('sel', state.selection.has(n.dataset.path)))
  renderStatus()
}

/* ========== status bar ========== */

const sizeFormat = new Intl.NumberFormat(language, { maximumFractionDigits: 1 })
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++ }
  return sizeFormat.format(bytes) + ' ' + units[i]
}

// Folder sizes arrive asynchronously; a newer call makes older ones drop their result.
let statusToken = 0
async function renderStatus() {
  const token = ++statusToken
  const left = $('#statusLeft')
  const parts = [t.n('count.items', $$('#content [data-path]').filter(isShown).length)]
  const selected = selectedInOrder().map(p => state.items.get(p)).filter(Boolean)
  if (!selected.length) { left.textContent = parts.join(' · '); return }

  parts.push(t.n('status.selected', selected.length))
  const files = selected.filter(i => !i.isDir).reduce((sum, i) => sum + i.size, 0)
  const folders = selected.filter(i => i.isDir)
  left.textContent = [...parts, folders.length ? t('status.computing') : formatBytes(files)].join(' · ')
  if (!folders.length) return
  const sizes = await Promise.all(folders.map(f => call('folderSize', f.path)))
  if (token === statusToken) left.textContent = [...parts, formatBytes(files + sizes.reduce((a, b) => a + (b || 0), 0))].join(' · ')
}

async function renderDiskSpace() {
  const space = await call('diskSpace', state.cwd)
  $('#statusRight').textContent = space ? t('status.free', { size: formatBytes(space.free) }) : ''
}

/* ========== file operations ========== */

const droppedPaths = e => [...e.dataTransfer.files].map(f => api.pathFor(f)).filter(Boolean)

function dropTarget(node, dir) {
  node.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); node.classList.add('target') })
  node.addEventListener('dragleave', () => node.classList.remove('target'))
  node.addEventListener('drop', async e => {
    e.preventDefault()
    e.stopPropagation()
    node.classList.remove('target')
    const paths = droppedPaths(e)
    if (paths.length) { await call('move', paths, dir); refresh() }
  })
}

/*
 * Ordering is persisted in the file names ("01_name.jpg") so it survives outside the app.
 * label replaces the original stem; without it an existing numeric prefix is swapped.
 */
const counter = (i, total) => String(i + 1).padStart(Math.max(2, String(total).length), '0')
function renumber(paths, label) {
  return call('renameMany', paths.map((p, i) => {
    const name = baseName(p)
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 ? name.slice(dot) : ''
    const stem = dot > 0 ? name.slice(0, dot) : name
    const rest = label ?? stem.replace(/^\d+(_|$)/, '')
    return [p, counter(i, paths.length) + (rest ? '_' + rest : '') + ext]
  }))
}

async function reorder(dir, moving, target, insertAfter) {
  if (moving.includes(target)) return
  const order = sorted((await list(dir)).files).map(f => f.path).filter(p => !moving.includes(p))
  order.splice(order.indexOf(target) + (insertAfter ? 1 : 0), 0, ...moving)
  await renumber(order)
  state.selection.clear()
  if (state.sort !== 'name') setSort('name')
}

async function renameSelection() {
  const paths = selectedInOrder()
  if (paths.length === 1) {
    const name = await ask(t('rename.prompt'), baseName(paths[0]), true)
    if (name && name !== baseName(paths[0])) {
      await call('renameMany', [[paths[0], name.trim()]])
      if (samePath(paths[0], state.focus)) setFocus(joinPath(parentDir(paths[0]), name.trim()))
    }
  } else if (paths.length > 1) {
    if (new Set(paths.map(p => parentDir(p).toLowerCase())).size > 1) {
      return toast(t('rename.sameFolder'))
    }
    const label = await ask(t('rename.base', { n: paths.length }))
    if (label === null) return
    await renumber(paths, label.trim())
  }
  state.selection.clear()
  refresh()
}

async function trashSelection() {
  await call('trash', selectedInOrder())
  state.selection.clear()
  refresh()
}

async function setMeta(paths, op) {
  await call('setMeta', paths, op)
  await render()
}

async function newFolder() {
  const name = await ask(t('folder.newPrompt'), t('folder.newDefault'))
  if (name) { await call('mkdir', state.cwd, name.trim()); refresh() }
}

const isPinned = p => pins.some(x => samePath(x.path, p))
function togglePin(p) {
  pins = isPinned(p) ? pins.filter(x => !samePath(x.path, p)) : [...pins, { name: baseName(p), path: p }]
  store.set('pins', pins)
  renderPlaces()
}

/* ========== context menu ========== */

function showMenu(e, items) {
  e.preventDefault()
  const menu = $('#menu')
  menu.replaceChildren()
  for (const item of items.filter(Boolean)) {
    if (item === '-') {
      if (menu.lastChild && menu.lastChild.tagName !== 'HR') menu.append(el('hr'))
      continue
    }
    const b = el('button', item.danger ? 'danger' : '')
    if (item.dot) b.append(el('i', 'dot ' + item.dot))
    b.append(el('span', '', item.label))
    if (item.check) b.append(icon('check', 'check'))
    if (item.key) b.append(el('kbd', '', item.key))
    b.onclick = () => { menu.hidden = true; item.run() }
    menu.append(b)
  }
  if (menu.lastChild?.tagName === 'HR') menu.lastChild.remove()
  menu.hidden = false
  menu.style.left = Math.min(e.clientX, innerWidth - menu.offsetWidth - 8) + 'px'
  menu.style.top = Math.min(e.clientY, innerHeight - menu.offsetHeight - 8) + 'px'
}

function itemMenu(e) {
  const paths = selectedInOrder()
  const single = paths.length === 1 ? paths[0] : null
  const isFolder = single && $$('#main [data-folder].sel').length > 0
  const metas = paths.map(p => state.meta[p] || {})
  showMenu(e, [
    single && { label: t('menu.open'), run: () => isFolder ? navigate(single) : call('open', single) },
    isFolder && { label: t('menu.openNewTab'), run: () => newTab(single) },
    single && { label: t('menu.reveal'), run: () => call('reveal', single) },
    isFolder && { label: isPinned(single) ? t('menu.unpin') : t('menu.pin'), run: () => togglePin(single) },
    { label: single ? t('menu.rename') : t('menu.number', { n: paths.length }), key: 'F2', run: renameSelection },
    ...activeExtensions().flatMap(x => x.menu ? ['-', ...x.menu(paths, metas)] : []),
    '-',
    { label: t('menu.trash'), key: t('key.delete'), danger: true, run: trashSelection },
  ])
}

/* ========== input dialog ========== */

function ask(label, value = '', selectStem = false) {
  const dialog = $('#ask')
  const input = $('#askInput')
  $('#askLabel').textContent = label
  input.value = value
  dialog.returnValue = ''
  dialog.showModal()
  input.focus()
  const dot = value.lastIndexOf('.')
  if (selectStem && dot > 0) input.setSelectionRange(0, dot)
  else input.select()
  return new Promise(resolve => {
    dialog.onclose = () => resolve(dialog.returnValue === 'ok' ? input.value : null)
  })
}

/* ========== full-screen viewer ========== */

let viewer = null
const FADE_MS = 200
const viewerOpen = () => $('#viewer').classList.contains('show')

function openViewer(items, current) {
  viewer = { items, index: items.findIndex(x => x.path === current.path) }
  call('overlay', { color: '#000000', symbolColor: '#c9c9d4' })
  showViewer()
}

function closeViewer() {
  const box = $('#viewer')
  box.classList.remove('show')
  box.querySelector('video')?.pause()
  syncWindowControls()
  // Content is dropped only after the fade-out, unless the viewer was reopened meanwhile.
  setTimeout(() => { if (!viewerOpen()) box.replaceChildren() }, FADE_MS)
}

function showViewer() {
  const box = $('#viewer')
  const file = viewer.items[viewer.index]
  const isCurrent = () => viewer.items[viewer.index] === file
  let media

  if (file.type === 'video') {
    media = Object.assign(el('video'), { src: fileUrl(file.path), controls: true, autoplay: true })
  } else if (file.type === 'img') {
    media = el('img')
    // Chromium cannot decode HEIC; the Windows shell renders a full-size image for it.
    if (/\.heic$/i.test(file.path)) call('thumb', file.path, 2560).then(url => { if (url && isCurrent()) media.src = url })
    else media.src = fileUrl(file.path)
  } else if (/\.pdf$/i.test(file.path)) {
    media = Object.assign(el('iframe', 'doc'), { src: fileUrl(file.path) })
  } else {
    media = el('div', 'other')
    richPreview(file).then(preview => {
      if (!isCurrent()) return
      if (preview?.bare) return media.replaceWith(preview.node)
      if (preview) return media.replaceWith(richPreviewFrame(preview))
      const open = el('button', 'primary', t('viewer.openWith'))
      open.onclick = () => call('open', file.path)
      media.append(docIcon(file.name, 'large'), el('div', 'name', file.name), open)
    })
  }

  const transparent = TRANSPARENT_IMAGE.test(file.name)
  const zoomable = file.type === 'img' || /\.svg$/i.test(file.name)
  const hints = [
    t('viewer.hint.browse'),
    ...(zoomable ? [t('viewer.hint.zoom')] : []),
    ...(transparent ? [t('viewer.hint.matte')] : []),
    t('viewer.hint.info'),
    ...activeExtensions().map(x => x.viewer?.hint).filter(Boolean),
    t('viewer.hint.open'),
    t('viewer.hint.close'),
  ]
  const bar = el('div', 'viewer-bar')
  bar.append(el('span', '', `${viewer.index + 1} / ${viewer.items.length} · ${file.name}`), badges(file.path), el('span', 'hint', hints.join(' · ')))
  box.replaceChildren(media, bar)
  if (transparent) box.append(matteSwitch())
  if (infoOpen()) box.append(infoPanel(file, media))
  applyMatte()
  resetZoom()
  box.classList.add('show')
}

/*
 * Zoom and pan for images: the wheel zooms around the pointer, dragging pans, double click
 * switches between fit and actual pixels, + and - work from the keyboard.
 */
const ZOOM_MAX = 8
let zoom = { scale: 1, x: 0, y: 0 }
const viewerImage = () => $('#viewer > img')

function applyZoom() {
  const img = viewerImage()
  if (!img) return
  img.style.transform = zoom.scale === 1 ? '' : `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`
  img.classList.toggle('zoomed', zoom.scale > 1)
}

function resetZoom() {
  zoom = { scale: 1, x: 0, y: 0 }
  applyZoom()
}

// Scales around the given point, so whatever is under the pointer stays under it.
function zoomBy(factor, clientX, clientY) {
  const img = viewerImage()
  if (!img) return
  const next = Math.min(ZOOM_MAX, Math.max(1, zoom.scale * factor))
  if (next === 1) return resetZoom()
  const r = img.getBoundingClientRect()
  const dx = (clientX ?? r.left + r.width / 2) - (r.left + r.width / 2)
  const dy = (clientY ?? r.top + r.height / 2) - (r.top + r.height / 2)
  const k = next / zoom.scale
  zoom = { scale: next, x: zoom.x - dx * (k - 1), y: zoom.y - dy * (k - 1) }
  applyZoom()
}

// Fit <-> actual pixels; images that already fit at their real size zoom to 2x instead.
function toggleActualSize(e) {
  const img = viewerImage()
  if (zoom.scale > 1) return resetZoom()
  const actual = img.naturalWidth / img.getBoundingClientRect().width
  zoomBy(actual > 1.05 ? actual : 2, e.clientX, e.clientY)
}

function bindViewerZoom() {
  const box = $('#viewer')
  box.addEventListener('wheel', e => {
    if (!viewerImage()) return
    e.preventDefault()
    zoomBy(Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY)
  }, { passive: false })
  box.addEventListener('dblclick', e => { if (e.target === viewerImage()) toggleActualSize(e) })
  box.addEventListener('pointerdown', e => {
    const img = viewerImage()
    if (e.target !== img || zoom.scale === 1) return
    e.preventDefault()
    const start = { x: e.clientX - zoom.x, y: e.clientY - zoom.y }
    img.classList.add('dragging')
    const move = ev => { zoom.x = ev.clientX - start.x; zoom.y = ev.clientY - start.y; applyZoom() }
    const up = () => {
      img.classList.remove('dragging')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })
}

/* Info panel (I): size and dates, plus dimensions, duration and camera details where available. */
const infoOpen = () => localStorage.infoPanel === 'true'
const dateTimeFormat = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' })
const waitFor = (node, event) => new Promise(resolve => node.addEventListener(event, resolve, { once: true }))

function formatDuration(seconds) {
  const s = Math.round(seconds)
  const hms = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
  return (hms[0] ? hms : hms.slice(1)).map((n, i) => i ? String(n).padStart(2, '0') : n).join(':')
}

function exposureLabel(info) {
  return [
    info.exposure && (info.exposure < 1 ? `1/${Math.round(1 / info.exposure)} s` : `${sizeFormat.format(info.exposure)} s`),
    info.fNumber && 'f/' + sizeFormat.format(info.fNumber),
    info.iso && 'ISO ' + info.iso,
    info.focalLength && sizeFormat.format(info.focalLength) + ' mm',
  ].filter(Boolean).join(' · ')
}

function infoPanel(file, media) {
  const panel = el('aside', 'info-panel')
  const list = el('dl')
  panel.append(el('h4', '', file.name), list)
  const row = (key, value) => { if (value) list.append(el('dt', '', t(key)), el('dd', '', value)) }

  ;(async () => {
    const item = state.items.get(file.path) || file
    const photo = file.type === 'img' ? (await call('photoInfo', file.path)) || {} : {}
    let { width, height } = photo
    let duration = null
    if (media.tagName === 'VIDEO') {
      if (media.readyState < 1) await waitFor(media, 'loadedmetadata')
      width = media.videoWidth
      height = media.videoHeight
      duration = media.duration
    } else if (media.tagName === 'IMG' && !width) {
      if (!media.complete) await waitFor(media, 'load')
      width = media.naturalWidth
      height = media.naturalHeight
    }
    const camera = photo.model && (photo.make && !photo.model.startsWith(photo.make) ? `${photo.make} ${photo.model}` : photo.model)
    row('info.dimensions', width && `${width} × ${height} px`)
    row('info.duration', duration && formatDuration(duration))
    row('info.size', item.size != null && !item.isDir && formatBytes(item.size))
    row('info.taken', photo.taken && dateTimeFormat.format(photo.taken))
    row('info.modified', item.mtime && dateTimeFormat.format(item.mtime))
    row('info.camera', camera)
    row('info.lens', photo.lens)
    row('info.exposure', exposureLabel(photo))
  })()
  return panel
}

function toggleInfo() {
  localStorage.infoPanel = !infoOpen()
  const box = $('#viewer')
  box.querySelector('.info-panel')?.remove()
  if (infoOpen()) box.append(infoPanel(viewer.items[viewer.index], box.firstElementChild))
}

/* Images that may contain transparency can be shown on a dark, light or checkerboard matte. */
const TRANSPARENT_IMAGE = /\.(png|webp|gif|svg|avif|ico|bmp)$/i
const MATTES = [['dark', 'matte.dark'], ['light', 'matte.light'], ['checker', 'matte.checker']]
const currentMatte = () => MATTES.some(([m]) => m === localStorage.matte) ? localStorage.matte : 'dark'

function applyMatte() {
  const box = $('#viewer')
  MATTES.forEach(([m]) => box.classList.toggle('matte-' + m, m === currentMatte()))
  box.querySelectorAll('.matte-switch button').forEach(b => b.classList.toggle('on', b.dataset.matte === currentMatte()))
}

function setMatte(matte) {
  localStorage.matte = matte
  applyMatte()
}

function matteSwitch() {
  const switcher = el('div', 'segmented matte-switch')
  for (const [matte, label] of MATTES) {
    const b = el('button')
    b.dataset.matte = matte
    b.title = t(label)
    b.append(el('span', 'matte-sample'))
    b.onclick = () => setMatte(matte)
    switcher.append(b)
  }
  return switcher
}

function viewerKey(e) {
  const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key]
  const file = viewer.items[viewer.index]
  if (step) {
    viewer.index = (viewer.index + step + viewer.items.length) % viewer.items.length
    showViewer()
  } else if (e.key === 'Escape' || e.key === ' ') {
    e.preventDefault()
    closeViewer()
  }
  else if (e.key === 'Enter') call('open', file.path)
  else if (e.key === '+' || e.key === '=') zoomBy(1.25)
  else if (e.key === '-') zoomBy(0.8)
  else if (e.key.toLowerCase() === 'i') toggleInfo()
  else if (e.key.toLowerCase() === 'b' && TRANSPARENT_IMAGE.test(file.name)) {
    const i = MATTES.findIndex(([m]) => m === currentMatte())
    setMatte(MATTES[(i + 1) % MATTES.length][0])
  }
  else activeExtensions().some(x => x.viewer?.onKey?.(e, file.path))
}

/* ========== places bar: favorites, drives, extension filters ========== */

function placeButton(dir, name, kind) {
  const b = el('button', 'place' + (samePath(dir, state.cwd) ? ' active' : ''))
  b.append(icon(kind), el('span', '', name))
  b.title = dir
  b.onclick = () => navigate(dir)
  b.onauxclick = e => { if (e.button === 1) newTab(dir) }
  b.oncontextmenu = e => showMenu(e, [
    { label: t('menu.openNewTab'), run: () => newTab(dir) },
    { label: t('menu.openInExplorer'), run: () => call('open', dir) },
    { label: isPinned(dir) ? t('menu.unpin') : t('menu.pin'), run: () => togglePin(dir) },
  ])
  dropTarget(b, dir)
  return b
}

function renderPlaces() {
  // System places keep their canonical order; folders pinned by the user follow in pin order.
  const rank = pin => {
    const i = state.places.findIndex(p => samePath(p.path, pin.path))
    return i < 0 ? state.places.length : i
  }
  const kindOf = pin => state.places[rank(pin)]?.kind || 'folder'
  const ordered = [...pins].sort((a, b) => rank(a) - rank(b))
  const nameOf = pin => kindOf(pin) === 'folder' ? pin.name : t('place.' + kindOf(pin))
  $('#favs').replaceChildren(...ordered.map(p => placeButton(p.path, nameOf(p), kindOf(p))))
  $('#drives').replaceChildren(...state.drives.map(d => placeButton(d, d.slice(0, 2), 'drive')))
}

function renderExtensionFilters() {
  const all = state.allMeta
  const groups = activeExtensions().filter(x => x.chips).map(x => x.chips(all)).filter(chips => chips.length)
  $('#extfilters').replaceChildren(...groups.flatMap((chips, i) => {
    const group = el('div', 'filter-group')
    group.append(...chips)
    return i ? [el('span', 'divider'), group] : [group]
  }))
}

/* ========== header: tabs and breadcrumbs ========== */

function renderTabs() {
  const strip = $('#tabs')
  strip.replaceChildren(...tabs.map((tab, i) => {
    const node = el('div', 'tab' + (i === tabIndex ? ' on' : ''))
    const close = el('button')
    close.append(icon('close'))
    close.title = t('tab.close')
    close.onclick = e => { e.stopPropagation(); closeTab(i) }
    node.append(el('span', '', baseName(tab.cwd)), close)
    node.title = tab.cwd
    node.onclick = () => switchTab(i)
    node.onauxclick = e => { if (e.button === 1) closeTab(i) }
    dropTarget(node, tab.cwd)
    return node
  }))
  const add = el('button', 'new-tab')
  add.append(icon('plus'))
  add.title = t('tab.new')
  add.onclick = () => newTab(state.cwd)
  strip.append(add)
}

function renderCrumbs() {
  const crumbs = $('#crumbs')
  crumbs.replaceChildren()
  const parts = state.cwd.split('\\').filter(Boolean)
  let path = ''
  parts.forEach((name, i) => {
    path = i ? joinPath(path, name) : name + '\\'
    const target = path
    const b = el('button', '', name)
    b.onclick = () => navigate(target)
    dropTarget(b, target)
    crumbs.append(b)
    if (i < parts.length - 1) crumbs.append(icon('chevron', 'sep'))
  })
}

/* ========== navigation and tabs ========== */

function navigate(dir, focus = null) {
  Object.assign(currentTab(), { cwd: dir, focus })
  saveTabs()
  return showTab()
}

// Going up keeps the folder we came from focused, so the list does not lose its place.
function goUp() {
  const from = state.cwd
  if (!samePath(parentDir(from), from)) navigate(parentDir(from), from)
}

function showTab() {
  const tab = currentTab()
  state.cwd = tab.cwd
  state.focus = tab.focus
  extensions.forEach(x => x.filter?.reset())
  state.selection.clear()
  $('#folders').scrollTop = 0
  call('watch', tab.cwd)
  return refresh()
}

function switchTab(i) {
  tabIndex = (i + tabs.length) % tabs.length
  saveTabs()
  showTab()
}

function newTab(dir) {
  tabs.splice(tabIndex + 1, 0, { cwd: dir, focus: null })
  switchTab(tabIndex + 1)
}

function closeTab(i) {
  if (tabs.length === 1) return
  tabs.splice(i, 1)
  if (i < tabIndex || tabIndex === tabs.length) tabIndex--
  switchTab(tabIndex)
}

const refresh = () => Promise.all([renderPlaces(), render()])

function setSort(value) {
  state.sort = localStorage.sort = value
  renderControls()
  refresh()
}

function setGroup(value) {
  state.group = localStorage.group = value
  renderControls()
  render()
}

/* ========== toolbar popup buttons ========== */

const SORT_OPTIONS = [['name', 'sort.name'], ['date', 'sort.date']]
const GROUP_OPTIONS = [['none', 'group.none'], ['day', 'group.day'], ['month', 'group.month'], ['kind', 'group.kind'], ['extension', 'group.extension']]

// A button showing the current choice that opens the options as a menu, like a macOS pop-up button.
function popupButton(button, options, current, pick) {
  button.replaceChildren(el('span', '', t(options.find(([value]) => value === current)?.[1])), icon('chevronDown'))
  button.onclick = () => {
    const r = button.getBoundingClientRect()
    showMenu({ preventDefault() {}, clientX: r.left, clientY: r.bottom + 6 },
      options.map(([value, label]) => ({ label: t(label), check: value === current, run: () => pick(value) })))
  }
}

function renderControls() {
  popupButton($('#sort'), SORT_OPTIONS, state.sort, setSort)
  popupButton($('#group'), GROUP_OPTIONS, state.group, setGroup)
}

/* ========== global events ========== */

function bindEvents() {
  const main = $('#main')
  main.addEventListener('click', clearSelection)
  main.addEventListener('contextmenu', e => showMenu(e, [
    { label: t('menu.newFolder'), run: newFolder },
    { label: t('menu.openInExplorer'), run: () => call('open', state.cwd) },
    { label: isPinned(state.cwd) ? t('menu.unpin') : t('menu.pin'), run: () => togglePin(state.cwd) },
  ]))

  const contentPane = $('#content')
  contentPane.addEventListener('dragover', e => e.preventDefault())
  contentPane.addEventListener('drop', async e => {
    e.preventDefault()
    const paths = droppedPaths(e)
    const dir = contentPane.dataset.path
    if (paths.length && dir) { await call('move', paths, dir); refresh() }
  })

  // Without this, dropping a file outside a target would navigate the window to it.
  document.addEventListener('dragover', e => e.preventDefault())
  document.addEventListener('drop', e => e.preventDefault())

  document.addEventListener('mousedown', e => { if (!$('#menu').contains(e.target)) $('#menu').hidden = true })

  document.addEventListener('keydown', e => {
    if ($('dialog[open]')) return
    if (e.ctrlKey && !viewerOpen()) {
      const step = { '+': 1, '=': 1, '-': -1, '0': 0 }[e.key]
      if (step !== undefined) { e.preventDefault(); return resizeSection(pointerSection, step) }
    }
    if (e.target.closest?.('input, select')) return
    if (viewerOpen()) return viewerKey(e)
    if (e.key === ' ') {
      e.preventDefault()
      return $('#content .item.sel:not(.folder)')?.preview()
    }

    if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); return newTab(state.cwd) }
    if (e.ctrlKey && e.key.toLowerCase() === 'w') { e.preventDefault(); return closeTab(tabIndex) }
    if (e.ctrlKey && e.key === 'Tab') { e.preventDefault(); return switchTab(tabIndex + (e.shiftKey ? -1 : 1)) }

    const selected = selectedInOrder()
    const fileSelected = selected.length === 1 && $$('#content .item.sel:not(.folder)').length === 1
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(e.key === 'ArrowDown' ? 1 : -1) }
    else if (e.key === 'ArrowRight') enterFocus()
    else if (e.key === 'ArrowLeft' || e.key === 'Backspace') goUp()
    else if (e.key === 'Enter') {
      if (fileSelected) $('#content .item.sel')?.dispatchEvent(new MouseEvent('dblclick'))
      else enterFocus()
    } else if (e.key === 'Delete' && selected.length) trashSelection()
    else if (e.key === 'F2' && selected.length) renameSelection()
    else if (e.key === 'a' && e.ctrlKey) {
      e.preventDefault()
      $$('#content [data-path]').filter(isShown).forEach(n => state.selection.add(n.dataset.path))
      paintSelection()
    } else if (e.key === 'Escape') clearSelection()
  })

  $('#askInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#ask').close('ok') }
  })
  $('#viewer').addEventListener('click', e => { if (e.target.id === 'viewer') closeViewer() })
  $('#settingsBtn').replaceChildren(icon('gear'))
  $('#settingsBtn').onclick = openSettings
  $('#glassToggle').onchange = e => {
    localStorage.glass = e.target.checked
    applyTheme()
  }
  $('#exportBtn').onclick = exportLibrary
  $('#importBtn').onclick = importLibrary
  $('.search').prepend(icon('search'))
  $('#q').addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !e.target.value) return
    e.target.value = ''
    e.target.dispatchEvent(new Event('input'))
  })
  $('#q').oninput = e => {
    state.query = e.target.value.trim().toLowerCase()
    clearTimeout(state.queryTimer)
    state.queryTimer = setTimeout(render, 200)
  }
  // Ctrl + wheel resizes the section under the pointer instead of zooming the whole window.
  document.addEventListener('pointerover', e => { pointerSection = sectionOf(e.target) })
  bindViewerZoom()
  document.addEventListener('wheel', e => {
    if (!e.ctrlKey || viewerOpen()) return
    e.preventDefault()
    resizeSection(sectionOf(e.target), e.deltaY < 0 ? 1 : -1)
  }, { passive: false })

  systemDark.addEventListener('change', applyTheme)
  api.onChanged(refresh)
  // Picks up changes made by other programs while the window was in the background.
  window.addEventListener('focus', refresh)
}

/*
 * ========== zoom (Ctrl + / Ctrl - / Ctrl 0 / Ctrl + wheel) ==========
 * Each section has its own size and the shortcuts act on the one under the pointer:
 * the folder list scales its collages, the content pane its thumbnails.
 */

const ZOOM = {
  folders: { key: 'rowSize', cssVar: '--row-size', steps: [36, 44, 52, 64, 80, 100, 124], fallback: 52 },
  content: { key: 'size', cssVar: '--size', steps: [110, 130, 150, 170, 200, 230, 270, 320], fallback: 170 },
}
let pointerSection = 'content'
const sectionOf = node => node?.closest?.('#folders') ? 'folders' : 'content'
const zoomValue = z => Number(localStorage[z.key]) || z.fallback

function applySizes() {
  for (const z of Object.values(ZOOM)) document.body.style.setProperty(z.cssVar, zoomValue(z) + 'px')
}

function resizeSection(section, step) {
  const z = ZOOM[section]
  const index = z.steps.findIndex(s => s >= zoomValue(z))
  const from = index < 0 ? z.steps.length - 1 : index
  localStorage[z.key] = step === 0 ? z.fallback : z.steps[Math.max(0, Math.min(z.steps.length - 1, from + step))]
  applySizes()
}

/* ========== startup ========== */

// Runs after every extension script has registered itself.
document.addEventListener('DOMContentLoaded', async () => {
  translateStaticText()
  applyTheme()
  bindEvents()
  const init = await call('init')
  Object.assign(state, { places: init.places, drives: init.drives, supportsGlass: init.supportsGlass })
  applyTheme()
  pins ??= init.places
  renderControls()
  applySizes()

  const saved = store.get('tabs', []).filter(tab => tab?.cwd)
  const existing = (await call('items', saved.map(tab => tab.cwd))) || []
  tabs = saved.filter(tab => existing.some(i => samePath(i.path, tab.cwd)))
  tabIndex = Math.max(0, Math.min(store.get('tabIndex', 0), tabs.length - 1))
  if (init.start) {
    tabs.push({ cwd: init.start, focus: null })
    tabIndex = tabs.length - 1
  }
  if (!tabs.length) tabs = [{ cwd: init.places.find(p => p.kind === 'downloads').path, focus: null }]
  showTab()
})
