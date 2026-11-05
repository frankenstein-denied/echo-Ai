export type EmbedMode = 'chat' | 'call'

/** The floating Echo's native WebViews load /?embed=chat or /?embed=call. Anything else is a normal page. */
export function parseEmbedMode(search: string): EmbedMode | null {
  const v = new URLSearchParams(search).get('embed')
  return v === 'chat' || v === 'call' ? v : null
}
