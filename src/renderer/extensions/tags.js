// Free-form labels on files and folders, with a sidebar filter.
registerExtension(({ el, chip, compare, ask, setMeta, render }) => {
  let filter = null

  return {
    id: 'tags',
    name: 'Tag',
    description: 'Etichette libere (#cliente, #estate…) su file e cartelle, con filtro nella barra laterale.',

    badges: m => (m.tags || []).map(t => el('span', 'tag', '#' + t)),

    menu(paths, metas) {
      const present = [...new Set(metas.flatMap(m => m.tags || []))]
      return [
        {
          label: 'Aggiungi tag…',
          run: async () => {
            const tag = (await ask('Nome del tag'))?.trim().replace(/^#/, '')
            if (tag) setMeta(paths, { add: tag })
          },
        },
        ...present.map(t => ({ label: `Rimuovi #${t}`, run: () => setMeta(paths, { remove: t }) })),
      ]
    },

    sidebar(all) {
      const counts = {}
      all.forEach(m => m.tags?.forEach(t => { counts[t] = (counts[t] || 0) + 1 }))
      const chips = Object.keys(counts).sort(compare).map(t => chip(
        filter === t,
        [el('span', '', '#' + t), el('small', '', counts[t])],
        () => { filter = filter === t ? null : t; render() },
      ))
      return chips.length ? chips : [el('p', 'hint', 'Nessun tag')]
    },

    filter: {
      active: () => filter !== null,
      match: m => !!m.tags?.includes(filter),
      reset: () => { filter = null },
    },
  }
})
