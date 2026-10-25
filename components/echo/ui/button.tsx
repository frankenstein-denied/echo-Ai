/**
 * Button / IconButton
 * Button props: variant 'primary'|'secondary'|'ghost'|'danger' (default primary), size 'sm'|'md' (default md),
 *   icon?: LucideIcon (16px, left of label), loading?: boolean, plus native button props.
 *   One primary button per area; secondary = outline; ghost for toolbar actions; danger for destructive.
 * IconButton props: icon: LucideIcon, label: string (REQUIRED, becomes aria-label), variant (default ghost), size, native props.
 */
import type { ButtonHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonClass, type ButtonSize, type ButtonVariant } from '@/lib/echo/ui-classes'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', icon: Icon, loading = false, className = '', children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cn(buttonClass(variant, size), className)} {...rest}>
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

type IconButtonProps = Omit<ButtonProps, 'icon' | 'children' | 'loading'> & { icon: LucideIcon; label: string }

export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', className = '', type = 'button', ...rest }: IconButtonProps) {
  const dim = size === 'sm' ? 'size-8 px-0' : 'size-10 px-0'
  return (
    <button type={type} aria-label={label} title={label} className={cn(buttonClass(variant, size), dim, className)} {...rest}>
      <Icon size={size === 'sm' ? 16 : 20} aria-hidden="true" />
    </button>
  )
}
