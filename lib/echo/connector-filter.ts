// Pure helpers deciding which connectors the Connectors page shows and how they are grouped into sections.
import { CONNECTOR_CATEGORIES, type ConnectorCategory, type ConnectorDef } from './connectors'

export type CategoryFilter = ConnectorCategory | 'all'

/** Keeps catalog order. The query is a plain, case-insensitive substring of the name or description. */
export function filterConnectors(defs: readonly ConnectorDef[], filter: { category: CategoryFilter; query: string }): ConnectorDef[] {
  const q = filter.query.trim().toLowerCase()
  return defs.filter(
    (d) => (filter.category === 'all' || d.category === filter.category) && (!q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)),
  )
}

/** Sections in CONNECTOR_CATEGORIES order; empty ones are dropped. */
export function groupByCategory(defs: readonly ConnectorDef[]): { id: ConnectorCategory; label: string; items: ConnectorDef[] }[] {
  return CONNECTOR_CATEGORIES.map((c) => ({ ...c, items: defs.filter((d) => d.category === c.id) })).filter((g) => g.items.length > 0)
}

/** "All" first, then only the categories that have at least one connector. */
export function categoryChips(defs: readonly ConnectorDef[]): { id: CategoryFilter; label: string }[] {
  return [{ id: 'all', label: 'All' }, ...groupByCategory(defs).map(({ id, label }) => ({ id, label }))]
}

const categoryLabel = (c: CategoryFilter) => CONNECTOR_CATEGORIES.find((x) => x.id === c)?.label ?? 'this category'

/** Copy for the "Nothing matches" state. */
export function emptyMessage(filter: { category: CategoryFilter; query: string }): string {
  const q = filter.query.trim()
  if (!q) return `No connectors in ${categoryLabel(filter.category)} yet.`
  return filter.category === 'all' ? `No connectors match “${q}”.` : `No connectors match “${q}” in ${categoryLabel(filter.category)}.`
}

/** Screen-reader announcement after filtering. */
export function shownCountText(n: number): string {
  return n === 0 ? 'No connectors shown' : `${n} connector${n === 1 ? '' : 's'} shown`
}
