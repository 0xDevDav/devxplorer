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
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  minus: '<path d="M5 12h14"/>',
  fitWidth: '<path d="M4 6v12M20 6v12M8 12h8M10.5 9.5 8 12l2.5 2.5M13.5 9.5 16 12l-2.5 2.5"/>',
  viewIcons: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  viewList: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" stroke-width="2.6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  sort: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>',
  group: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/>',
  appearance: '<circle cx="12" cy="12" r="8"/><path fill="currentColor" stroke="none" d="M12 4a8 8 0 0 1 0 16z"/>',
  extensions: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13.5v6M13.5 16.5h6"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M8 14h8"/>',
  library: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  gear: '<path d="M19.23 10.41L21.53 10.87L21.53 13.13L19.23 13.59L18.23 15.99L19.54 17.94L17.94 19.54L15.99 18.23L13.59 19.23L13.13 21.53L10.87 21.53L10.41 19.23L8.01 18.23L6.06 19.54L4.46 17.94L5.77 15.99L4.77 13.59L2.47 13.13L2.47 10.87L4.77 10.41L5.77 8.01L4.46 6.06L6.06 4.46L8.01 5.77L10.41 4.77L10.87 2.47L13.13 2.47L13.59 4.77L15.99 5.77L17.94 4.46L19.54 6.06L18.23 8.01Z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path fill="currentColor" stroke="none" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>',
  pause: '<rect fill="currentColor" stroke="none" x="6.5" y="5" width="4" height="14" rx="1.2"/><rect fill="currentColor" stroke="none" x="13.5" y="5" width="4" height="14" rx="1.2"/>',
  speaker: '<path fill="currentColor" stroke="none" d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  speakerOff: '<path fill="currentColor" stroke="none" d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
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
const AUDIO_EXT = /^(mp3|wav|flac|m4a|aac|ogg|opus)$/
const ARCHIVE_EXT = /^(zip|rar|7z|tar|gz|bz2|xz)$/
const PROGRAM_EXT = /^(exe|msi|bat|cmd|ps1|lnk|url|appx|msix)$/
const DOC_KINDS = [
  ['pdf', /^pdf$/],
  ['word', /^(docx?|odt|rtf|pages)$/],
  ['sheet', /^(xlsx?|ods|numbers)$/],
  ['slides', /^(pptx?|odp|key)$/],
  ['archive', ARCHIVE_EXT],
  ['audio', AUDIO_EXT],
  ['app', PROGRAM_EXT],
]

const docKind = name => DOC_KINDS.find(([, test]) => test.test(extensionOf(name)))?.[0] || 'other'
const SHORTCUT_EXT = /\.(lnk|url)$/i

function docIcon(name, cls = '') {
  const ext = extensionOf(name)
  const kind = docKind(name)
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
  reverse: localStorage.reverse === 'true',
  showHidden: localStorage.showHidden === 'true',
  searchDeep: localStorage.searchDeep === 'true', // search also in subfolders
  view: localStorage.view || 'icons', // 'icons' or 'list'
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
// History (back/forward) belongs to the session; only each tab's folder is remembered.
const saveTabs = () => { store.set('tabs', tabs.map(({ cwd, focus }) => ({ cwd, focus }))); store.set('tabIndex', tabIndex) }

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
  const data = (await call('list', dir, state.showHidden)) || { folders: [], files: [] }
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

/*
 * kind "error" (the default, used for failures reported by the main process) opens an alert sheet
 * that stays until dismissed, as on macOS; "info" is a brief confirmation at the bottom.
 */
function toast(message, kind = 'error') {
  if (kind === 'error') return showAlert(message)
  const box = $('#toast')
  box.textContent = message
  box.className = kind
  box.hidden = false
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => { box.hidden = true }, 4000)
}

function showAlert(message) {
  const sheet = $('#alert')
  $('#alertText').textContent = message
  if (!sheet.open) sheet.showModal()
}

// Sort orders; ties fall back to the name. Folders have no size, so they stay by name under "size".
const SORTS = {
  name: byName,
  date: (a, b) => fileDate(b) - fileDate(a) || byName(a, b),
  size: (a, b) => (b.size || 0) - (a.size || 0) || byName(a, b),
  kind: (a, b) => collator.compare(extensionOf(a.name), extensionOf(b.name)) || byName(a, b),
}
const sorted = items => {
  const compare = SORTS[state.sort] || byName
  return items.sort(state.reverse ? (a, b) => compare(b, a) : compare)
}
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
  // the label is repeated in the tooltip because narrow windows show only the dot
  b.title = [b.textContent, count != null && t.n('count.items', count)].filter(Boolean).join(' · ')
  b.onclick = onclick
  return b
}

const extensionApi = {
  t, // translator; extension strings live in messages.js under ext.<id>.*
  el,
  chip,
  compare: collator.compare,
  ask,
  setMeta,
  render,
  // Only the badges change, so a playing video or a loaded model is left alone.
  refreshViewer: () => {
    if (viewerOpen()) $('#viewer .viewer-bar .badges')?.replaceWith(badges(viewer.items[viewer.index].path))
  },
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
  call('shellIntegration').then(on => { $('#shellToggle').checked = !!on })
  $('#extList').replaceChildren(...extensions.map(x => {
    const row = el('label', 'set-row')
    const toggle = Object.assign(el('input'), { type: 'checkbox', checked: activeExtensions().includes(x) })
    const text = el('div')
    text.append(el('span', '', x.name), el('p', 'hint', x.description))
    toggle.onchange = () => {
      enabledExtensions[x.id] = toggle.checked
      store.set('ext', enabledExtensions)
      x.filter?.reset()
      render()
    }
    row.append(text, toggle, el('span', 'switch'))
    return row
  }))
  renderShortcuts()
  showSettingsPane(settingsPane)
  $('#settings').showModal()
}

/*
 * Keyboard shortcuts listed in Settings. Alternatives are separated by "|", keys of a combination
 * by "+"; names starting with "key." are translated.
 */
const SHORTCUTS = [
  ['keys.group.navigation', [
    ['Ctrl+K', 'keys.palette'],
    ['Ctrl+L', 'keys.path'],
    ['↑|↓', 'keys.folders'],
    ['→|key.enter', 'keys.open'],
    ['←|Alt+↑', 'keys.up'],
    ['Alt+←|key.backspace', 'keys.back'],
    ['Alt+→', 'keys.forward'],
    ['A–Z', 'keys.typeSelect'],
  ]],
  ['keys.group.tabs', [
    ['Ctrl+T', 'keys.newTab'],
    ['Ctrl+W', 'keys.closeTab'],
    ['Ctrl+Tab|Ctrl+Shift+Tab', 'keys.switchTab'],
  ]],
  ['keys.group.files', [
    ['key.space', 'keys.preview'],
    ['key.enter', 'menu.open'],
    ['F2', 'keys.rename'],
    ['key.delete', 'menu.trash'],
    ['Ctrl+C', 'menu.copy'],
    ['Ctrl+X', 'menu.cut'],
    ['Ctrl+V', 'menu.paste'],
    ['Ctrl+D', 'menu.duplicate'],
    ['Ctrl+Shift+C', 'menu.copyPath'],
    ['Ctrl+I', 'menu.info'],
    ['Alt+key.drag', 'keys.reorder'],
    ['Ctrl+Z', 'keys.undo'],
    ['Ctrl+A', 'keys.selectAll'],
    ['Esc', 'keys.deselect'],
  ]],
  ['keys.group.view', [
    ['Ctrl++|Ctrl+-|Ctrl+key.wheel', 'keys.zoom'],
    ['Ctrl+0', 'keys.zoomReset'],
    ['Ctrl+1|Ctrl+2', 'keys.view'],
    ['Ctrl+Shift+.', 'menu.showHidden'],
  ]],
  ['keys.group.viewer', [
    ['←|→', 'keys.browse'],
    ['+|-|key.wheel', 'keys.zoomImage'],
    ['I', 'keys.info'],
    ['B', 'keys.matte'],
    ['key.enter', 'keys.openInProgram'],
    ['key.space|Esc', 'keys.close'],
  ]],
]

function keysNode(spec) {
  const node = el('div', 'keys')
  spec.split('|').forEach((combo, i) => {
    if (i) node.append('/')
    // "+" splits keys unless it is the key itself, as in Ctrl++
    for (const key of combo.split(/\+(?=.)/)) node.append(el('kbd', 'keycap', key.startsWith('key.') ? t(key) : key))
  })
  return node
}

function renderShortcuts() {
  const groups = [
    ...SHORTCUTS.map(([title, rows]) => [t(title), rows.map(([keys, label]) => [keys, t(label)])]),
    ...activeExtensions().filter(x => x.shortcuts).map(x => [x.name, x.shortcuts]),
  ]
  $('#shortcutList').replaceChildren(...groups.flatMap(([title, rows]) => {
    const group = el('div', 'set-group')
    group.append(...rows.map(([keys, label]) => {
      const row = el('div', 'set-row')
      row.append(el('span', '', label), keysNode(keys))
      return row
    }))
    return [el('p', 'set-label', title), group]
  }))
}

let settingsPane = 'general'
function showSettingsPane(name) {
  settingsPane = name
  for (const node of $$('#settings [data-pane]')) node.classList.toggle('on', node.dataset.pane === name)
}

async function exportLibrary() {
  const count = await call('exportLibrary')
  if (count != null) toast(t('data.exported', { n: count }), 'info')
}

async function importLibrary() {
  const count = await call('importLibrary')
  if (count == null) return
  toast(t('data.imported', { n: count }), 'info')
  refresh()
}

/* ========== previews ========== */

// Images and videos use shell thumbnails, programs and shortcuts their own icon; other files show
// their text or a document icon.
async function loadPreview(path, type) {
  if (type !== 'file') return { img: await call('thumb', path) }
  if (docKind(baseName(path)) === 'app') return { icon: await call('appIcon', path) }
  if (MESH_EXT.test(path)) return { img: await meshThumbnail(path) }
  const text = await call('readText', path)
  return text != null ? { text } : {}
}

// Loaded previews, keyed by path and modification time. Bounded (oldest dropped first); a
// thumbnail that came back empty is not kept, so a transient shell failure is retried next time.
const PREVIEW_CACHE_LIMIT = 3000
const previews = new Map()
const previewObserver = new IntersectionObserver(entries => entries.forEach(async entry => {
  if (!entry.isIntersecting) return
  previewObserver.unobserve(entry.target)
  const img = entry.target
  const key = img.dataset.src + '|' + img.dataset.mtime
  // Only the first appearance fades in; re-renders show cached previews immediately.
  const instant = previews.has(key)
  if (!instant) {
    if (previews.size >= PREVIEW_CACHE_LIMIT) previews.delete(previews.keys().next().value)
    previews.set(key, loadPreview(img.dataset.src, img.dataset.type))
  }
  const preview = await previews.get(key)
  if (img.dataset.type !== 'file' && !preview.img) previews.delete(key)
  let node = img
  if (preview.icon) img.replaceWith(node = appIcon(img.dataset.src, preview.icon))
  else if (preview.text != null) img.replaceWith(node = el('div', 'paper', preview.text.slice(0, 600)))
  else if (preview.img) img.src = preview.img
  else img.replaceWith(node = docIcon(baseName(img.dataset.src)))
  if (instant) node.classList.add('instant')
}))

// Shortcuts carry the arrow badge Windows draws on them.
function appIcon(path, src) {
  const node = el('div', 'app-icon' + (SHORTCUT_EXT.test(path) ? ' shortcut' : ''))
  const glyph = el('span', 'glyph')
  const img = Object.assign(el('img'), { src, draggable: false })
  // Shell icons come at 32 or 48px; they stay at their size instead of being blown up.
  img.onload = () => glyph.classList.toggle('native', img.naturalWidth <= 48)
  glyph.append(img)
  node.append(glyph)
  return node
}

function previewImg(item) {
  const img = el('img')
  img.alt = ''  // the item is named by its card
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
/*
 * Folder previews (collage and item count) are filled when they scroll into view. A listing is
 * reused while the folder's modification time is unchanged, which Windows moves whenever entries
 * are added, removed or renamed; the open folder itself has no known time and is always listed.
 */
const FOLDER_CACHE_LIMIT = 1000
const folderListings = new Map()

function folderListing(folder) {
  if (folder.mtime == null) return list(folder.path)
  const key = `${folder.path}|${folder.mtime}|${needsPhotoDates()}|${state.showHidden}`
  if (!folderListings.has(key)) {
    if (folderListings.size >= FOLDER_CACHE_LIMIT) folderListings.delete(folderListings.keys().next().value)
    folderListings.set(key, list(folder.path))
  }
  return folderListings.get(key)
}

const folderObserver = new IntersectionObserver(entries => entries.forEach(entry => {
  if (!entry.isIntersecting) return
  folderObserver.unobserve(entry.target)
  entry.target.fill()
}), { rootMargin: '300px' })

function fillFolderPreview(folder, collage, countEl, filesOnly = false) {
  collage.fill = async () => {
    const data = await folderListing(folder)
    countEl.textContent = filesOnly ? t.n('count.files', data.files.length) : countLabel(data)
    const files = sorted(data.files).slice(0, 4)
    if (files.length) collage.append(...files.map(previewImg))
    else collage.replaceChildren(icon('folderFill', 'finder-folder'))
  }
  folderObserver.observe(collage)
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
      count ? grid(folders, files, null) : emptyState('search', t('filter.none')),
    ])
  } else if (state.query && state.searchDeep) {
    $('#folders').hidden = true
    showContent(null, [searchScope(), emptyState('search', t('search.searching'))])
    const result = await call('search', state.cwd, state.query, state.showHidden)
    if (id !== renderId || !result) return
    const items = remember(result.items)
    if (needsPhotoDates()) await attachPhotoDates(items.filter(i => !i.isDir))
    if (id !== renderId) return
    const folders = sorted(items.filter(i => i.isDir))
    const files = sorted(items.filter(i => !i.isDir))
    const params = { items: t.n('count.items', items.length), folder: baseName(state.cwd) }
    showContent(null, [
      searchScope(),
      el('p', 'hint', t(result.truncated ? 'search.truncated' : 'search.results', params)),
      items.length ? grid(folders, files, null) : emptyState('search', t('filter.none')),
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
  const row = el('div', 'frow' + (samePath(entry.path, state.focus) ? ' focus' : '') + (!entry.self && dimmed(entry.path) ? ' dim' : '') + (entry.hidden ? ' hidden-item' : ''))
  row.entry = entry
  const collage = el('div', 'collage')
  const count = el('div', 'fcount')
  const info = el('div', 'finfo')
  info.append(el('div', 'fname', entry.name), count)
  if (!entry.self) info.append(badges(entry.path))
  row.append(collage, info)
  fillFolderPreview(entry, collage, count, entry.self)

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
    ...(state.query ? [searchScope()] : []),
    head,
    folders.length || files.length ? grid(folders, files, entry.path)
      : data.denied ? emptyState('lock', t('folder.denied'), t('folder.deniedHint'))
      : emptyState('folderFill', t('folder.empty')),
  ])
  paintSelection()
}

// While searching, chooses between this folder only and this folder with all its subfolders.
function searchScope() {
  const bar = el('div', 'segmented search-scope')
  for (const [deep, label] of [[false, t('search.here', { folder: baseName(state.cwd) })], [true, t('search.deep')]]) {
    const b = el('button', state.searchDeep === deep ? 'on' : '', label)
    b.onclick = () => { state.searchDeep = deep; localStorage.searchDeep = deep; render() }
    bar.append(b)
  }
  return bar
}

// A centred icon with a title and an optional explanation, for folders with nothing to show.
function emptyState(iconName, title, hint) {
  const node = el('div', 'empty')
  node.append(icon(iconName), el('p', 'empty-title', title))
  if (hint) node.append(el('p', 'hint', hint))
  return node
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
  ['kind.audio', f => AUDIO_EXT.test(extensionOf(f.name))],
  ['kind.archives', f => ARCHIVE_EXT.test(extensionOf(f.name))],
  ['kind.programs', f => PROGRAM_EXT.test(extensionOf(f.name))],
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
    itemIndex = null
  }
  apply()
  return [head, body]
}

function grid(folders, files, dir) {
  const groups = groupFiles(files)
  const displayOrder = groups.flatMap(g => g.files) // viewer navigation follows what is on screen
  const asList = state.view === 'list'
  const block = (items, folderItems = []) => {
    const node = el('div', asList ? 'list' : 'grid')
    node.setAttribute('role', 'listbox')
    node.setAttribute('aria-multiselectable', 'true')
    folderItems.forEach(f => node.append(asList ? folderListRow(f) : folderTile(f)))
    items.forEach(f => node.append(asList ? fileListRow(f, displayOrder) : fileCard(f, displayOrder)))
    if (dir) dropTarget(node, dir)
    return node
  }
  if (asList) {
    const view = el('div', 'list-view')
    view.append(listHeader(), groups[0]?.label ? groupedBlocks(groups, folders, block) : block(files, folders))
    return view
  }
  if (!groups[0]?.label) return block(files, folders)
  return groupedBlocks(groups, folders, block)
}

function groupedBlocks(groups, folders, block) {
  const root = el('div', 'groups')
  if (folders.length) root.append(...groupSection(t('group.folders'), folders.length, block([], folders)))
  for (const g of groups) root.append(...groupSection(g.label, g.files.length, block(g.files)))
  return root
}

/* ---------- list view ---------- */

// Columns of the list view; clicking a title sorts by it, clicking it again reverses the order.
const LIST_COLUMNS = [['name', 'sort.name'], ['date', 'list.modified'], ['size', 'sort.size'], ['kind', 'sort.kind']]

function listHeader() {
  const head = el('div', 'list-head')
  for (const [sort, label] of LIST_COLUMNS) {
    const b = el('button', 'col-' + sort + (state.sort === sort ? ' on' : ''), t(label))
    if (state.sort === sort) b.append(icon('chevronDown', state.reverse ? 'up' : ''))
    b.onclick = () => {
      if (state.sort === sort) { state.reverse = !state.reverse; localStorage.reverse = state.reverse }
      setSort(sort)
    }
    head.append(b)
  }
  return head
}

const listDate = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' })

function listCells(item, iconNode, name, kind, size) {
  const nameCell = el('span', 'col-name')
  nameCell.append(iconNode, el('span', 'name', name), badges(item.path))
  return [nameCell, el('span', 'col-date', listDate.format(item.mtime)), el('span', 'col-size', size), el('span', 'col-kind', kind)]
}

function folderListRow(folder) {
  const row = el('div', 'item folder lrow' + (dimmed(folder.path) ? ' dim' : '') + (folder.hidden ? ' hidden-item' : ''))
  row.append(...listCells(folder, icon('folderFill', 'row-icon finder-folder'), folder.name, t('info.folder'), '—'))
  row.title = folder.path
  selectable(row, folder.path, true)
  row.addEventListener('dblclick', () => navigate(folder.path))
  dropTarget(row, folder.path)
  return row
}

// Pictures, videos, programs and models show a small preview; other files their document icon.
function fileListRow(file, siblings) {
  const row = el('div', 'item lrow' + (dimmed(file.path) ? ' dim' : '') + (file.hidden ? ' hidden-item' : ''))
  const ext = extensionOf(file.name)
  const visual = file.type !== 'file' || docKind(file.name) === 'app' || MESH_EXT.test(file.name)
  const iconNode = el('span', 'row-icon')
  iconNode.append(visual ? previewImg(file) : icon('documents'))
  row.append(...listCells(file, iconNode, file.name, ext ? t('info.kindFile', { ext: ext.toUpperCase() }) : '—', formatBytes(file.size)))
  row.title = file.path
  selectable(row, file.path, false)
  const isMedia = f => f.type === 'img' || f.type === 'video'
  row.preview = () => openViewer(siblings, file)
  row.open = () => isMedia(file) ? openViewer(siblings.filter(isMedia), file) : call('open', file.path)
  row.addEventListener('dblclick', row.open)
  return row
}

function setView(view) {
  state.view = localStorage.view = view
  renderControls()
  render()
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
  const tile = el('div', 'item folder' + (dimmed(folder.path) ? ' dim' : '') + (folder.hidden ? ' hidden-item' : ''))
  const thumb = el('div', 'thumb')
  const collage = el('div', 'collage')
  const count = el('div', 'fcount')
  thumb.append(collage, badges(folder.path))
  tile.append(thumb, el('div', 'name', folder.name), count)
  tile.title = folder.path
  fillFolderPreview(folder, collage, count)
  selectable(tile, folder.path, true)
  tile.addEventListener('dblclick', () => navigate(folder.path))
  dropTarget(tile, folder.path)
  return tile
}

/*
 * Resting the pointer on a video or GIF plays it inside its card, muted and looping, without
 * opening anything. Any movement restarts the wait, so sweeping across the grid starts nothing;
 * leaving the card stops playback and releases the decoder.
 */
const HOVER_PLAY_MS = 500
const ANIMATED = file => file.type === 'video' || /\.gif$/i.test(file.name)

function hoverPlay(card, thumb, file) {
  if (!ANIMATED(file)) return
  let timer = null
  let live = null

  const start = () => {
    // handlers keep their own reference: events can still arrive after stop() cleared `live`
    if (file.type === 'video') {
      const video = Object.assign(el('video', 'live'), { src: fileUrl(file.path), muted: true, loop: true, autoplay: true, playsInline: true })
      const bar = el('div', 'live-progress')
      video.addEventListener('timeupdate', () => { bar.style.width = (video.currentTime / video.duration) * 100 + '%' })
      video.addEventListener('playing', () => { video.classList.add('show'); if (live === video) thumb.append(bar) }, { once: true })
      video.addEventListener('error', () => { if (live === video) stop() }, { once: true }) // undecodable codecs keep the still frame
      video.bar = bar
      live = video
    } else {
      const image = Object.assign(el('img', 'live'), { src: fileUrl(file.path) })
      image.addEventListener('load', () => image.classList.add('show'), { once: true })
      live = image
    }
    thumb.append(live)
  }

  function stop() {
    clearTimeout(timer)
    if (!live) return
    live.bar?.remove()
    if (live.tagName === 'VIDEO') { live.pause(); live.removeAttribute('src'); live.load() }
    live.remove()
    live = null
  }

  const wait = () => {
    if (live) return
    clearTimeout(timer)
    timer = setTimeout(start, HOVER_PLAY_MS)
  }
  card.addEventListener('mouseenter', wait)
  card.addEventListener('mousemove', wait)
  card.addEventListener('mouseleave', stop)
}

// Card names leave out the extension, which is shown as a label on the preview instead.
function displayName(name) {
  const ext = extensionOf(name)
  return ext && name.length > ext.length + 1 ? name.slice(0, -ext.length - 1) : name
}

function fileCard(file, siblings) {
  const card = el('div', 'item' + (dimmed(file.path) ? ' dim' : '') + (file.hidden ? ' hidden-item' : ''))
  const thumb = el('div', 'thumb')
  thumb.append(previewImg(file), badges(file.path))
  if (file.type === 'video') thumb.append(icon('play', 'play'))
  const name = displayName(file.name)
  if (name !== file.name) thumb.append(el('span', 'ext', extensionOf(file.name)))
  card.append(thumb, el('div', 'name', name))
  card.title = file.path
  selectable(card, file.path, false)
  hoverPlay(card, thumb, file)
  // Double click opens photos and videos in the viewer and every other file in its default program;
  // Space previews any file (see preview below).
  const isMedia = f => f.type === 'img' || f.type === 'video'
  card.preview = () => openViewer(siblings, file)
  card.open = () => isMedia(file) ? openViewer(siblings.filter(isMedia), file) : call('open', file.path)
  card.addEventListener('dblclick', card.open)

  // Dropping files from another folder moves them here. Holding Alt reorders within the folder:
  // the files are inserted before or after this card, by the pointer's half, and renumbered.
  const after = e => { const r = card.getBoundingClientRect(); return e.clientX > r.left + r.width / 2 }
  card.addEventListener('dragover', e => {
    e.preventDefault()
    e.stopPropagation()
    card.classList.toggle('ins-after', e.altKey && after(e))
    card.classList.toggle('ins-before', e.altKey && !after(e))
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
    if (!paths.every(p => samePath(parentDir(p), dir))) await moveItems(paths, dir)
    else if (e.altKey) await reorder(dir, paths, file.path, insertAfter)
    else return
    refresh()
  })
  return card
}

/* ========== selection ========== */

const isShown = node => !node.closest('.group-body.collapsed')

/*
 * Index of the rendered items, so selection and the status bar do not rescan thousands of nodes on
 * every click. It is rebuilt on first use after the DOM changed: any node added or removed under
 * #main, or a group collapsed or expanded.
 */
let itemIndex = null
// Previews swapping their image inside a card do not count, only items coming or going.
const touchesItems = records => records.some(r => [...r.addedNodes, ...r.removedNodes]
  .some(n => n.nodeType === 1 && (n.matches('[data-path]') || n.querySelector('[data-path]'))))
const itemChanges = new MutationObserver(records => { if (touchesItems(records)) itemIndex = null })
itemChanges.observe($('#main'), { childList: true, subtree: true })

function renderedItems() {
  if (touchesItems(itemChanges.takeRecords())) itemIndex = null
  if (!itemIndex) {
    const nodes = $$('#main [data-path]').filter(isShown)
    const byPath = new Map()
    for (const node of nodes) byPath.set(node.dataset.path, [...(byPath.get(node.dataset.path) || []), node])
    itemIndex = { byPath, paths: [...new Set(nodes.map(n => n.dataset.path))], content: nodes.filter(n => n.parentElement.closest('#content')) }
  }
  return itemIndex
}

const visiblePaths = () => renderedItems().paths
const selectedInOrder = () => visiblePaths().filter(p => state.selection.has(p))

function selectable(node, path, isFolder) {
  node.dataset.path = path
  node.setAttribute('role', 'option')
  node.setAttribute('aria-label', baseName(path))
  node.setAttribute('aria-selected', 'false')
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
  // A range needs its anchor on screen; otherwise (another folder, filtered out) it is a plain click.
  if (e.shiftKey && visiblePaths().includes(state.anchor)) {
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

// Only nodes whose state changes are touched: those painted last time and those to paint now.
function paintSelection() {
  const { byPath } = renderedItems()
  const cut = clipboard?.cut ? clipboard.paths : []
  for (const node of $$('#main .sel, #main .cut')) {
    node.classList.remove('sel', 'cut')
    node.setAttribute('aria-selected', 'false')
  }
  for (const p of state.selection) byPath.get(p)?.forEach(node => { node.classList.add('sel'); node.setAttribute('aria-selected', 'true') })
  for (const p of cut) byPath.get(p)?.forEach(node => node.classList.add('cut'))
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
  const parts = [t.n('count.items', renderedItems().content.length)]
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

// Switching drives quickly must not let a slower, older answer win.
let diskSpaceToken = 0
async function renderDiskSpace() {
  const token = ++diskSpaceToken
  const space = await call('diskSpace', state.cwd)
  if (token !== diskSpaceToken) return
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
    if (paths.length) { await moveItems(paths, dir); refresh() }
  })
}

/* ========== undoable operations ========== */

// Every change to files goes through these helpers, which record how to revert it for Ctrl+Z.
// A revert resolves to a truthy value when it fully succeeded.
const undoStack = []
const UNDO_LIMIT = 50

function pushUndo(action, revert) {
  undoStack.push({ action, revert })
  if (undoStack.length > UNDO_LIMIT) undoStack.shift()
}

async function undo() {
  const op = undoStack.pop()
  if (!op) return toast(t('undo.nothing'), 'info')
  if (await op.revert()) toast(t('undo.done', { action: t(op.action) }), 'info')
  refresh()
}

/*
 * File batches resolve to { done, error }: when an item fails halfway, the error is shown and
 * the items already processed can still be undone. Returns the processed items.
 */
async function runBatch(name, ...args) {
  const result = await call(name, ...args)
  if (result?.error) toast(result.error)
  return result?.done || []
}
const batchSucceeded = async promise => { const r = await promise; return !!r && !r.error }

async function moveItems(paths, dir) {
  const moved = await runBatch('move', paths, dir)
  if (moved.length) pushUndo('action.move', () => batchSucceeded(call('moveTo', moved.map(([from, to]) => [to, from]))))
  return moved
}

async function copyItems(paths, dir) {
  const copied = await runBatch('copy', paths, dir)
  if (copied.length) pushUndo('action.copy', () => batchSucceeded(call('trash', copied.map(([, to]) => to))))
  return copied
}

// pairs: [[path, newName]], all within their own folders
async function renameItems(pairs) {
  if (!(await call('renameMany', pairs))) return
  pushUndo('action.rename', () => call('renameMany', pairs.map(([p, name]) => [joinPath(parentDir(p), name), baseName(p)])))
}

async function trashItems(paths) {
  const trashed = await runBatch('trash', paths)
  if (trashed.length) pushUndo('action.trash', async () => (await call('restore', trashed))?.length)
}

/* ========== clipboard (within the app) ========== */

let clipboard = null // { paths, cut }

function copySelection(cut) {
  const paths = selectedInOrder()
  if (!paths.length) return
  clipboard = { paths, cut }
  paintSelection()
}

async function paste() {
  if (!clipboard) return
  const dest = $('#content').dataset.path || state.cwd
  if (clipboard.cut) {
    await moveItems(clipboard.paths, dest)
    clipboard = null
  } else {
    await copyItems(clipboard.paths, dest)
  }
  refresh()
}

async function duplicateSelection() {
  const byFolder = new Map()
  for (const p of selectedInOrder()) {
    const dir = parentDir(p)
    if (!byFolder.has(dir)) byFolder.set(dir, [])
    byFolder.get(dir).push(p)
  }
  for (const [dir, paths] of byFolder) await copyItems(paths, dir)
  refresh()
}

/*
 * Ordering is persisted in the file names ("01_name.jpg") so it survives outside the app.
 * label replaces the original stem; without it an existing numeric prefix is swapped.
 */
const counter = (i, total) => String(i + 1).padStart(Math.max(2, String(total).length), '0')
function renumber(paths, label) {
  return renameItems(paths.map((p, i) => {
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
      await renameItems([[paths[0], name.trim()]])
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
  await trashItems(selectedInOrder())
  state.selection.clear()
  refresh()
}

async function setMeta(paths, op) {
  await call('setMeta', paths, op)
  await render()
}

async function newFolder() {
  const name = await ask(t('folder.newPrompt'), t('folder.newDefault'))
  if (!name) return
  const created = await call('mkdir', state.cwd, name.trim())
  if (created) pushUndo('action.newFolder', () => batchSucceeded(call('trash', [created])))
  refresh()
}

const isPinned = p => pins.some(x => samePath(x.path, p))
function togglePin(p) {
  pins = isPinned(p) ? pins.filter(x => !samePath(x.path, p)) : [...pins, { name: baseName(p), path: p }]
  store.set('pins', pins)
  renderPlaces()
}

/* ========== context menu ========== */

// Opens a menu under an element, like a pop-up button.
function menuBelow(node, items, gap = 6) {
  const r = node.getBoundingClientRect()
  showMenu({ preventDefault() {}, clientX: r.left, clientY: r.bottom + gap }, items)
}

function showMenu(e, items) {
  e.preventDefault()
  const menu = $('#menu')
  menu.replaceChildren()
  for (const item of items.filter(Boolean)) {
    if (item === '-') {
      if (menu.lastChild && menu.lastChild.tagName !== 'HR') menu.append(el('hr'))
      continue
    }
    const b = el('button')
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

const RUNNABLE_EXT = /^(exe|msi|bat|cmd|lnk)$/
let hasVsCode = false

// Copies full paths, one per line, as Windows "Copy as path" without the quotes.
function copyPaths(paths) {
  if (!paths.length) return
  call('copyText', paths.join('\r\n'))
  toast(t.n('toast.pathCopied', paths.length), 'info')
}

// Runs a main-process action that creates a file next to the selection, then shows it.
async function createNear(action, ...args) {
  const created = await call(action, ...args)
  if (!created) return
  await refresh()
  state.selection = new Set([created])
  paintSelection()
}

// Terminal and VS Code open a folder itself, or the folder that contains a file.
const folderOf = (path, isFolder) => isFolder ? path : parentDir(path)

function itemMenu(e) {
  const paths = selectedInOrder()
  const single = paths.length === 1 ? paths[0] : null
  const isFolder = single && $$('#main [data-folder].sel').length > 0
  const ext = single && !isFolder ? extensionOf(baseName(single)) : ''
  const metas = paths.map(p => state.meta[p] || {})
  showMenu(e, [
    single && { label: t('menu.open'), run: () => isFolder ? navigate(single) : call('open', single) },
    isFolder && { label: t('menu.openNewTab'), run: () => newTab(single) },
    single && !isFolder && { label: t('menu.openWith'), run: () => call('openWith', single) },
    RUNNABLE_EXT.test(ext) && { label: t('menu.runAsAdmin'), run: () => call('runAsAdmin', single) },
    '-',
    single && { label: t('menu.terminal'), run: () => call('openTerminal', folderOf(single, isFolder)) },
    hasVsCode && { label: t('menu.vscode'), run: () => call('openInVsCode', paths) },
    { label: t('menu.info'), key: 'Ctrl+I', run: () => showItemInfo(paths) },
    single && { label: t('menu.reveal'), run: () => call('reveal', single) },
    isFolder && { label: isPinned(single) ? t('menu.unpin') : t('menu.pin'), run: () => togglePin(single) },
    '-',
    { label: single ? t('menu.rename') : t('menu.number', { n: paths.length }), key: 'F2', run: renameSelection },
    { label: t('menu.copy'), key: 'Ctrl+C', run: () => copySelection(false) },
    { label: t('menu.cut'), key: 'Ctrl+X', run: () => copySelection(true) },
    { label: t('menu.duplicate'), key: 'Ctrl+D', run: duplicateSelection },
    { label: t('menu.copyPath'), key: 'Ctrl+Shift+C', run: () => copyPaths(paths) },
    '-',
    single && { label: t('menu.shortcut'), run: () => createNear('createShortcut', single) },
    { label: t('menu.compress'), run: () => createNear('compress', paths) },
    ext === 'zip' && { label: t('menu.extract'), run: () => createNear('extract', single) },
    ...activeExtensions().flatMap(x => x.menu ? ['-', ...x.menu(paths, metas)] : []),
    '-',
    { label: t('menu.trash'), key: t('key.delete'), run: trashSelection },
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
  // With the glass material the controls stay transparent over the black viewer: Windows cannot
  // switch an overlay from an opaque color back to transparent.
  call('overlay', { color: glassOn() ? '#00000000' : '#000000', symbolColor: '#c9c9d4' })
  call('setViewerOpen', true)
  showViewer()
}

function closeViewer() {
  const box = $('#viewer')
  box.classList.remove('show')
  call('setViewerOpen', false)
  box.querySelector('video, audio')?.pause()
  viewerItemAbort?.abort()
  disposeMeshView()
  syncWindowControls()
  // Content is dropped only after the fade-out, unless the viewer was reopened meanwhile.
  setTimeout(() => { if (!viewerOpen()) box.replaceChildren() }, FADE_MS)
}

/* 3D models: loaded through the main process, shown with the WebGL viewer and their size. */
let activeMeshView = null

function disposeMeshView() {
  activeMeshView?.dispose()
  activeMeshView = null
}

async function openMeshPreview(container, file, isCurrent) {
  const status = el('div', 'mesh-status', t('mesh.loading'))
  container.append(status)
  try {
    const bytes = await call('readBinary', file.path, MESH_VIEW_LIMIT)
    if (!isCurrent()) return
    if (!bytes) return void (status.textContent = t('mesh.tooLarge'))
    const prepared = await loadMeshInWorker(file.name, bytes)
    if (!isCurrent()) return
    // e.g. a compiler ".obj" object file: not a model, so show the generic file view instead
    if (!prepared) return container.replaceWith(otherView(file))
    status.remove()
    disposeMeshView()
    activeMeshView = createMeshView(container, prepared)
    const { triangles, size, units } = activeMeshView.prepared
    const dimensions = size.map(v => sizeFormat.format(v)).join(' × ') + (units ? ' ' + units : '')
    container.append(el('div', 'mesh-caption', t('mesh.stats', { triangles: integerFormat.format(triangles), size: dimensions })))
  } catch {
    if (isCurrent()) status.textContent = t('mesh.failed')
  }
}

const integerFormat = new Intl.NumberFormat(language)

// Files without a preview: document icon, name and a button to open them in their program.
function otherView(file) {
  const view = el('div', 'other')
  const open = el('button', 'primary', t('viewer.openWith'))
  open.onclick = () => call('open', file.path)
  view.append(docIcon(file.name, 'large'), el('div', 'name', file.name), open)
  return view
}

// Listeners that live as long as the current viewer item; aborted when it changes or closes.
let viewerItemAbort = null
function viewerSignal() {
  viewerItemAbort?.abort()
  viewerItemAbort = new AbortController()
  return viewerItemAbort.signal
}

function showViewer() {
  disposeMeshView()
  viewerItemAbort?.abort()
  const box = $('#viewer')
  const file = viewer.items[viewer.index]
  const isCurrent = () => viewerOpen() && viewer.items[viewer.index] === file
  let media

  if (file.type === 'video') {
    media = Object.assign(el('video'), { src: fileUrl(file.path), autoplay: true })
  } else if (file.type === 'img') {
    media = el('img')
    // Chromium cannot decode HEIC; the Windows shell renders a full-size image for it.
    if (/\.heic$/i.test(file.path)) call('thumb', file.path, 2560).then(url => { if (url && isCurrent()) media.src = url })
    else media.src = fileUrl(file.path)
  } else if (/\.pdf$/i.test(file.path)) {
    media = el('div', 'pdf-view')
    openPdf(media, file, isCurrent, viewerSignal())
  } else if (MESH_EXT.test(file.name)) {
    media = el('div', 'mesh-view')
    openMeshPreview(media, file, isCurrent)
  } else {
    media = el('div', 'other')
    richPreview(file).then(preview => {
      if (!isCurrent()) return
      if (preview?.bare) return media.replaceWith(preview.node)
      media.replaceWith(preview ? richPreviewFrame(preview) : otherView(file))
    })
  }

  const transparent = TRANSPARENT_IMAGE.test(file.name)
  const zoomable = file.type === 'img' || /\.svg$/i.test(file.name)
  const hints = [
    t('viewer.hint.browse'),
    ...(zoomable ? [t('viewer.hint.zoom')] : []),
    ...(MESH_EXT.test(file.name) ? [t('viewer.hint.orbit')] : []),
    ...(transparent ? [t('viewer.hint.matte')] : []),
    t('viewer.hint.info'),
    ...activeExtensions().map(x => x.viewer?.hint).filter(Boolean),
    t('viewer.hint.open'),
    t('viewer.hint.close'),
  ]
  const bar = el('div', 'viewer-bar')
  bar.append(el('span', 'viewer-title', `${viewer.index + 1} / ${viewer.items.length} · ${file.name}`), badges(file.path), el('span', 'hint', hints.join(' · ')))
  box.replaceChildren(media, bar)
  if (file.type === 'video') box.append(mediaControls(media, { overlay: true, signal: viewerSignal() }))
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
  const details = el('dl')
  panel.append(el('h4', '', file.name), details)
  const row = (key, value) => { if (value) details.append(el('dt', '', t(key)), el('dd', '', value)) }

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

/*
 * "Get Info" sheet for the selection, like the Finder's: a preview, the name, then kind, size,
 * location and dates; photos add their camera details. Several items show their count and total.
 */
async function showItemInfo(paths) {
  if (!paths.length) return
  const items = (await call('items', paths)) || []
  if (!items.length) return
  const sheet = $('#infoSheet')
  const body = $('#infoBody')
  const details = el('dl')
  const row = (key, value) => { if (value) details.append(el('dt', '', t(key)), el('dd', '', value)) }
  const single = items.length === 1 ? items[0] : null
  const head = el('div', 'info-head')
  const title = el('div', 'info-title')

  if (single) {
    const preview = el('div', 'info-preview')
    if (single.isDir) preview.append(icon('folderFill', 'finder-folder'))
    else if (single.type !== 'file') call('thumb', single.path, 256).then(url => { if (url) preview.append(Object.assign(el('img'), { src: url, alt: '' })) })
    else if (docKind(single.name) === 'app') call('appIcon', single.path).then(url => { if (url) preview.append(Object.assign(el('img'), { src: url, alt: '' })) })
    else preview.append(docIcon(single.name))
    title.append(el('h3', '', single.name), el('p', 'hint', single.isDir ? t('info.folder') : t('info.kindFile', { ext: (extensionOf(single.name) || '—').toUpperCase() })))
    head.append(preview, title)
    row('info.where', parentDir(single.path))
    row('info.created', single.created && dateTimeFormat.format(single.created))
    row('info.modified', dateTimeFormat.format(single.mtime))
  } else {
    title.append(el('h3', '', t.n('count.items', items.length)))
    head.append(title)
  }

  // Sizes of folders are computed on demand; the row fills in when ready.
  const sizeValue = el('dd', '', t('status.computing'))
  details.prepend(el('dt', '', t('info.size')), sizeValue)
  const folders = items.filter(i => i.isDir)
  Promise.all(folders.map(f => call('folderSize', f.path))).then(sizes => {
    const total = items.filter(i => !i.isDir).reduce((sum, i) => sum + i.size, 0) + sizes.reduce((a, b) => a + (b || 0), 0)
    sizeValue.textContent = formatBytes(total)
  })
  if (single?.isDir) list(single.path).then(data => {
    details.append(el('dt', '', t('info.contains')), el('dd', '', countLabel(data)))
  })

  if (single?.type === 'img') {
    const photo = (await call('photoInfo', single.path)) || {}
    // Formats without EXIF (PNG, GIF, WebP…) give their size once decoded.
    if (!photo.width && !/\.heic$/i.test(single.name)) {
      const img = Object.assign(new Image(), { src: fileUrl(single.path) })
      await img.decode().catch(() => {})
      Object.assign(photo, { width: img.naturalWidth, height: img.naturalHeight })
    }
    const camera = photo.model && (photo.make && !photo.model.startsWith(photo.make) ? `${photo.make} ${photo.model}` : photo.model)
    row('info.dimensions', photo.width && `${photo.width} × ${photo.height} px`)
    row('info.taken', photo.taken && dateTimeFormat.format(photo.taken))
    row('info.camera', camera)
    row('info.lens', photo.lens)
    row('info.exposure', exposureLabel(photo))
  }

  body.replaceChildren(head, details)
  if (!sheet.open) sheet.showModal()
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
  else if (e.key === '+' || e.key === '=') activePdf ? activePdf.zoomBy(1.2) : zoomBy(1.25)
  else if (e.key === '-') activePdf ? activePdf.zoomBy(1 / 1.2) : zoomBy(0.8)
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
  b.title = `${name}\n${dir}` // the name matters when narrow windows show only the icon
  b.onclick = () => navigate(dir)
  b.onauxclick = e => { if (e.button === 1) newTab(dir) }
  b.oncontextmenu = e => showMenu(e, [
    { label: t('menu.openNewTab'), run: () => newTab(dir) },
    { label: t('menu.openInExplorer'), run: () => call('open', dir) },
    { label: t('menu.terminal'), run: () => call('openTerminal', dir) },
    { label: t('menu.copyPath'), run: () => copyPaths([dir]) },
    { label: isPinned(dir) ? t('menu.unpin') : t('menu.pin'), run: () => togglePin(dir) },
  ])
  dropTarget(b, dir)
  return b
}

// System places (Desktop, Pictures…) are shown with their localized name and icon.
const placeKind = dir => state.places.find(p => samePath(p.path, dir))?.kind || 'folder'
const placeLabel = dir => placeKind(dir) === 'folder' ? baseName(dir) || dir : t('place.' + placeKind(dir))

function renderPlaces() {
  // System places keep their canonical order; folders pinned by the user follow in pin order.
  const rank = pin => {
    const i = state.places.findIndex(p => samePath(p.path, pin.path))
    return i < 0 ? state.places.length : i
  }
  const ordered = [...pins].sort((a, b) => rank(a) - rank(b))
  $('#favs').replaceChildren(...ordered.map(p => placeButton(p.path, placeLabel(p.path), placeKind(p.path))))
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
  if (crumbs.querySelector('.path-input')) return // the user is typing a path
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
  fitCrumbs()
}

/*
 * Editable path: clicking the empty part of the breadcrumb bar or pressing Ctrl+L turns it into a
 * text field. Matching subfolders are suggested below; ↑↓ choose, Tab completes, Enter opens.
 */
const PATH_SUGGESTIONS = 8

function editPath() {
  const crumbs = $('#crumbs')
  if (crumbs.querySelector('.path-input')) return
  const input = el('input', 'path-input')
  input.value = state.cwd
  input.spellcheck = false
  crumbs.replaceChildren(input)
  input.focus()
  input.select()

  let suggestions = []
  let index = -1
  const close = () => {
    $('#menu').hidden = true
    crumbs.replaceChildren()
    renderCrumbs()
  }
  const paint = () => $$('#menu button').forEach((b, i) => b.classList.toggle('active', i === index))
  // A typed path that is not a folder falls back to the first suggestion, so "…\Pro" + Enter works.
  const open = async target => {
    const folder = (await call('resolveFolder', target)) || (index < 0 && suggestions[0]?.path)
    if (!folder) return toast(t('path.notFound', { path: target }))
    close()
    navigate(folder)
  }
  const suggest = async () => {
    const text = input.value
    const cut = text.lastIndexOf('\\')
    suggestions = []
    index = -1
    if (cut >= 0) {
      const prefix = text.slice(cut + 1).toLowerCase()
      const parent = await call('resolveFolder', text.slice(0, cut + 1))
      const data = parent && await call('list', parent)
      if (input.value !== text) return
      suggestions = (data?.folders || []).filter(f => f.name.toLowerCase().startsWith(prefix)).sort(byName).slice(0, PATH_SUGGESTIONS)
    }
    if (!suggestions.length) { $('#menu').hidden = true; return }
    menuBelow(input, suggestions.map(f => ({ label: f.name, run: () => open(f.path) })), 4)
  }

  input.addEventListener('input', suggest)
  input.addEventListener('keydown', e => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key]
    if (step && suggestions.length) {
      e.preventDefault()
      index = (index + step + suggestions.length) % suggestions.length
      paint()
    } else if (e.key === 'Tab' && suggestions.length) {
      e.preventDefault()
      input.value = joinPath((suggestions[index] || suggestions[0]).path, '')
      suggest()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      open(index >= 0 ? suggestions[index].path : input.value.trim())
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  })
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) close() }, 120))
}

/*
 * When the path does not fit, intermediate folders collapse into a "…" button listing them,
 * like the macOS path bar: the drive and the last folders stay visible.
 */
function fitCrumbs() {
  const crumbs = $('#crumbs')
  crumbs.querySelector('.crumb-more')?.nextElementSibling?.remove()
  crumbs.querySelector('.crumb-more')?.remove()
  const buttons = [...crumbs.querySelectorAll('button')]
  buttons.forEach(b => { b.hidden = false; if (b.nextElementSibling) b.nextElementSibling.hidden = false })

  const hidden = []
  for (let i = 1; i < buttons.length - 1 && crumbs.scrollWidth > crumbs.clientWidth; i++) {
    if (!hidden.length) buttons[0].nextElementSibling.after(el('button', 'crumb-more', '…'), icon('chevron', 'sep'))
    buttons[i].hidden = true
    buttons[i].nextElementSibling.hidden = true
    hidden.push(buttons[i])
  }
  if (!hidden.length) return
  const more = crumbs.querySelector('.crumb-more')
  more.title = hidden.map(b => b.textContent).join(' › ')
  more.onclick = () => menuBelow(more, hidden.map(b => ({ label: b.textContent, run: () => b.click() })))
}

/* ========== navigation and tabs ========== */

// Each tab keeps its own back and forward history, like a browser or the Finder.
const HISTORY_LIMIT = 50

function navigate(dir, focus = null) {
  const tab = currentTab()
  if (tab.cwd && !samePath(tab.cwd, dir)) {
    tab.back = [...(tab.back || []), { cwd: tab.cwd, focus: tab.focus }].slice(-HISTORY_LIMIT)
    tab.forward = []
  }
  Object.assign(tab, { cwd: dir, focus })
  saveTabs()
  return showTab()
}

// step: -1 goes back, 1 goes forward.
function goHistory(step) {
  const tab = currentTab()
  const [from, to] = step < 0 ? ['back', 'forward'] : ['forward', 'back']
  const entry = tab[from]?.pop()
  if (!entry) return
  tab[to] = [...(tab[to] || []), { cwd: tab.cwd, focus: tab.focus }]
  Object.assign(tab, entry)
  saveTabs()
  return showTab()
}

function renderHistoryButtons() {
  $('#backBtn').disabled = !currentTab().back?.length
  $('#forwardBtn').disabled = !currentTab().forward?.length
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
  state.anchor = null
  $('#folders').scrollTop = 0
  rememberRecent(tab.cwd)
  renderHistoryButtons()
  call('watch', tab.cwd)
  return refresh()
}

/* ========== quick navigation: "Go to" palette (Ctrl+K) and type-to-select ========== */

const RECENT_LIMIT = 30
const PALETTE_LIMIT = 12
let recent = store.get('recent', [])

function rememberRecent(dir) {
  recent = [dir, ...recent.filter(p => !samePath(p, dir))].slice(0, RECENT_LIMIT)
  store.set('recent', recent)
}

// Subsequence match ("ncar" finds "Noemi Social\Caroselli"); consecutive and word-start hits score higher.
function fuzzyScore(query, text) {
  let from = 0
  let last = -2
  let score = 0
  for (const ch of query) {
    const i = text.indexOf(ch, from)
    if (i < 0) return -1
    score += i === last + 1 ? 3 : i === 0 || /[\\\s._-]/.test(text[i - 1]) ? 2 : 1
    last = i
    from = i + 1
  }
  return score - text.length / 100
}

function paletteCandidates() {
  const seen = new Set()
  const out = []
  const add = (path, kind) => {
    const key = path.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ path, kind, name: placeLabel(path) })
  }
  tabs.forEach(tab => add(tab.cwd, 'tab'))
  pins.forEach(pin => add(pin.path, 'favorite'))
  recent.forEach(p => add(p, 'recent'))
  for (const item of state.items.values()) if (item.isDir && samePath(parentDir(item.path), state.cwd)) add(item.path, 'subfolder')
  state.drives.forEach(d => add(d, 'drive'))
  return out
}

let paletteIndex = 0
let paletteResults = []

let paletteToken = 0
async function renderPalette() {
  const token = ++paletteToken
  const query = $('#paletteInput').value.trim().toLowerCase()
  let results = paletteCandidates()
  if (query) {
    // Names only, unless the query contains a backslash: matching whole paths makes short queries noisy.
    const field = query.includes('\\') ? 'path' : 'name'
    results = results
      .map(c => ({ ...c, score: fuzzyScore(query, c[field].toLowerCase()) }))
      .filter(c => c.score >= 0)
      .sort((a, b) => b.score - a.score)
    // a typed path that exists is offered first
    if (/^[a-z]:\\/i.test(query) && (await call('items', [$('#paletteInput').value.trim()]))?.[0]?.isDir) {
      results.unshift({ path: $('#paletteInput').value.trim(), kind: 'path', name: baseName($('#paletteInput').value.trim()) })
    }
  }
  if (token !== paletteToken) return // a newer keystroke has taken over
  paletteResults = results.slice(0, PALETTE_LIMIT)
  paletteIndex = Math.min(paletteIndex, Math.max(0, paletteResults.length - 1))
  $('#paletteList').replaceChildren(...(paletteResults.length ? paletteResults.map((r, i) => {
    const row = el('div', 'palette-row' + (i === paletteIndex ? ' on' : ''))
    const text = el('div', 'palette-text')
    text.append(el('b', '', r.name), el('small', '', r.path))
    row.append(icon(r.kind === 'drive' ? 'drive' : 'folder'), text, el('span', 'palette-kind', t('palette.' + r.kind)))
    row.onmousemove = () => { if (paletteIndex !== i) { paletteIndex = i; paintPalette() } }
    row.onclick = e => openPaletteResult(e.ctrlKey)
    return row
  }) : [el('p', 'hint', t('palette.none'))]))
}

function paintPalette() {
  $$('#paletteList .palette-row').forEach((row, i) => row.classList.toggle('on', i === paletteIndex))
  $$('#paletteList .palette-row')[paletteIndex]?.scrollIntoView({ block: 'nearest' })
}

function openPalette() {
  const dialog = $('#palette')
  $('#paletteInput').value = ''
  paletteIndex = 0
  renderPalette()
  dialog.showModal()
  $('#paletteInput').select()
}

function openPaletteResult(newTabToo) {
  const result = paletteResults[paletteIndex]
  if (!result) return
  $('#palette').close()
  newTabToo ? newTab(result.path) : navigate(result.path)
}

function bindPalette() {
  const input = $('#paletteInput')
  input.addEventListener('input', () => { paletteIndex = 0; renderPalette() })
  input.addEventListener('keydown', e => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key]
    if (step) {
      e.preventDefault()
      paletteIndex = (paletteIndex + step + paletteResults.length) % Math.max(1, paletteResults.length)
      paintPalette()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      openPaletteResult(e.ctrlKey)
    }
  })
  $('#palette').addEventListener('click', e => { if (e.target.id === 'palette') $('#palette').close() })
}

// Typing a name selects the first visible item that starts with it, as in the Finder.
let typed = ''
let typedTimer = null
function typeToSelect(char) {
  typed += char.toLowerCase()
  clearTimeout(typedTimer)
  typedTimer = setTimeout(() => { typed = '' }, 900)
  const nameOf = node => (node.entry?.name ?? baseName(node.dataset.path)).toLowerCase()
  const content = renderedItems().content.find(n => nameOf(n).startsWith(typed))
  if (content) {
    select(content.dataset.path, {})
    content.scrollIntoView({ block: 'nearest' })
    return
  }
  const row = $$('#folders .frow').find(r => r.entry.name.toLowerCase().startsWith(typed))
  if (row) focusEntry(row.entry)
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

// The open folder may have been deleted or its drive removed: then the closest folder that exists opens.
async function refresh() {
  const existing = state.cwd && await call('nearestFolder', state.cwd)
  if (existing && !samePath(existing, state.cwd)) return navigate(existing)
  return Promise.all([renderPlaces(), render()])
}

function setSort(value) {
  state.sort = localStorage.sort = value
  renderControls()
  refresh()
}

function toggleHidden() {
  state.showHidden = !state.showHidden
  localStorage.showHidden = state.showHidden
  refresh()
}

function setGroup(value) {
  state.group = localStorage.group = value
  renderControls()
  render()
}

/* ========== toolbar popup buttons ========== */

const SORT_OPTIONS = [['name', 'sort.name'], ['date', 'sort.date'], ['size', 'sort.size'], ['kind', 'sort.kind']]
const GROUP_OPTIONS = [['none', 'group.none'], ['day', 'group.day'], ['month', 'group.month'], ['kind', 'group.kind'], ['extension', 'group.extension']]

// A button showing the current choice that opens the options as a menu, like a macOS pop-up button.
// The leading icon replaces the label in narrow windows.
// extra: menu items listed after the options, below a separator.
function popupButton(button, options, current, pick, iconName, extra = []) {
  button.replaceChildren(icon(iconName, 'lead'), el('span', '', t(options.find(([value]) => value === current)?.[1])), icon('chevronDown'))
  button.onclick = () => menuBelow(button, [
    ...options.map(([value, label]) => ({ label: t(label), check: value === current, run: () => pick(value) })),
    ...(extra.length ? ['-', ...extra] : []),
  ])
}

function renderControls() {
  for (const b of $$('#viewSwitch button')) b.classList.toggle('on', b.dataset.view === state.view)
  popupButton($('#sort'), SORT_OPTIONS, state.sort, setSort, 'sort', [
    { label: t('sort.reverse'), check: state.reverse, run: () => { state.reverse = !state.reverse; localStorage.reverse = state.reverse; renderControls(); render() } },
  ])
  popupButton($('#group'), GROUP_OPTIONS, state.group, setGroup, 'group')
}

/* ========== global events ========== */

function bindEvents() {
  const main = $('#main')
  main.addEventListener('click', clearSelection)
  main.addEventListener('contextmenu', e => showMenu(e, [
    clipboard && { label: t('menu.paste'), key: 'Ctrl+V', run: paste },
    { label: t('menu.newFolder'), run: newFolder },
    '-',
    { label: t('menu.terminal'), run: () => call('openTerminal', state.cwd) },
    hasVsCode && { label: t('menu.vscode'), run: () => call('openInVsCode', [state.cwd]) },
    { label: t('menu.openInExplorer'), run: () => call('open', state.cwd) },
    { label: t('menu.copyPath'), run: () => copyPaths([state.cwd]) },
    { label: isPinned(state.cwd) ? t('menu.unpin') : t('menu.pin'), run: () => togglePin(state.cwd) },
    '-',
    { label: t('menu.showHidden'), key: 'Ctrl+Shift+.', check: state.showHidden, run: toggleHidden },
  ]))

  const contentPane = $('#content')
  contentPane.addEventListener('dragover', e => e.preventDefault())
  contentPane.addEventListener('drop', async e => {
    e.preventDefault()
    const paths = droppedPaths(e)
    const dir = contentPane.dataset.path
    if (paths.length && dir) { await moveItems(paths, dir); refresh() }
  })

  // Without this, dropping a file outside a target would navigate the window to it.
  document.addEventListener('dragover', e => e.preventDefault())
  document.addEventListener('drop', e => e.preventDefault())

  document.addEventListener('mousedown', e => { if (!$('#menu').contains(e.target)) $('#menu').hidden = true })
  // clicking a menu item must not take focus away, e.g. from the path field it completes
  $('#menu').addEventListener('mousedown', e => e.preventDefault())
  $('#crumbs').addEventListener('click', e => { if (e.target.id === 'crumbs') editPath() })

  document.addEventListener('keydown', e => {
    if ($('dialog[open]')) return
    if (e.ctrlKey && !viewerOpen()) {
      const step = { '+': 1, '=': 1, '-': -1, '0': 0 }[e.key]
      if (step !== undefined) { e.preventDefault(); return resizeSection(pointerSection, step) }
    }
    if (e.target.closest?.('input, select')) return
    // Any key closes an open menu, as on macOS, so it never lingers while the key acts on files.
    $('#menu').hidden = true
    if (viewerOpen()) return viewerKey(e)

    const clipboardKey = e.ctrlKey && !e.shiftKey && !e.altKey && {
      c: () => copySelection(false),
      x: () => copySelection(true),
      v: paste,
      d: duplicateSelection,
      z: undo,
    }[e.key.toLowerCase()]
    if (clipboardKey) { e.preventDefault(); return clipboardKey() }
    // By key position, so it works on layouts where Shift+. types another character.
    if (e.ctrlKey && e.shiftKey && e.code === 'Period') { e.preventDefault(); return toggleHidden() }
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); return goHistory(e.key === 'ArrowLeft' ? -1 : 1) }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); return copyPaths(selectedInOrder()) }
    if (e.key === ' ') {
      e.preventDefault()
      // A folder has nothing to preview, so Space opens it like Enter.
      const file = $('#content .item.sel:not(.folder)')
      if (file) return file.preview()
      const folder = $('#content .item.folder.sel')
      return folder ? navigate(folder.dataset.path) : enterFocus()
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); return openPalette() }
    if (e.ctrlKey && (e.code === 'Digit1' || e.code === 'Digit2')) { e.preventDefault(); return setView(e.code === 'Digit1' ? 'icons' : 'list') }
    if (e.ctrlKey && e.key.toLowerCase() === 'i') { e.preventDefault(); return showItemInfo(selectedInOrder()) }
    if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); return editPath() }
    if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); return newTab(state.cwd) }
    if (e.ctrlKey && e.key.toLowerCase() === 'w') { e.preventDefault(); return closeTab(tabIndex) }
    if (e.ctrlKey && e.key === 'Tab') { e.preventDefault(); return switchTab(tabIndex + (e.shiftKey ? -1 : 1)) }

    const selected = selectedInOrder()
    const fileSelected = selected.length === 1 && $$('#content .item.sel:not(.folder)').length === 1
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(e.key === 'ArrowDown' ? 1 : -1) }
    else if (e.key === 'ArrowRight') enterFocus()
    else if (e.key === 'ArrowLeft' || (e.altKey && e.key === 'ArrowUp')) goUp()
    else if (e.key === 'Backspace') goHistory(-1)
    else if (e.key === 'Enter') {
      if (fileSelected) $('#content .item.sel')?.open()
      else enterFocus()
    } else if (e.key === 'Delete' && selected.length) trashSelection()
    else if (e.key === 'F2' && selected.length) renameSelection()
    else if (e.key === 'a' && e.ctrlKey) {
      e.preventDefault()
      renderedItems().content.forEach(n => state.selection.add(n.dataset.path))
      paintSelection()
    } else if (e.key === 'Escape') clearSelection()
    else if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.altKey && !e.metaKey) typeToSelect(e.key)
  })

  $('#askInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#ask').close('ok') }
  })
  $('#viewer').addEventListener('click', e => { if (e.target.id === 'viewer') closeViewer() })
  $('#settingsBtn').replaceChildren(icon('gear'))
  $('#settingsBtn').onclick = openSettings
  for (const b of $$('#viewSwitch button')) {
    b.replaceChildren(icon(b.dataset.view === 'list' ? 'viewList' : 'viewIcons'))
    b.onclick = () => setView(b.dataset.view)
  }
  $('#backBtn').replaceChildren(icon('chevronLeft'))
  $('#forwardBtn').replaceChildren(icon('chevron'))
  $('#backBtn').onclick = () => goHistory(-1)
  $('#forwardBtn').onclick = () => goHistory(1)
  // The mouse's side buttons go back and forward.
  window.addEventListener('mouseup', e => { if (e.button === 3 || e.button === 4) { e.preventDefault(); goHistory(e.button === 3 ? -1 : 1) } })
  for (const tile of $$('#settings .tile')) tile.append(icon(tile.dataset.icon))
  for (const b of $$('.settings-nav button')) b.onclick = () => showSettingsPane(b.dataset.pane)
  $('#shellToggle').onchange = async e => {
    e.target.checked = !!(await call('setShellIntegration', e.target.checked))
  }
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
  bindPalette()
  bindSplitter()
  bindTooltips()
  new ResizeObserver(() => requestAnimationFrame(fitCrumbs)).observe($('#toolbar'))
  document.addEventListener('wheel', e => {
    if (!e.ctrlKey || viewerOpen()) return
    e.preventDefault()
    resizeSection(sectionOf(e.target), e.deltaY < 0 ? 1 : -1)
  }, { passive: false })

  systemDark.addEventListener('change', applyTheme)
  api.onChanged(refresh)
  api.onOpenFolder(dir => newTab(dir))
  api.onCloseViewer(closeViewer)
  // Picks up changes made by other programs while the window was in the background.
  window.addEventListener('focus', refresh)
  // Selections turn grey while the window is in the background, as on macOS.
  window.addEventListener('focus', () => document.body.classList.remove('inactive'))
  window.addEventListener('blur', () => document.body.classList.add('inactive'))
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
  const width = Number(localStorage.foldersWidth)
  if (width) document.body.style.setProperty('--folders-width', width + 'px')
  else document.body.style.removeProperty('--folders-width')
}

/* Splitter between the folder list and the content: drag to resize, double click for automatic width. */
const FOLDERS_MIN = 200
const CONTENT_MIN = 320

function bindSplitter() {
  const splitter = $('#splitter')
  const folders = $('#folders')
  splitter.addEventListener('pointerdown', e => {
    e.preventDefault()
    const left = folders.getBoundingClientRect().left
    const max = $('#main').getBoundingClientRect().width - CONTENT_MIN
    folders.classList.add('resizing')
    splitter.classList.add('active')
    const move = ev => {
      localStorage.foldersWidth = Math.round(Math.min(max, Math.max(FOLDERS_MIN, ev.clientX - left)))
      applySizes()
    }
    const up = () => {
      folders.classList.remove('resizing')
      splitter.classList.remove('active')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })
  splitter.addEventListener('dblclick', () => {
    delete localStorage.foldersWidth
    applySizes()
  })
}

function resizeSection(section, step) {
  const z = ZOOM[section]
  const index = z.steps.findIndex(s => s >= zoomValue(z))
  const from = index < 0 ? z.steps.length - 1 : index
  localStorage[z.key] = step === 0 ? z.fallback : z.steps[Math.max(0, Math.min(z.steps.length - 1, from + step))]
  applySizes()
}

/* ========== tooltips ========== */

/*
 * Native title tooltips look like Windows. On hover a title moves to data-tip and is shown in a
 * macOS-style bubble near the pointer after a short rest; leaving, clicking, scrolling or typing
 * hides it.
 */
const TOOLTIP_DELAY_MS = 550
const TOOLTIP_OFFSET = 20
let tipTarget = null
let tipTimer = null
let pointer = { x: 0, y: 0 }

function hideTooltip() {
  clearTimeout(tipTimer)
  tipTarget = null
  $('#tooltip').classList.remove('show')
}

function showTooltip(target) {
  const tip = $('#tooltip')
  if (!target.isConnected || !target.dataset.tip) return
  tip.textContent = target.dataset.tip
  tip.style.left = '0px'
  tip.style.top = '0px'
  const { width, height } = tip.getBoundingClientRect()
  const below = pointer.y + TOOLTIP_OFFSET + height < innerHeight - 8
  tip.style.left = Math.max(8, Math.min(pointer.x - 10, innerWidth - width - 8)) + 'px'
  tip.style.top = (below ? pointer.y + TOOLTIP_OFFSET : pointer.y - height - 10) + 'px'
  tip.classList.add('show')
}

function bindTooltips() {
  document.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY } }, true)
  document.addEventListener('pointerover', e => {
    const target = e.target.closest?.('[title], [data-tip]')
    if (!target) return
    if (target.hasAttribute('title')) {
      if (!target.hasAttribute('aria-label')) target.setAttribute('aria-label', target.title)
      target.dataset.tip = target.title
      target.removeAttribute('title')
    }
    if (target === tipTarget) return
    hideTooltip()
    tipTarget = target
    tipTimer = setTimeout(() => showTooltip(target), TOOLTIP_DELAY_MS)
  })
  document.addEventListener('pointerout', e => { if (tipTarget && !tipTarget.contains(e.relatedTarget)) hideTooltip() })
  for (const type of ['pointerdown', 'wheel', 'keydown', 'scroll']) document.addEventListener(type, hideTooltip, true)
}

/* ========== startup ========== */

// Runs after every extension script has registered itself.
document.addEventListener('DOMContentLoaded', async () => {
  translateStaticText()
  applyTheme()
  bindEvents()
  call('hasVsCode').then(found => { hasVsCode = found })
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
