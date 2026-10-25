export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
export type NodeType = 'person' | 'topic' | 'interest' | 'goal' | 'health' | 'task' | 'diary' | 'connector'
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export const BADGE_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-2 text-muted-foreground border-border',
  primary: 'bg-primary-soft text-primary border-primary/30',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
  info: 'bg-info-soft text-info border-info/30',
}

export const NODE_BADGE_CLASSES: Record<NodeType, string> = {
  person: 'text-node-person border-node-person/40',
  topic: 'text-node-topic border-node-topic/40',
  interest: 'text-node-interest border-node-interest/40',
  goal: 'text-node-goal border-node-goal/40',
  health: 'text-node-health border-node-health/40',
  task: 'text-node-task border-node-task/40',
  diary: 'text-node-diary border-node-diary/40',
  connector: 'text-node-connector border-node-connector/40',
}

export function badgeClass(variant: BadgeVariant = 'neutral', nodeType?: NodeType): string {
  if (nodeType) return `bg-surface-2 ${NODE_BADGE_CLASSES[nodeType]}`
  return BADGE_CLASSES[variant]
}

export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover border-transparent',
  secondary: 'bg-transparent text-foreground border-border-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-muted-foreground border-transparent hover:bg-surface-2 hover:text-foreground',
  danger: 'bg-danger text-background border-transparent hover:bg-danger/90',
}

export const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
}

export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra = ''): string {
  return `inline-flex items-center justify-center rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} ${BUTTON_VARIANT_CLASSES[variant]} ${BUTTON_SIZE_CLASSES[size]} ${extra}`.trim()
}
