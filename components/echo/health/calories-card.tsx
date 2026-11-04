'use client'

import { useEffect, useRef, useState } from 'react'
import { Pencil, Trash2, Undo2, Utensils } from 'lucide-react'
import { deleteMeal, type MealDoc } from '@/lib/firestore'
import { groupByMealType, itemsTotal, MEAL_TYPE_LABELS, type MealType } from '@/lib/echo/health-helpers'
import { Alert, Badge, Button, Card, ConfirmDialog, IconButton } from '../ui'
import { MealDialog } from './meal-editor'

const UNDO_MS = 10000

type Pending = { meal: MealDoc; timer: ReturnType<typeof setTimeout> }

/** The meal type a new meal defaults to: the first of breakfast, lunch, dinner not yet logged, else a snack. */
export function nextMealType(meals: { mealType: MealType }[]): MealType {
  return (['breakfast', 'lunch', 'dinner'] as const).find((t) => !meals.some((m) => m.mealType === t)) ?? 'snack'
}

// Today's meal list. The calories body above it shows the total and holds Add meal.
export function CaloriesCard({ uid, day, meals }: { uid: string; day: string; meals: MealDoc[] }) {
  const [editing, setEditing] = useState<MealDoc | null>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<MealDoc | null>(null)
  const pendingRef = useRef<Pending[]>([])
  const uidRef = useRef(uid)
  uidRef.current = uid

  const sync = (next: Pending[]) => {
    pendingRef.current = next
    setPending(next)
  }

  // Deletions are deferred for 10 s so Undo is a plain cancel; leaving the page commits them immediately.
  useEffect(
    () => () => {
      for (const p of pendingRef.current) {
        clearTimeout(p.timer)
        void deleteMeal(uidRef.current, p.meal.id).catch(() => {})
      }
    },
    [],
  )

  const remove = (meal: MealDoc) => {
    setConfirm(null)
    setError('')
    const timer = setTimeout(async () => {
      sync(pendingRef.current.filter((p) => p.meal.id !== meal.id))
      try {
        await deleteMeal(uid, meal.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete this meal.')
      }
    }, UNDO_MS)
    sync([...pendingRef.current, { meal, timer }])
  }

  const undo = (id: string) => {
    const p = pendingRef.current.find((x) => x.meal.id === id)
    if (p) clearTimeout(p.timer)
    sync(pendingRef.current.filter((x) => x.meal.id !== id))
  }

  const hidden = new Set(pending.map((p) => p.meal.id))
  const visible = meals.filter((m) => !hidden.has(m.id))
  const groups = groupByMealType(visible)
  const anyEstimated = visible.some((m) => m.estimated)

  return (
    <Card className="mt-5">
      <h2 className="text-base font-semibold text-foreground">Meals today</h2>

      {error && (
        <div className="mt-4">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}

      {pending.map((p) => (
        <div key={p.meal.id} role="status" className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground">
          <span className="min-w-0 truncate">Deleted &quot;{p.meal.description}&quot;</span>
          <Button variant="ghost" size="sm" icon={Undo2} onClick={() => undo(p.meal.id)} className="max-lg:h-11">
            Undo
          </Button>
        </div>
      ))}

      {groups.length === 0 ? (
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted-foreground">
          <Utensils size={20} aria-hidden="true" className="shrink-0" />
          <p>No meals logged today. Add one, or tell Echo what you ate.</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-5">
          {groups.map((g) => (
            <section key={g.type} aria-label={MEAL_TYPE_LABELS[g.type]}>
              <h3 className="text-sm font-medium text-muted-foreground">{MEAL_TYPE_LABELS[g.type]}</h3>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {g.meals.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                        <span className="min-w-0 break-words">{m.description}</span>
                        {m.estimated && <Badge variant="neutral">Estimated</Badge>}
                      </p>
                      {m.items.length > 0 && (
                        <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                          {m.items.map((it, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span className="min-w-0 truncate">
                                {it.name}
                                {it.quantity ? `, ${it.quantity}` : ''}
                              </span>
                              <span className="shrink-0 tabular-nums">{it.calories} kcal</span>
                            </li>
                          ))}
                          {m.items.length > 1 && itemsTotal(m.items) !== m.totalCalories && <li className="text-subtle">Items do not add up to the total.</li>}
                        </ul>
                      )}
                    </div>
                    <span className="shrink-0 pt-0.5 text-sm font-medium tabular-nums text-foreground">{m.totalCalories} kcal</span>
                    <div className="-my-1 flex shrink-0">
                      <IconButton icon={Pencil} size="sm" label={`Edit ${m.description}`} onClick={() => setEditing(m)} />
                      <IconButton icon={Trash2} size="sm" label={`Delete ${m.description}`} onClick={() => setConfirm(m)} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {anyEstimated && <p className="mt-4 text-xs text-muted-foreground">Estimated amounts come from your description. Edit a meal to correct it.</p>}

      <MealDialog uid={uid} day={day} meal={editing ?? undefined} open={editing !== null} onClose={() => setEditing(null)} />
      {confirm && <ConfirmDialog title={`Delete “${confirm.description}”?`} body="You can undo for a few seconds." confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />}
    </Card>
  )
}
