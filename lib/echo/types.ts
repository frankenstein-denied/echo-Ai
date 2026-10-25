export type EchoCategory = 'note' | 'goal' | 'health' | 'reminder' | 'connector' | 'general'

export type MemoryType = 'diary' | 'task' | 'goal' | 'health' | 'person' | 'connector' | 'interest' | 'topic'

export type EchoEnergy = 'low' | 'medium' | 'high'

export type EchoAction =
  | { type: 'note'; title: string; body: string; category: string; tags: string[] }
  | { type: 'goal'; title: string; category: string; targetDate?: string }
  | { type: 'health'; date: string; mood?: number; sleepMinutes?: number; waterGlasses?: number; energy?: EchoEnergy }
  | { type: 'reminder'; title: string; dueAt: string }
  | { type: 'connector'; provider: string; request: string }
  | { type: 'general' }

export type MemoryInput = {
  label: string
  type: MemoryType
  /** Resolved memory doc ids (`<type>-<slug>`), already validated by the router. */
  linkIds: string[]
}

export type EchoRequestMessage = { role: 'user' | 'assistant'; text: string }

export type EchoMemoryLabel = { label: string; type: string; mentions: number }

export type EchoRequest = {
  text: string
  clientTime: string
  timeZone: string
  context: {
    profile: string
    recentMessages: EchoRequestMessage[]
    memoryLabels: EchoMemoryLabel[]
  }
}

export type EchoResponse = {
  reply: string
  actions: EchoAction[]
  memories: MemoryInput[]
  trace: string[]
  error?: boolean
}
