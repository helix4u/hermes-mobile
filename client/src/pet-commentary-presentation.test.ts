import { describe, expect, it } from 'vitest'

import {
  claimPetCommentaryPresentation,
  petCommentaryPresentation,
} from './pet-commentary-presentation'

describe('pet commentary presentation', () => {
  it('normalizes a persisted interaction event for local presentation', () => {
    expect(
      petCommentaryPresentation({
        type: 'pet.commentary.recorded',
        session_id: 'runtime-1',
        payload: {
          commentary_id: 'commentary-1',
          display_metadata: { source: 'interaction' },
          text: '  hello from the other screen  ',
        },
      }),
    ).toEqual({
      eventId: 'commentary-1',
      source: 'interaction',
      text: 'hello from the other screen',
    })
  })

  it('suppresses a same-client echo and keeps the claim list bounded', () => {
    const first = claimPetCommentaryPresentation([], 'commentary-1', 2)
    const second = claimPetCommentaryPresentation(first.ids, 'commentary-1', 2)
    const third = claimPetCommentaryPresentation(first.ids, 'commentary-2', 2)
    const fourth = claimPetCommentaryPresentation(third.ids, 'commentary-3', 2)

    expect(first.accepted).toBe(true)
    expect(second).toEqual({ accepted: false, ids: first.ids })
    expect(fourth).toEqual({
      accepted: true,
      ids: ['commentary-2', 'commentary-3'],
    })
  })

  it('ignores unrelated or incomplete events', () => {
    expect(
      petCommentaryPresentation({ type: 'message.delta', payload: {} }),
    ).toBeNull()
    expect(
      petCommentaryPresentation({
        type: 'pet.commentary.recorded',
        payload: { commentary_id: '', text: 'missing id' },
      }),
    ).toBeNull()
  })
})
