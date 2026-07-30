import { describe, expect, test } from 'vitest'
import { configPatch } from './HostSettings'

describe('schema-driven host settings', () => {
  test('turns one dotpath into the narrow deep-merge payload', () => {
    expect(configPatch('display.sections.thinking', 'expanded')).toEqual({
      display: {
        sections: {
          thinking: 'expanded',
        },
      },
    })
  })

  test('preserves typed values for the host config endpoint', () => {
    expect(configPatch('gateway.run', false)).toEqual({
      gateway: { run: false },
    })
    expect(configPatch('tools.cli.enabled', ['file', 'terminal'])).toEqual({
      tools: { cli: { enabled: ['file', 'terminal'] } },
    })
  })
})

