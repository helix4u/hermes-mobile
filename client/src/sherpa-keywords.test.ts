import { describe, expect, test } from 'vitest'
import { formatSherpaKeywordDefinition } from './sherpa-keywords'

describe('Sherpa keyword formatting', () => {
  test('formats token pieces with a bounded display phrase', () => {
    expect(
      formatSherpaKeywordDefinition(
        ['▁COMP', 'U', 'TER'],
        'computer',
      ),
    ).toBe('▁COMP U TER @COMPUTER')
  })

  test('rejects empty pieces and invalid phrases', () => {
    expect(() => formatSherpaKeywordDefinition([], 'computer')).toThrow()
    expect(() =>
      formatSherpaKeywordDefinition(['▁BAD'], '../bad'),
    ).toThrow()
  })


  test('formats definitions that can share one Sherpa stream', () => {
    expect(
      [
        formatSherpaKeywordDefinition(['▁HEY', '▁HERMES'], 'hey hermes'),
        formatSherpaKeywordDefinition(['▁HEY', '▁PET'], 'hey pet'),
      ].join('\n'),
    ).toBe('▁HEY ▁HERMES @HEY_HERMES\n▁HEY ▁PET @HEY_PET')
  })
})
