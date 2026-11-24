import { describe, expect, it } from 'vitest'
import { quickReplies } from './quick-replies'

const YES_NO = ['Yes please', 'No thanks']

describe('quickReplies', () => {
  it('offers yes / no when the reply ends with a yes/no question', () => {
    expect(quickReplies('Saved. Want a reminder closer to the date?')).toEqual(YES_NO)
    expect(quickReplies('Want a reminder closer to the date?')).toEqual(YES_NO)
    expect(quickReplies('Logged your run! Should I add it to your 10K goal?')).toEqual(YES_NO)
    expect(quickReplies('Do you want me to set a reminder for tomorrow? ')).toEqual(YES_NO)
    expect(quickReplies('Got it. Would you like a note for that?')).toEqual(YES_NO)
    expect(quickReplies('Shall I remind you at 6?')).toEqual(YES_NO)
    expect(quickReplies("I've noted it. Is that for this Friday?")).toEqual(YES_NO)
  })

  it('offers nothing for an open question', () => {
    expect(quickReplies('What did you eat?')).toEqual([])
    expect(quickReplies('Nice run! How did it feel?')).toEqual([])
    expect(quickReplies('Saved. When should I remind you?')).toEqual([])
    expect(quickReplies('Which goal is this for?')).toEqual([])
  })

  it('offers nothing for a choice between two things', () => {
    expect(quickReplies('Do you want tea or coffee?')).toEqual([])
  })

  it('offers nothing when there is no question at the end', () => {
    expect(quickReplies('Logged it. Great job today.')).toEqual([])
    expect(quickReplies('Want a reminder? I set one for 6 anyway.')).toEqual([])
    expect(quickReplies('')).toEqual([])
  })
})
