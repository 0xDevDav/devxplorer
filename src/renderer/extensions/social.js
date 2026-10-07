// Publishing workflow for social media content: to publish, published, discarded.
registerExtension(({ el, chip, setMeta, render, refreshViewer }) => {
  const STATUSES = { todo: 'Da pubblicare', done: 'Pubblicato', drop: 'Scartato' }
  const KEYS = [null, 'todo', 'done', 'drop'] // viewer shortcuts 0-3
  let filter = null

  return {
    id: 'social',
    name: 'Social',
    description: 'Stati di pubblicazione: da pubblicare, pubblicato, scartato. Filtri nella barra in alto e tasti 1/2/3 nell\'anteprima.',

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
      [el('i', 'dot ' + key), el('span', '', label), el('small', '', all.filter(m => m.status === key).length)],
      () => { filter = filter === key ? null : key; render() },
    )),

    filter: {
      active: () => filter !== null,
      match: m => m.status === filter,
      reset: () => { filter = null },
    },

    viewer: {
      hint: '1 Da pubblicare · 2 Pubblicato · 3 Scartato · 0 nessuno',
      onKey(e, path) {
        if (!/^[0-3]$/.test(e.key)) return false
        setMeta([path], { status: KEYS[+e.key] }).then(refreshViewer)
        return true
      },
    },
  }
})
