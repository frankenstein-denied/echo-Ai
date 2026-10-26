'use client'

import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Trash2, Undo2, Utensils } from 'lucide-react'
import { deleteMeal, type MealDoc } from '@/lib/firestore'
import { goalProgress, groupByMealType, itemsTotal, MEAL_TYPE_LABELS, type MealType } from '@/lib/echo/health-helpers'
import { Alert, Badge, Button, Card, ConfirmDialog, IconButton } from '../ui'
import { MealDialog } from './meal-editor'

const UNDO_MS = 10000

type Pending = { meal: MealDoc; timer: ReturnType<typeof setTimeout> }

export function CaloriesCard({ uid, day, meals, goal }: { uid: string; day: string; meals: MealDoc[]; goal?: number }) {
  const [editing, setEditing] = useState<MealDoc | null>(null)
  const [adding, setAdding] = useState(false)
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
  const total = visible.reduce((s, m) => s + m.totalCalories, 0)
  const progress = goalProgress(total, goal)
  const groups = groupByMealType(visible)
  const anyEstimated = visible.some((m) => m.estimated)
  const nextType: MealType = (['breakfast', 'lunch', 'dinner'] as const).find((t) => !visible.some((m) => m.mealType === t)) ?? 'snack'

  return (
    <Card className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Calories today</h2>
        <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)} className="max-lg:h-11">
          Add meal
        </Button>
      </div>

      <div className="mt-4">
        <p className="text-foreground">
          <span className="text-3xl font-semibold tabular-nums">{total.toLocaleString('en-US')}</span>
          <span className="ml-1.5 text-sm text-muted-foreground">{goal ? `of ${goal.toLocaleString('en-US')} kcal` : 'kcal'}</span>
        </p>
        {progress ? (
          <>
            <div
              role="progressbar"
              aria-label="Calories toward daily goal"
              aria-valuemin={0}
              aria-valuemax={goal}
              aria-valuenow={Math.min(total, goal ?? total)}
              className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
            >
              <div className={`h-full rounded-full ${progress.over > 0 ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${progress.pct}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{progress.over > 0 ? `${progress.over.toLocaleString('en-US')} kcal over your goal` : `${progress.remaining.toLocaleString('en-US')} kcal remaining`}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Set a daily goal in Settings to see what is left.</p>
        )}
      </div>

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

      <MealDialog uid={uid} day={day} defaultType={nextType} open={adding} onClose={() => setAdding(false)} />
      <MealDialog uid={uid} day={day} meal={editing ?? undefined} open={editing !== null} onClose={() => setEditing(null)} />
      {confirm && <ConfirmDialog title={`Delete “${confirm.description}”?`} body="You can undo for a few seconds." confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />}
    </Card>
  )
}
