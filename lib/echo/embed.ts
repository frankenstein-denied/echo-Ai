export type EmbedMode = 'chat' | 'call'

/**
 * The floating Echo's native WebViews load /?embed=chat or /?embed=call. Anything else is a normal page.
 * This only reads the URL, which anyone can type: use currentEmbedMode (lib/native/float-bridge) to decide on embed mode.
 */
export function parseEmbedMode(search: string): EmbedMode | null {
  const v = new URLSearchParams(search).get('embed')
  return v === 'chat' || v === 'call' ? v : null
}

export type EmbedCallStep = 'wait' | 'start' | 'voice_off'

/** What the floating call page does next. voiceEnabled is null until the prefs are read; voice off needs nothing else. */
export function embedCallStep(s: { voiceEnabled: boolean | null; disabled: boolean; messagesLoaded: boolean; memoriesLoaded: boolean }): EmbedCallStep {
  if (s.voiceEnabled === null) return 'wait'
  if (!s.voiceEnabled) return 'voice_off'
  return s.disabled || !s.messagesLoaded || !s.memoriesLoaded ? 'wait' : 'start'
}
