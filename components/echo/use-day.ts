'use client'

import { useEffect, useState } from 'react'
import { localDateKey } from '@/lib/echo/view-helpers'

/** Local date key (YYYY-MM-DD); re-renders when the local day changes. */
export function useDay(): string {
  const [day, setDay] = useState(() => localDateKey(new Date()))
  useEffect(() => {
    const id = setInterval(() => setDay(localDateKey(new Date())), 60000)
    return () => clearInterval(id)
  }, [])
  return day
}
