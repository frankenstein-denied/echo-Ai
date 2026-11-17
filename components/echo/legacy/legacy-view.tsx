'use client'

import { useCallback, useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import type { UserProfile } from '@/lib/firestore'
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

  if (active?.kind === 'preview') {
    return (
      <div className="animate-in mx-auto grid max-w-3xl gap-5">
        <PreviewChat user={user} profile={profile} onBack={back} />
      </div>
    )
  }
  if (active?.kind === 'legacy') {
    return (
      <div className="animate-in mx-auto grid max-w-3xl gap-5">
        <OpenLegacy key={active.link.id} user={user} profile={profile} link={active.link} onBack={back} />
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
