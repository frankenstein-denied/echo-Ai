'use client'

import type { RefObject } from 'react'
import { Search } from 'lucide-react'
import type { CategoryFilter } from '@/lib/echo/connector-filter'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { Input } from '../ui'

/** Search box (optional) plus one row of category chips (one pressed at a time). */
export function ConnectorFilters({
  chips,
  category,
  onCategory,
  query,
  onQuery,
  inputRef,
  showSearch = true,
}: {
  chips: { id: CategoryFilter; label: string }[]
  category: CategoryFilter
  onCategory: (c: CategoryFilter) => void
  query: string
  onQuery: (q: string) => void
  /** Lets the page return focus to the search box (e.g. after Clear). */
  inputRef?: RefObject<HTMLInputElement | null>
  /** The header's search button shows the box; it stays shown while it holds a query. */
  showSearch?: boolean
}) {
  return (
    <div className="mb-5 grid gap-3">
      {(showSearch || query) && (
        <div className="relative">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input ref={inputRef} type="search" aria-label="Search connectors" placeholder="Search connectors" value={query} onChange={(e) => onQuery(e.target.value)} maxLength={60} className="pl-9" />
        </div>
      )}
      {/* One row of chips; it scrolls sideways on a narrow phone instead of wrapping. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter by category">
        {chips.map((c) => {
          const on = c.id === category
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => onCategory(c.id)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors max-lg:min-h-11 ${FOCUS_RING} ${
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
