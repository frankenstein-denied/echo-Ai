import type { NativePermissions } from '@/lib/native/echo-bridge'

/** The welcome steps, in the order they are asked. */
export type SetupStep = 'notifications' | 'microphone' | 'location' | 'overlay' | 'done'
export type AskStep = Exclude<SetupStep, 'done'>

export const SETUP_STEPS: readonly AskStep[] = ['notifications', 'microphone', 'location', 'overlay']

export const STEP_COPY: Record<AskStep, { title: string; why: string }> = {
  notifications: { title: 'Notifications', why: 'So Echo can check in on you and show your reminders, even when the app is closed.' },
  microphone: { title: 'Microphone', why: 'So you can talk to Echo and make voice calls.' },
  location: { title: 'Location', why: 'So Echo knows your local weather. Only your rough area is used.' },
  overlay: {
    title: 'Show Echo over other apps',
    why: "So Echo's chathead can pop up with a quick check-in. Android opens a settings page: turn on Echo, then come back.",
  },
}

function isGranted(step: AskStep, perms: NativePermissions): boolean {
  return perms[step] === true
}

function canAsk(step: AskStep, perms: NativePermissions): boolean {
  if (step === 'notifications') return perms.canAskNotifications
  if (step === 'microphone') return perms.canAskMicrophone
  if (step === 'location') return perms.canAskLocation
  return true // the overlay is a settings page, never a pop-up Android can refuse to show
}

/** blocked: Android will no longer show its pop-up, so only the app's settings page can change it. */
export function stepStatus(step: AskStep, perms: NativePermissions): 'granted' | 'ask' | 'blocked' {
  if (isGranted(step, perms)) return 'granted'
  return canAsk(step, perms) ? 'ask' : 'blocked'
}

/** The first step still to allow that the person has not put off, else 'done'. */
export function nextStep(perms: NativePermissions, skipped: readonly SetupStep[]): SetupStep {
  return SETUP_STEPS.find((s) => !isGranted(s, perms) && !skipped.includes(s)) ?? 'done'
}

/** perms is null on the web or an APK older than 1.14; neither can run the steps. */
export function shouldShowSetup(s: { isNative: boolean; embed: boolean; onboarded: boolean; done: boolean; perms: NativePermissions | null }): boolean {
  if (!s.isNative || s.embed || !s.onboarded || s.done || !s.perms) return false
  const perms = s.perms
  return SETUP_STEPS.some((step) => !isGranted(step, perms))
}

// Cleared on uninstall, so a fresh install sees the steps; existing users see them once after updating.
const DONE_KEY = 'echo.setup.permissionsDone'
// Also kept in memory so a phone with storage blocked is not asked twice in one visit.
let doneThisVisit = false

export function readPermissionSetupDone(): boolean {
  if (doneThisVisit) return true
  try {
    return localStorage.getItem(DONE_KEY) === '1'
  } catch {
    return false
  }
}

export function savePermissionSetupDone() {
  doneThisVisit = true
  try {
    localStorage.setItem(DONE_KEY, '1')
  } catch {}
}

/** Fired by Settings' "Set up permissions" button; the mounted PermissionSetup listens for it and reopens the steps. */
export const OPEN_PERMISSION_SETUP_EVENT = 'echo:open-permission-setup'

export function openPermissionSetup() {
  window.dispatchEvent(new Event(OPEN_PERMISSION_SETUP_EVENT))
}
