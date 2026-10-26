'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { addMeal, updateMeal, type MealDoc } from '@/lib/firestore'
import { itemsTotal, LIMITS, MEAL_TYPES, MEAL_TYPE_LABELS, validateMeal, type MealType } from '@/lib/echo/health-helpers'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { Alert, Button, IconButton, Input, Select } from '../ui'
import { Sheet } from '../sheet'
import { useIsMobile } from '../use-mobile'

type Row = { name: string; quantity: string; calories: string; protein?: number; carbs?: number; fat?: number }

function MealForm({ uid, day, meal, defaultType, onDone, onCancel }: { uid: string; day: string; meal?: MealDoc; defaultType: MealType; onDone: () => void; onCancel: () => void }) {
  const [mealType, setMealType] = useState<MealType>(meal?.mealType ?? defaultType)
  const [description, setDescription] = useState(meal?.description ?? '')
  const [calories, setCalories] = useState(meal ? String(meal.totalCalories) : '')
  const [rows, setRows] = useState<Row[]>(meal?.items.map((i) => ({ ...i, calories: String(i.calories) })) ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const parsedRows = rows.map((r) => ({ ...r, calories: r.calories.trim() === '' ? NaN : Number(r.calories) }))
  const rowTotal = itemsTotal(parsedRows.filter((r) => r.name.trim() && Number.isFinite(r.calories)))
  const hasItems = rows.length > 0

  const setRow = (i: number, patch: Partial<Row>) => setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const save = async () => {
    setError('')
    const input = {
      date: meal?.date ?? day,
      mealType,
      description,
      items: parsedRows,
      totalCalories: calories,
      source: meal?.source ?? 'manual',
      estimated: meal?.estimated ?? false,
    }
    const check = validateMeal(input)
    if (!check.ok) {
      setError(check.error)
      return
    }
    // A meal stays "estimated" unless the user actually changed what was estimated.
    if (meal?.estimated) {
      const v = check.value
      const same = v.mealType === meal.mealType && v.description === meal.description && v.totalCalories === meal.totalCalories && JSON.stringify(v.items) === JSON.stringify(meal.items)
      input.estimated = same
    }
    if (rows.length && check.value.items.length < rows.length) {
      setError('Each item needs a name and a calorie number.')
      return
    }
    setSaving(true)
    try {
      if (meal) await updateMeal(uid, meal.id, input)
      else await addMeal(uid, input)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this meal.')
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="grid gap-4 px-2 pb-2"
    >
      {error && <Alert variant="danger">{error}</Alert>}
      <Select label="Meal" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
        {MEAL_TYPES.map((t) => (
          <option key={t} value={t}>
            {MEAL_TYPE_LABELS[t]}
          </option>
        ))}
      </Select>
      <Input label="What did you eat?" value={description} maxLength={LIMITS.description} placeholder="Chicken salad with rice" onChange={(e) => setDescription(e.target.value)} autoFocus />
      {hasItems ? (
        <p className="text-sm text-muted-foreground">
          Total <span className="font-medium text-foreground">{rowTotal} kcal</span> (sum of items)
        </p>
      ) : (
        <Input label="Calories (kcal)" type="number" inputMode="numeric" min={0} max={LIMITS.total} value={calories} placeholder="450" onChange={(e) => setCalories(e.target.value)} />
      )}
      {rows.length > 0 && (
        <ul className="grid gap-3">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[1fr_5.5rem_auto] items-end gap-2 rounded-lg border border-border bg-surface-2 p-3">
              <div className="col-span-3">
                <Input label="Item" value={r.name} maxLength={LIMITS.name} onChange={(e) => setRow(i, { name: e.target.value })} aria-label={`Item ${i + 1} name`} />
              </div>
              <Input label="Amount" value={r.quantity} maxLength={LIMITS.quantity} placeholder="1 cup" onChange={(e) => setRow(i, { quantity: e.target.value })} aria-label={`Item ${i + 1} amount`} />
              <Input label="kcal" type="number" inputMode="numeric" min={0} max={LIMITS.itemCalories} value={r.calories} onChange={(e) => setRow(i, { calories: e.target.value })} aria-label={`Item ${i + 1} calories`} />
              <IconButton icon={Trash2} label={`Remove item ${i + 1}`} onClick={() => setRows((p) => p.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
      {rows.length < LIMITS.items && (
        <Button variant="ghost" icon={Plus} onClick={() => setRows((p) => [...p, { name: '', quantity: '', calories: '' }])} className="justify-self-start max-lg:h-11">
          Add item
        </Button>
      )}
      <div className="flex flex-wrap justify-end gap-2 max-sm:flex-col-reverse">
        <Button variant="secondary" onClick={onCancel} className="max-lg:h-11">
          Cancel
        </Button>
        <Button type="submit" loading={saving} className="max-lg:h-11">
          {meal ? 'Save changes' : 'Add meal'}
        </Button>
      </div>
    </form>
  )
}

// Bottom sheet on touch layouts, centered dialog on desktop.
export function MealDialog({ uid, day, meal, defaultType = 'breakfast', open, onClose }: { uid: string; day: string; meal?: MealDoc; defaultType?: MealType; open: boolean; onClose: () => void }) {
  const mobile = useIsMobile()
  if (!open) return null
  const title = meal ? 'Edit meal' : 'Add meal'
  const form = <MealForm key={meal?.id ?? 'new'} uid={uid} day={day} meal={meal} defaultType={defaultType} onDone={onClose} onCancel={onClose} />
  if (mobile) {
    return (
      <Sheet open onClose={onClose} title={title}>
        {form}
      </Sheet>
    )
  }
  return (
    <DesktopDialog title={title} onClose={onClose}>
      {form}
    </DesktopDialog>
  )
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Centered modal with the same focus handling as Sheet: focus moves in, Tab is trapped, Esc closes, focus is restored.
function DesktopDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      previous?.focus?.({ preventScroll: true })
    }
  }, [])
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
    if (!items.length) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (!panel.current.contains(document.activeElement) || document.activeElement === panel.current) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" onKeyDown={onKeyDown}>
      <div aria-hidden="true" className="absolute inset-0 bg-background/80" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-border-strong bg-surface p-5 ${FOCUS_RING}`}>
        <h2 className="mb-4 text-base font-semibold text-foreground">{title}</h2>
        {children}
      </div>
    </div>
  )
}
