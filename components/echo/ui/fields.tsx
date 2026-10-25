/**
 * Form controls (forward native props; 8px radius, surface-2 fill, visible focus ring)
 * Input / Textarea / Select props: label?: string (rendered above), hint?: string, error?: string (sets aria-invalid, role=alert text),
 *   plus native props. Select takes <option> children.
 * RadioGroup props: label: string, value: string, onChange(value), options: {value,label,description?,swatch?: CSS colour for a decorative dot}[], name?: string.
 * Switch props: checked: boolean, onChange(checked), label: string (aria-label), disabled?.
 */
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { FOCUS_RING } from '@/lib/echo/ui-classes'

const CONTROL = `w-full rounded-lg border border-input-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-50 ${FOCUS_RING}`

type FieldMeta = { label?: string; hint?: string; error?: string }

function Field({ id, label, hint, error, children }: FieldMeta & { id: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      {label && <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>}
      {children}
      {error ? <p id={`${id}-err`} role="alert" className="text-xs text-danger">{error}</p> : hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function aria(id: string, f: FieldMeta) {
  return { 'aria-invalid': f.error ? true : undefined, 'aria-describedby': f.error ? `${id}-err` : f.hint ? `${id}-hint` : undefined }
}

export function Input({ label, hint, error, className = '', id, ...rest }: InputHTMLAttributes<HTMLInputElement> & FieldMeta) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <Field id={fid} label={label} hint={hint} error={error}>
      <input id={fid} className={cn(CONTROL, 'h-10', className)} {...aria(fid, { hint, error })} {...rest} />
    </Field>
  )
}

export function Textarea({ label, hint, error, className = '', id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldMeta) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <Field id={fid} label={label} hint={hint} error={error}>
      <textarea id={fid} className={cn(CONTROL, 'min-h-24 py-2', className)} {...aria(fid, { hint, error })} {...rest} />
    </Field>
  )
}

export function Select({ label, hint, error, className = '', id, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & FieldMeta) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <Field id={fid} label={label} hint={hint} error={error}>
      <select id={fid} className={cn(CONTROL, 'h-10', className)} {...aria(fid, { hint, error })} {...rest}>{children}</select>
    </Field>
  )
}

export function RadioGroup({ label, value, onChange, options, name }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string; description?: string; swatch?: string }[]; name?: string }) {
  const auto = useId()
  const group = name ?? auto
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium text-foreground">{label}</legend>
      {options.map(o => (
        <label key={o.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${value === o.value ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:bg-surface-2'}`}>
          <input type="radio" name={group} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-0.5 size-4 accent-primary" />
          <span className="grid">
            <span className="flex items-center gap-2 text-sm text-foreground">{o.swatch && <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: o.swatch }} />}{o.label}</span>
            {o.description && <span className="text-xs text-muted-foreground">{o.description}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

export function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${FOCUS_RING} ${checked ? 'border-primary bg-primary' : 'border-input-border bg-surface-2'}`}
    >
      <span aria-hidden="true" className={`inline-block size-4 rounded-full transition-transform ${checked ? 'translate-x-6 bg-primary-foreground' : 'translate-x-1 bg-muted-foreground'}`} />
    </button>
  )
}
