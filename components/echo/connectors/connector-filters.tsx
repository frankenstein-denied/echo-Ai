'use client'

import { Search } from 'lucide-react'
import type { CategoryFilter } from '@/lib/echo/connector-filter'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { Input } from '../ui'

/** Search box plus a wrapping row of category chips (one pressed at a time). */
export function ConnectorFilters({
  chips,
  category,
  onCategory,
  query,
  onQuery,
}: {
  chips: { id: CategoryFilter; label: string }[]
  category: CategoryFilter
  onCategory: (c: CategoryFilter) => void
  query: string
  onQuery: (q: string) => void
}) {
  return (
    <div className="mb-5 grid gap-3">
      <div className="relative">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label="Search connectors" placeholder="Search connectors" value={query} onChange={(e) => onQuery(e.target.value)} maxLength={60} className="pl-9" />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {chips.map((c) => {
          const on = c.id === category
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => onCategory(c.id)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors max-lg:min-h-9 ${FOCUS_RING} ${
                on ? 'border-primary bg-primary-soft text-primary' : 'border-border-strong text-muted-foreground hover:bg-surface-2 hover:text-foreground'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
