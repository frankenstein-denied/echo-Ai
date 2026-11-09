import { describe, expect, it } from 'vitest'
import { asksAboutFutureAsPast, buildCheckInUserText, CHECK_IN_RESPONSE_SCHEMA, CHECK_IN_SYSTEM_INSTRUCTION, parseCheckInRequest, sanitizeCheckInText } from './check-in-prompt'

const base = {
  localTime: 'Mon, Nov 9, 2:00 PM',
  partOfDay: 'afternoon',
  topic: 'OVERVIEW',
  health: { waterGlasses: 2, waterGoal: 8 },
  meals: { tracking: true, types: ['snack'], items: [{ type: 'snack', food: 'siopao', time: '8:05 AM' }], kcal: 300 },
  reminders: [{ title: 'Sleep', when: 'in 2 h, today at 4 PM', minutesAway: 120 }],
  goals: [],
  messages: [
    { role: 'user', text: 'I ate siopao', time: '8:04 AM' },
    { role: 'echo', text: 'Yum, siopao!', time: '8:04 AM' },
  ],
  recentCheckIns: [],
}

function parsed(over: Record<string, unknown> = {}) {
  const r = parseCheckInRequest({ ...base, ...over })
  if ('error' in r) throw new Error(r.error)
  return r
}

describe('parseCheckInRequest', () => {
  it('keeps meal items, message times and reminder distance', () => {
    const r = parsed()
    expect(r.meals.items).toEqual([{ type: 'snack', food: 'siopao', time: '8:05 AM' }])
    expect(r.messages[0]).toEqual({ role: 'user', text: 'I ate siopao', time: '8:04 AM' })
    expect(r.reminders[0].minutesAway).toBe(120)
  })

  it('reads an older APK without the new fields', () => {
    const r = parsed({ meals: { tracking: true, types: [] }, reminders: [{ title: 'Sleep', when: 'today 4 PM' }], messages: [{ role: 'user', text: 'hi' }] })
    expect(r.meals.items).toEqual([])
    expect(r.messages[0].time).toBe('')
    expect(r.reminders[0].minutesAway).toBeNull()
  })

  it('maps the language code to its name, and leaves it empty when absent', () => {
    expect(parsed({ language: 'ceb' }).language).toContain('Cebuano')
    expect(parsed().language).toBe('')
    expect(parsed({ language: 42 }).language).toBe('')
  })

  it('keeps up to 16 chat lines, the newest', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({ role: 'user', text: `m${i}` }))
    const r = parsed({ messages })
    expect(r.messages).toHaveLength(16)
    expect(r.messages[0].text).toBe('m4')
  })
})

describe('buildCheckInUserText', () => {
  it('shows message times, logged food and that reminders are still to come', () => {
    const text = buildCheckInUserText(parsed())
    expect(text).toContain('[8:04 AM] User: I ate siopao')
    expect(text).toContain('- siopao (snack, at 8:05 AM)')
    expect(text).toContain('- Sleep (in 2 h, today at 4 PM; not happened yet)')
    expect(text).toContain('all still in the future')
  })

  it('adds the distance for an older APK that sends only the clock', () => {
    const text = buildCheckInUserText(parsed({ reminders: [{ title: 'Sleep', when: 'today 4 PM', minutesAway: 120 }] }))
    expect(text).toContain('- Sleep (in 2 h, today 4 PM; not happened yet)')
  })

  it('names the language to write in, English by default', () => {
    expect(buildCheckInUserText(parsed({ language: 'ceb' }))).toContain('Language: Cebuano')
    expect(buildCheckInUserText(parsed())).toContain('Language: English')
  })

  it('tells a meal check-in to confirm food they already mentioned', () => {
    expect(buildCheckInUserText(parsed({ topic: 'MEAL' }))).toContain('Was the siopao your breakfast?')
  })
})

describe('asksAboutFutureAsPast', () => {
  const sleep = [{ title: 'Sleep', when: 'in 2 h, today at 4 PM', minutesAway: 120 }]
  it('catches asking how a future reminder went', () => {
    expect(asksAboutFutureAsPast('Hey! How was your sleep at 4pm?', sleep)).toBe(true)
    expect(asksAboutFutureAsPast('Did you sleep okay?', sleep)).toBe(true)
    expect(asksAboutFutureAsPast('Nice nap? How did you sleep?', sleep)).toBe(true)
  })

  it('allows mentioning that it is coming up', () => {
    expect(asksAboutFutureAsPast('Your sleep is at 4, want to wind down soon?', sleep)).toBe(false)
    expect(asksAboutFutureAsPast('How was lunch? Sleep is coming up at 4.', sleep)).toBe(false)
    expect(asksAboutFutureAsPast('How was lunch?', [])).toBe(false)
  })

  it('matches on the title words, not filler', () => {
    const r = [{ title: 'Call mom', when: 'in 1 h', minutesAway: 60 }]
    expect(asksAboutFutureAsPast('How was the call with mom?', r)).toBe(true)
    expect(asksAboutFutureAsPast('How did your call go?', r)).toBe(false)
  })
})

describe('sanitizeCheckInText', () => {
  it('rejects a text that treats a future reminder as past, so the next model tries', () => {
    const req = parsed()
    expect(sanitizeCheckInText({ notes: 'x', fullText: 'How was your sleep at 4pm?', shortText: 'How was your sleep?' }, req)).toBeNull()
    expect(sanitizeCheckInText({ notes: 'x', fullText: 'Was the siopao your breakfast?', shortText: 'Was the siopao breakfast?' }, req)).toEqual({
      fullText: 'Was the siopao your breakfast?',
      shortText: 'Was the siopao breakfast?',
    })
  })

  it('never returns the private notes', () => {
    const out = sanitizeCheckInText({ notes: 'secret', fullText: 'Hi there!', shortText: 'Hi' })
    expect(out).not.toHaveProperty('notes')
  })
})

describe('CHECK_IN_RESPONSE_SCHEMA', () => {
  it('asks for notes before the message', () => {
    expect(CHECK_IN_RESPONSE_SCHEMA.propertyOrdering[0]).toBe('notes')
  })
})

describe('CHECK_IN_SYSTEM_INSTRUCTION language', () => {
  it('writes both texts in the given language', () => {
    expect(CHECK_IN_SYSTEM_INSTRUCTION).toContain('- Write fullText and shortText in the language given under Language (default English).')
  })
})
