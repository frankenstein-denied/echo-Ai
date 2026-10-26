import type { ConnectorStatus } from './connectors'
export type EchoCategory = 'note' | 'goal' | 'health' | 'reminder' | 'connector' | 'general'

export type MemoryType = 'diary' | 'task' | 'goal' | 'health' | 'person' | 'connector' | 'interest' | 'topic'

export type EchoEnergy = 'low' | 'medium' | 'high'

export type EchoMoodTag = 'great' | 'happy' | 'okay' | 'tired' | 'sad' | 'anxious' | 'angry'
export type EchoMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type EchoMealItem = { name: string; quantity: string; calories: number; protein?: number; carbs?: number; fat?: number }

/** Resolved nutrition for a meal (filled in server-side by lib/server/nutrition.ts, or by POST /api/nutrition on calls). */
/** `grounded`: at least one item's numbers came from the USDA food database (otherwise Gemini's own estimate). */
export type EchoNutrition = { items: EchoMealItem[]; totalCalories: number; estimated: true; grounded: boolean; assumptions?: string }

type HealthFields = { mood?: number; moodTag?: EchoMoodTag; sleepMinutes?: number; waterGlasses?: number; energy?: EchoEnergy }

/**
 * Edit/delete actions target existing items by a short ref ("r1", "g2", "n3", "m1") from the request's
 * `context.items` lists. Refs map to Firestore doc ids on the client only; ids are never sent to the model.
 */
export type EchoAction =
  | { type: 'note'; title: string; body: string; category: string; tags: string[] }
  | { type: 'goal'; title: string; category: string; targetDate?: string }
  | ({ type: 'health'; date: string } & HealthFields)
  | { type: 'reminder'; title: string; dueAt: string }
  | { type: 'connector'; provider: string; request: string }
  | { type: 'general' }
  | { type: 'reminder_update'; ref: string; done?: boolean; title?: string; dueAt?: string }
  | { type: 'reminder_delete'; ref: string }
  | { type: 'note_update'; ref: string; title?: string; body?: string; append?: string }
  | { type: 'note_delete'; ref: string }
  | { type: 'goal_update'; ref: string; progress?: number; milestoneDone?: { text: string; done: boolean }; title?: string }
  | { type: 'goal_delete'; ref: string }
  | ({ type: 'health_update'; date: string } & HealthFields)
  | { type: 'meal_log'; description: string; mealType: EchoMealType; date: string; nutrition?: EchoNutrition }
  | { type: 'meal_update'; ref: string; description?: string; mealType?: EchoMealType; totalCalories?: number; nutrition?: EchoNutrition }
  | { type: 'meal_delete'; ref: string }
  /** Resolved on the server (never reaches the browser): the reply is written from Tavily results. */
  | { type: 'web_search'; query: string }

export type EchoActionType = EchoAction['type']
export const DELETE_ACTION_TYPES = ['reminder_delete', 'note_delete', 'goal_delete', 'meal_delete'] as const

export type MemoryInput = {
  label: string
  type: MemoryType
  /** Resolved memory doc ids (`<type>-<slug>`), already validated by the router. */
  linkIds: string[]
}

export type EchoRequestMessage = { role: 'user' | 'assistant'; text: string }

export type EchoMemoryLabel = { label: string; type: string; mentions: number }

/** Short-ref lists of the user's existing items, so the model can target them (refs only, never doc ids). */
export type EchoItemsContext = {
  /** Open reminders, soonest first (max 20). due is the local time, e.g. "Mon, Oct 26, 8:00 PM". */
  reminders: { ref: string; title: string; due: string }[]
  /** Goals (max 20) with progress and milestones. */
  goals: { ref: string; title: string; progress: number; milestones: { text: string; done: boolean }[] }[]
  /** Most recently updated notes (max 10). */
  notes: { ref: string; title: string }[]
  /** Today's health log, already formatted ("mood 8 (happy), sleep 420 min"), or '' when nothing is logged. */
  health: string
  /** Today's meals (max 12); empty when calorie tracking is off. */
  meals: { ref: string; mealType: EchoMealType; description: string; calories: number }[]
  /** Calorie tracking switch from the profile (absent in the profile means on). */
  caloriesEnabled: boolean
}

export type EchoRequest = {
  text: string
  clientTime: string
  timeZone: string
  context: {
    profile: string
    recentMessages: EchoRequestMessage[]
    memoryLabels: EchoMemoryLabel[]
    items?: EchoItemsContext
    /** Connector states from the browser; absent means defaults (Nutrition connected). */
    connectors?: { id: string; status: ConnectorStatus }[]
  }
  /** Sealed Tavily tokens from the Web search connector doc; sent only when Web search is connected. */
  webSearchKey?: string
}

export type EchoResponse = {
  reply: string
  actions: EchoAction[]
  memories: MemoryInput[]
  trace: string[]
  error?: boolean
  /** Web search: the pages the reply was written from (at most 5). */
  sources?: { title: string; url: string }[]
  /** Web search: the Tavily login no longer works; the browser disconnects Web search. */
  webSearchRevoked?: true
  /** Web search: refreshed sealed tokens; the browser saves them to the connector doc. */
  webSearchResealed?: string
}
