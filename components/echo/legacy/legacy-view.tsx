'use client'

import type { User } from 'firebase/auth'
import type { UserProfile } from '@/lib/firestore'
import { PageHeader } from '../ui'
import InheritorSection from './inheritor-section'
import { OwnerSection } from './owner-section'

/** The Legacy page: the owner's own legacy first, then the legacies this user was named in. */
export function LegacyView({ user, profile, onPreview }: { user: User; profile: UserProfile; onPreview?: () => void }) {
  return (
    <div className="animate-in mx-auto grid max-w-3xl gap-5">
      <PageHeader title="Legacy" description="Choose who can open your memories and talk with your Echo if you stop using it." />
      <OwnerSection user={user} profile={profile} onPreview={onPreview} />
      <InheritorSection user={user} profile={profile} />
    </div>
  )
}
