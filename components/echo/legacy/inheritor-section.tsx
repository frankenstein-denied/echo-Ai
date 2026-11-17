'use client'

import type { User } from 'firebase/auth'
import type { UserProfile } from '@/lib/firestore'

export type InheritorSectionProps = { user: User; profile: UserProfile }

/** The inheritor's side of Legacy (requests, released legacies, memorial chat). Filled in by the inheritor task. */
export default function InheritorSection(props: InheritorSectionProps) {
  void props
  return null
}
