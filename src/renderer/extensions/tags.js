// Free-form labels on files and folders, with filter chips in the places bar.
registerExtension(({ language, el, chip, compare, ask, setMeta, render }) => {
  const STRINGS = {
    en: {
      name: 'Tags',
      description: 'Free labels (#client, #summer…) on files and folders, with a filter in the top bar.',
      add: 'Add tag…',
      prompt: 'Tag name',
      remove: 'Remove #{tag}',
    },
    it: {
      name: 'Tag',
      description: 'Etichette libere (#cliente, #estate…) su file e cartelle, con filtro nella barra in alto.',
      add: 'Aggiungi tag…',
      prompt: 'Nome del tag',
      remove: 'Rimuovi #{tag}',
    },
  }
  const text = STRINGS[language] || STRINGS.en
  let filter = null

  return {
    id: 'tags',
    name: text.name,
    description: text.description,

    badges: m => (m.tags || []).map(tag => el('span', 'tag', '#' + tag)),

    menu(paths, metas) {
      const present = [...new Set(metas.flatMap(m => m.tags || []))]
      return [
        {
          label: text.add,
          run: async () => {
            const tag = (await ask(text.prompt))?.trim().replace(/^#/, '')
            if (tag) setMeta(paths, { add: tag })
          },
        },
        ...present.map(tag => ({ label: text.remove.replace('{tag}', tag), run: () => setMeta(paths, { remove: tag }) })),
      ]
    },

    chips(all) {
      const counts = {}
      all.forEach(m => m.tags?.forEach(tag => { counts[tag] = (counts[tag] || 0) + 1 }))
      return Object.keys(counts).sort(compare).map(tag => chip(
        filter === tag,
        [el('span', '', '#' + tag)],
        () => { filter = filter === tag ? null : tag; render() },
        counts[tag],
      ))
    },

    filter: {
      active: () => filter !== null,
      match: m => !!m.tags?.includes(filter),
      reset: () => { filter = null },
    },
  }
})
