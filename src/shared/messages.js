/*
 * User-facing strings for every supported language, shared by the main process (require) and the
 * renderer (script tag). Placeholders use {name}; plural forms use the ".one" / ".other" suffixes.
 * English is the fallback for unsupported languages and for keys missing in a translation.
 */
const MESSAGES = {
  en: {
    'search.placeholder': 'Search',
    'sort.title': 'Sort',
    'sort.name': 'Name',
    'sort.date': 'Most recent',
    'group.title': 'Group',
    'group.none': 'No grouping',
    'group.day': 'By day',
    'group.month': 'By month',
    'group.kind': 'By type',
    'group.extension': 'By extension',
    'group.folders': 'Folders',

    'settings.title': 'Settings',
    'settings.appearance': 'Appearance',
    'settings.language': 'Language',
    'settings.system': 'System',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'accent.violet': 'Violet',
    'accent.blue': 'Blue',
    'accent.pink': 'Pink',
    'accent.red': 'Red',
    'accent.orange': 'Orange',
    'accent.yellow': 'Yellow',
    'accent.green': 'Green',
    'accent.graphite': 'Graphite',
    'glass.title': 'Glass effect',
    'glass.hint': 'Windows 11 translucent background on the top bars.',
    'extensions.title': 'Extensions',
    'extensions.hint': 'Turn on only what your work needs. Turning one off keeps its data.',
    'data.title': 'Data',
    'data.hint': 'File statuses and tags are tied to the file content: they survive moves and renames, and can be shared with anyone who has the same files.',
    'data.export': 'Export library…',
    'data.import': 'Import library…',
    'data.exported': 'Exported {n} files with statuses or tags',
    'data.imported': 'Imported {n} files with statuses or tags',
    'dialog.ok': 'OK',
    'dialog.cancel': 'Cancel',
    'dialog.done': 'Done',

    'count.files.one': '{n} file',
    'count.files.other': '{n} files',
    'count.folders.one': '{n} folder',
    'count.folders.other': '{n} folders',
    'count.items.one': '{n} item',
    'count.items.other': '{n} items',
    'count.empty': 'empty',

    'places.favorites': 'Favorites',
    'places.pc': 'This PC',
    'place.desktop': 'Desktop',
    'place.pictures': 'Pictures',
    'place.videos': 'Videos',
    'place.documents': 'Documents',
    'place.downloads': 'Downloads',

    'folder.here': 'Files in this folder',
    'folder.empty': 'Empty folder',
    'folder.open': 'Open',
    'folder.newPrompt': 'Name of the new folder',
    'folder.newDefault': 'New folder',
    'filter.results': '{items} matching this filter across the PC',
    'filter.none': 'No results',

    'day.today': 'Today',
    'day.yesterday': 'Yesterday',
    'kind.images': 'Images',
    'kind.videos': 'Videos',
    'kind.documents': 'Documents',
    'kind.audio': 'Audio',
    'kind.archives': 'Archives',
    'kind.programs': 'Programs and shortcuts',
    'kind.other': 'Other',
    'extension.none': 'No extension',

    'menu.open': 'Open',
    'menu.openNewTab': 'Open in new tab',
    'menu.reveal': 'Show in File Explorer',
    'menu.openInExplorer': 'Open in File Explorer',
    'menu.pin': 'Add to favorites',
    'menu.unpin': 'Remove from favorites',
    'menu.rename': 'Rename…',
    'menu.number': 'Number {n} items…',
    'menu.trash': 'Move to Recycle Bin',
    'menu.newFolder': 'New folder',
    'key.delete': 'Del',

    'rename.prompt': 'New name',
    'rename.base': 'Base name for {n} items, numbered in on-screen order (empty = numbers only)',
    'rename.sameFolder': 'To number items, select them in the same folder',

    'tab.close': 'Close tab (Ctrl+W)',
    'tab.new': 'New tab (Ctrl+T)',

    'viewer.openWith': 'Open with default program',
    'viewer.hint.browse': '← → browse',
    'viewer.hint.matte': 'B background',
    'viewer.hint.open': 'Enter opens in program',
    'viewer.hint.close': 'Space or Esc closes',
    'matte.dark': 'Dark background',
    'matte.light': 'Light background',
    'matte.checker': 'Checkerboard',

    'preview.size': '{rows} rows · {cols} columns',
    'preview.partial': 'partial preview',
    'preview.rendered': 'Preview',
    'preview.source': 'Source',

    'error.invalidName': 'Invalid name: {name}',
    'error.duplicateNames': 'Duplicate names',
    'error.exists': 'Already exists: {name}',
    'library.fileType': 'DevXplorer library',
    'library.defaultName': 'devxplorer-library.db',
  },

  it: {
    'search.placeholder': 'Cerca',
    'sort.title': 'Ordina',
    'sort.name': 'Nome',
    'sort.date': 'Più recenti',
    'group.title': 'Raggruppa',
    'group.none': 'Nessun gruppo',
    'group.day': 'Per giorno',
    'group.month': 'Per mese',
    'group.kind': 'Per tipo',
    'group.extension': 'Per estensione',
    'group.folders': 'Cartelle',

    'settings.title': 'Impostazioni',
    'settings.appearance': 'Aspetto',
    'settings.language': 'Lingua',
    'settings.system': 'Sistema',
    'theme.light': 'Chiaro',
    'theme.dark': 'Scuro',
    'accent.violet': 'Viola',
    'accent.blue': 'Blu',
    'accent.pink': 'Rosa',
    'accent.red': 'Rosso',
    'accent.orange': 'Arancione',
    'accent.yellow': 'Giallo',
    'accent.green': 'Verde',
    'accent.graphite': 'Grafite',
    'glass.title': 'Effetto vetro',
    'glass.hint': 'Sfondo traslucido di Windows 11 sulle barre in alto.',
    'extensions.title': 'Estensioni',
    'extensions.hint': 'Attiva solo quelle che servono al tuo lavoro. Disattivarle non cancella i dati.',
    'data.title': 'Dati',
    'data.hint': 'Stati e tag dei file sono legati al loro contenuto: restano anche se i file vengono spostati o rinominati, e si possono condividere con chi ha gli stessi file.',
    'data.export': 'Esporta libreria…',
    'data.import': 'Importa libreria…',
    'data.exported': 'Esportati {n} file con stati o tag',
    'data.imported': 'Importati {n} file con stati o tag',
    'dialog.ok': 'OK',
    'dialog.cancel': 'Annulla',
    'dialog.done': 'Fatto',

    'count.files.one': '{n} file',
    'count.files.other': '{n} file',
    'count.folders.one': '{n} cartella',
    'count.folders.other': '{n} cartelle',
    'count.items.one': '{n} elemento',
    'count.items.other': '{n} elementi',
    'count.empty': 'vuota',

    'places.favorites': 'Preferiti',
    'places.pc': 'Questo PC',
    'place.desktop': 'Desktop',
    'place.pictures': 'Immagini',
    'place.videos': 'Video',
    'place.documents': 'Documenti',
    'place.downloads': 'Download',

    'folder.here': 'File in questa cartella',
    'folder.empty': 'Cartella vuota',
    'folder.open': 'Apri',
    'folder.newPrompt': 'Nome della nuova cartella',
    'folder.newDefault': 'Nuova cartella',
    'filter.results': '{items} con questo filtro, in tutto il PC',
    'filter.none': 'Nessun risultato',

    'day.today': 'Oggi',
    'day.yesterday': 'Ieri',
    'kind.images': 'Immagini',
    'kind.videos': 'Video',
    'kind.documents': 'Documenti',
    'kind.audio': 'Audio',
    'kind.archives': 'Archivi',
    'kind.programs': 'Programmi e collegamenti',
    'kind.other': 'Altro',
    'extension.none': 'Senza estensione',

    'menu.open': 'Apri',
    'menu.openNewTab': 'Apri in una nuova scheda',
    'menu.reveal': 'Mostra in Esplora file',
    'menu.openInExplorer': 'Apri in Esplora file',
    'menu.pin': 'Aggiungi ai preferiti',
    'menu.unpin': 'Rimuovi dai preferiti',
    'menu.rename': 'Rinomina…',
    'menu.number': 'Numera {n} elementi…',
    'menu.trash': 'Sposta nel Cestino',
    'menu.newFolder': 'Nuova cartella',
    'key.delete': 'Canc',

    'rename.prompt': 'Nuovo nome',
    'rename.base': "Nome base per {n} elementi, numerati nell'ordine a schermo (vuoto = solo numeri)",
    'rename.sameFolder': 'Per numerare seleziona elementi della stessa cartella',

    'tab.close': 'Chiudi scheda (Ctrl+W)',
    'tab.new': 'Nuova scheda (Ctrl+T)',

    'viewer.openWith': 'Apri con il programma predefinito',
    'viewer.hint.browse': '← → scorri',
    'viewer.hint.matte': 'B sfondo',
    'viewer.hint.open': 'Invio apri con programma',
    'viewer.hint.close': 'Spazio o Esc chiudi',
    'matte.dark': 'Sfondo scuro',
    'matte.light': 'Sfondo chiaro',
    'matte.checker': 'Scacchiera',

    'preview.size': '{rows} righe · {cols} colonne',
    'preview.partial': 'anteprima parziale',
    'preview.rendered': 'Anteprima',
    'preview.source': 'Sorgente',

    'error.invalidName': 'Nome non valido: {name}',
    'error.duplicateNames': 'Nomi duplicati',
    'error.exists': 'Esiste già: {name}',
    'library.fileType': 'Libreria DevXplorer',
    'library.defaultName': 'devxplorer-libreria.db',
  },
}

const LANGUAGES = [['it', 'Italiano'], ['en', 'English']]

// Maps a locale such as "it-IT" to a supported language, falling back to English.
function pickLanguage(locale) {
  const code = String(locale || '').slice(0, 2).toLowerCase()
  return code in MESSAGES ? code : 'en'
}

function translator(language) {
  const table = MESSAGES[language] || MESSAGES.en
  const t = (key, params = {}) =>
    (table[key] ?? MESSAGES.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '')
  // Plural forms: tn('count.files', 3) -> "3 files"
  t.n = (key, n) => t(`${key}.${n === 1 ? 'one' : 'other'}`, { n })
  return t
}

if (typeof module !== 'undefined') module.exports = { MESSAGES, LANGUAGES, pickLanguage, translator }
