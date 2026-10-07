// Publishing workflow for social media content: to publish, published, discarded.
registerExtension(({ language, el, chip, setMeta, render, refreshViewer }) => {
  const STRINGS = {
    en: {
      name: 'Social',
      description: 'Publishing statuses: to publish, published, discarded. Filters in the top bar and keys 1/2/3 in the viewer.',
      todo: 'To publish',
      done: 'Published',
      drop: 'Discarded',
      hint: '1 To publish · 2 Published · 3 Discarded · 0 none',
      none: 'No status',
    },
    it: {
      name: 'Social',
      description: "Stati di pubblicazione: da pubblicare, pubblicato, scartato. Filtri nella barra in alto e tasti 1/2/3 nell'anteprima.",
      todo: 'Da pubblicare',
      done: 'Pubblicato',
      drop: 'Scartato',
      hint: '1 Da pubblicare · 2 Pubblicato · 3 Scartato · 0 nessuno',
      none: 'Nessuno stato',
    },
  }
  const text = STRINGS[language] || STRINGS.en
  const STATUSES = { todo: text.todo, done: text.done, drop: text.drop }
  const KEYS = [null, 'todo', 'done', 'drop'] // viewer shortcuts 0-3
  let filter = null

  return {
    id: 'social',
    name: text.name,
    description: text.description,

    badges: m => m.status ? [el('span', 'pill ' + m.status, STATUSES[m.status])] : [],

    dimmed: m => m.status === 'drop',

    menu(paths, metas) {
      const shared = metas.every(m => m.status === metas[0].status) ? metas[0].status : undefined
      return Object.entries(STATUSES).map(([key, label]) => ({
        label,
        dot: key,
        check: shared === key,
        run: () => setMeta(paths, { status: shared === key ? null : key }),
      }))
    },

    chips: all => Object.entries(STATUSES).map(([key, label]) => chip(
      filter === key,
      [el('i', 'dot ' + key), el('span', '', label)],
      () => { filter = filter === key ? null : key; render() },
      all.filter(m => m.status === key).length,
    )),

    filter: {
      active: () => filter !== null,
      match: m => m.status === filter,
      reset: () => { filter = null },
    },

    // Listed under Keyboard in Settings.
    shortcuts: [['1', text.todo], ['2', text.done], ['3', text.drop], ['0', text.none]],

    viewer: {
      hint: text.hint,
      onKey(e, path) {
        if (!/^[0-3]$/.test(e.key)) return false
        setMeta([path], { status: KEYS[+e.key] }).then(refreshViewer)
        return true
      },
    },
  }
})
