import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CycleTextControl, SessionVoiceControls } from './SessionVoiceControls'

describe('session voice options', () => {
  it('cycles forward and wraps without opening a selector', () => {
    const onChange = vi.fn()
    const options = [{ value: 'off', label: 'Off' }, { value: 'review', label: 'Review' }, { value: 'send', label: 'Auto-send' }] as const
    for (const [value, next] of [['off', 'review'], ['review', 'send'], ['send', 'off']] as const) {
      const button = CycleTextControl({ label: 'Wake', value, options, onChange })
      expect(button.props.type).toBe('button')
      button.props.onClick()
      expect(onChange).toHaveBeenLastCalledWith(next)
    }
  })
  it('shows complete current values and disables unavailable native wake capture', () => {
    const html = renderToStaticMarkup(<SessionVoiceControls nativeClient={false} wakeWordMode="review"
      autoSpeak activeTurnInputMode="steer" onWakeChange={vi.fn()} onAutoSpeakChange={vi.fn()} onInputModeChange={vi.fn()} />)
    expect(html).toContain('Voice and input')
    expect(html).toContain('Auto-play')
    expect(html).toContain('Steer')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('<select')
  })
})
