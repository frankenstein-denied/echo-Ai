'use client'

// Telling Echo from a page that the shell renders with only `uid` (2nd Brain, Music): the signed-in user comes from
// Firebase auth and the profile from one read, unless the page was given them. Same pipeline as the AskEcho box.
import type { User } from 'firebase/auth'
import { getDoc } from 'firebase/firestore'
import { auth } from '@/lib/firebase'
import { userDoc, type UserProfile } from '@/lib/firestore'
import { quickSend, quickSendError, type QuickSendResult } from '@/lib/echo/quick-send'

export async function tellEcho(args: { uid: string; text: string; user?: User; profile?: UserProfile }): Promise<QuickSendResult> {
  const user = args.user ?? auth.currentUser
  if (!user || user.uid !== args.uid) throw new Error('Please sign in again to talk to Echo.')
  const profile = args.profile ?? ((await getDoc(userDoc(args.uid))).data() as UserProfile | undefined) ?? ({} as UserProfile)
  return quickSend({ user, profile, text: args.text })
}

/** For an empty state's "Tell Echo" button: sends and returns Echo's reply, or throws a short message. */
export async function tellEchoReply(args: { uid: string; text: string; user?: User; profile?: UserProfile }): Promise<string> {
  try {
    const out = await tellEcho(args)
    return out.reply
  } catch (e) {
    throw new Error(e instanceof Error && /^Please sign in/.test(e.message) ? e.message : quickSendError(e))
  }
}
