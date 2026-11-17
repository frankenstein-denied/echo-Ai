'use client'

import { useId } from 'react'
import { LEGACY_KINDS, LEGACY_QUESTIONS, type LegacyKind } from '@/lib/echo/legacy'
import type { AddInheritorError } from '@/lib/legacy-store'
import { Select } from '../ui'

export const KIND_LABEL: Record<LegacyKind, string> = {
  life: 'Life (people, interests, topics)',
  goals: 'Goals',
  notes: 'Notes',
  diary: 'Diary pages (titles and previews)',
  health: 'Health (mood, sleep, meals)',
}

export const ANSWER_HINT = "One word only. Capital letters don't matter."
export const ANSWER_INVALID = "One word only: letters, numbers, ' or -, up to 40 characters."

export const INHERITOR_ERROR: Record<AddInheritorError, string> = {
  email: 'Enter a valid email address.',
  self: "That's your own email. Add someone else.",
  'not-found': 'No Echo account uses that email yet. Ask them to sign up and verify their email, then try again.',
  limit: 'You can name up to 5 inheritors. Remove one to add someone else.',
  question: 'Pick a question.',
  answer: ANSWER_INVALID,
  exists: 'That person is already one of your inheritors.',
}

/** Checkboxes for what an inheritor may open. */
export function KindPicker({ value, onChange, disabled = false }: { value: LegacyKind[]; onChange: (v: LegacyKind[]) => void; disabled?: boolean }) {
  const id = useId()
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium text-foreground">What they can open</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {LEGACY_KINDS.map((k) => (
          <label key={k} htmlFor={`${id}-${k}`} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
            <input
              id={`${id}-${k}`}
              type="checkbox"
              className="size-4 shrink-0 accent-primary max-lg:size-5"
              checked={value.includes(k)}
              onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))}
            />
            {KIND_LABEL[k]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** The preset question picker. An empty value shows the "Pick a question" placeholder. */
export function QuestionSelect({ value, onChange, disabled = false, label = 'Question only they can answer' }: { value: string; onChange: (v: string) => void; disabled?: boolean; label?: string }) {
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {!value && <option value="">Pick a question</option>}
      {LEGACY_QUESTIONS.map((q) => (
        <option key={q.id} value={q.id}>
          {q.text}
        </option>
      ))}
    </Select>
  )
}
