import { describe, expect, test } from 'vitest'
import { aliasCommand, commandParts } from './commands'

describe('slash command routing', () => {
  test('normalizes command names while retaining arguments', () => {
    expect(commandParts('  //ReAsOnInG high  ')).toEqual({
      name: 'reasoning',
      arg: 'high',
    })
  })

  test('forwards arguments when resolving an alias', () => {
    expect(aliasCommand('model', '/m openai/gpt-5')).toBe(
      '/model openai/gpt-5',
    )
  })
})
