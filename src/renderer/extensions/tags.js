// Free-form labels on files and folders, with filter chips in the places bar.
registerExtension(({ t, el, chip, compare, ask, setMeta, render }) => {
  let filter = null

  return {
    id: 'tags',
    name: t('ext.tags.name'),
    description: t('ext.tags.description'),

    badges: m => (m.tags || []).map(tag => el('span', 'tag', '#' + tag)),

    menu(paths, metas) {
      const present = [...new Set(metas.flatMap(m => m.tags || []))]
      return [
        {
          label: t('ext.tags.add'),
          run: async () => {
            const tag = (await ask(t('ext.tags.prompt')))?.trim().replace(/^#/, '')
            if (tag) setMeta(paths, { add: tag })
          },
        },
        ...present.map(tag => ({ label: t('ext.tags.remove', { tag }), run: () => setMeta(paths, { remove: tag }) })),
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
