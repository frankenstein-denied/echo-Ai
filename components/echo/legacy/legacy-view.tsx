'use client'

import { useCallback, useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import type { UserProfile } from '@/lib/firestore'
import { liveOpenLink } from '@/lib/echo/legacy-chat-helpers'
import type { LegacyLink } from '@/lib/legacy-store'
import { PageHeader } from '../ui'
import { LegacyInboxContext } from './use-legacy-inbox'
import InheritorSection, { OpenLegacy, useInbox } from './inheritor-section'
import { PreviewChat } from './memorial-chat'
import { OwnerSection } from './owner-section'

type Active = { kind: 'legacy'; link: LegacyLink } | { kind: 'preview' } | null

/** The Legacy page: the owner's own legacy first, then the legacies this user was named in. */
export function LegacyView({ user, profile }: { user: User; profile: UserProfile }) {
  const inbox = useInbox(user.uid)
  const [active, setActive] = useState<Active>(null)
  const { markSeen, openRequest, requestOpen, links } = inbox

  const show = useCallback((next: Active) => {
    setActive(next)
    window.scrollTo({ top: 0 })
  }, [])
  const openLegacy = useCallback(
    (link: LegacyLink) => {
      markSeen(link.ownerUid)
      show({ kind: 'legacy', link })
    },
    [markSeen, show],
  )

  // The home banner's "Open" lands here with the owner to open.
  useEffect(() => {
    if (!openRequest || links === null) return
    const link = links.find((l) => l.ownerUid === openRequest && l.status === 'accepted')
    requestOpen(null)
    if (link) openLegacy(link)
  }, [openRequest, links, requestOpen, openLegacy])

  const back = useCallback(() => show(null), [show])

  // The open legacy follows the live link, so question and sharing changes apply; a removed link closes it.
  const openId = active?.kind === 'legacy' ? active.link.id : null
  const live = openId ? liveOpenLink(links, openId) : null
  useEffect(() => {
    if (live === 'gone') setActive(null)
  }, [live])

  if (active?.kind === 'preview') {
    return (
      <div className="animate-in mx-auto grid max-w-3xl gap-5">
        <PreviewChat user={user} profile={profile} onBack={back} />
      </div>
    )
  }
  if (active?.kind === 'legacy' && live !== 'gone') {
    const link = live && live !== 'loading' ? live : active.link
    return (
      <div className="animate-in mx-auto grid max-w-3xl gap-5">
        <OpenLegacy key={link.id} user={user} profile={profile} link={link} onBack={back} />
      </div>
    )
  }
  return (
    <div className="animate-in mx-auto grid max-w-3xl gap-5">
      <PageHeader title="Legacy" description="Choose who can open your memories and talk with your Echo if you stop using it." />
      <OwnerSection user={user} profile={profile} onPreview={() => show({ kind: 'preview' })} />
      {/* Hands this page's inbox down, so a page rendered outside the shell still watches only once. */}
      <LegacyInboxContext.Provider value={inbox}>
        <InheritorSection user={user} profile={profile} onOpen={openLegacy} />
      </LegacyInboxContext.Provider>
    </div>
  )
}
