import { describe, expect, it, vi } from 'vitest'
import {
  BUILTIN_ALIEN_CHILD_INFO,
  BUILTIN_ALIEN_CHILD_PERSONALITY,
  BUILTIN_MOBILE_PET_CATALOG,
  builtinMobilePetPersonality,
  compactPetBubbleText,
  createPetCommentaryRequestGate,
  deriveMobilePetState,
  effectivePetSpeech,
  loadPetPersonalityOverrides,
  normalizePetPreferences,
  petContextFromTranscript,
  petFrameCount,
  petObserverFramesFromTranscript,
  petPersonalityOverrideFromData,
  petRowForState,
  petSidechatPrompt,
  petShouldTravel,
  petSpeechProfileFromConfig,
  petToolObserverHasSettledNewEvidence,
  petTurnActiveAfterEvent,
  persistPetPersonalityOverrides,
  resolvePetRuntimeSession,
} from './pet'

describe('mobile pet companion state', () => {
  it('defaults to Alien Child with commentary and walking enabled', () => {
    expect(normalizePetPreferences(null)).toMatchObject({
      commentary: true,
      personalitySlug: 'alien-child',
      roam: true,
      speechMode: 'desktop',
      visible: true,
    })
    expect(BUILTIN_ALIEN_CHILD_INFO).toMatchObject({
      enabled: true,
      frameH: 208,
      frameW: 192,
      slug: 'alien-child',
    })
    expect(BUILTIN_ALIEN_CHILD_INFO.spritesheetUrl).toBeTruthy()
    expect(BUILTIN_ALIEN_CHILD_PERSONALITY.id).toBe('alien-child')
    expect(
      BUILTIN_ALIEN_CHILD_PERSONALITY.interactions?.click.length,
    ).toBeGreaterThan(0)
  })

  it('bundles the real local pet catalog plus adapted Hermes defaults', () => {
    const slugs = BUILTIN_MOBILE_PET_CATALOG.map(row => row.slug)

    expect(slugs).toEqual(
      expect.arrayContaining([
        'alien-child',
        'dr-house',
        'fight-club-narrator',
        'gremlin',
        'noir-build-detective',
        'ponytail-principal',
        'shipbreaker-qa',
        'helpful',
        'technical',
        'pirate',
        'hype',
      ]),
    )
    expect(BUILTIN_MOBILE_PET_CATALOG).toHaveLength(20)
    expect(builtinMobilePetPersonality('alien-child')).toBe(
      BUILTIN_ALIEN_CHILD_PERSONALITY,
    )
    expect(builtinMobilePetPersonality('dr-house')?.displayName).toBe(
      'Dr. House',
    )
    expect(
      builtinMobilePetPersonality('ponytail-principal')?.commentary?.prompt,
    ).toContain('Ponytail Principal')
    expect(builtinMobilePetPersonality('technical')?.sidechat?.prompt).toContain(
      'chosen Mobile pet companion',
    )
  })

  it('persists personality edits only for the selected saved connection', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    })
    localStorage.clear()
    const base = BUILTIN_ALIEN_CHILD_PERSONALITY
    const edited = {
      ...petPersonalityOverrideFromData(base),
      displayName: 'My Alien Child',
      clickLines: ['Move.', 'I am busy.'],
    }

    persistPetPersonalityOverrides('workstation', {
      'alien-child': edited,
    })

    expect(
      loadPetPersonalityOverrides('workstation')['alien-child'],
    ).toMatchObject({
      displayName: 'My Alien Child',
      clickLines: ['Move.', 'I am busy.'],
    })
    expect(loadPetPersonalityOverrides('cloud')).toEqual({})
    vi.unstubAllGlobals()
  })

  it('inherits the shared Desktop pet provider, voice, and pitch curve', () => {
    const preferences = normalizePetPreferences(null)
    const desktop = petSpeechProfileFromConfig({
      pet: {
        speech: {
          enabled: true,
          mode: 'hermes',
          pitch: 8,
          provider: 'qwen',
          speed: 1.2,
          voice: 'alien-clone',
          volume: 0.75,
        },
      },
    })
    const effective = effectivePetSpeech(preferences, desktop)

    expect(effective.source).toBe('desktop')
    expect(effective.config).toMatchObject({
      pitch: 6,
      provider: 'qwen',
      qwen: { voice: 'alien-clone' },
      speed: 1.2,
      voice: 'alien-clone',
      volume: 0.75,
    })
  })

  it('keeps an independent Mobile pet voice separate from normal read-aloud', () => {
    const preferences = normalizePetPreferences({
      speechMode: 'custom',
      speechPitch: -6,
      speechProvider: 'xai',
      speechSpeed: 1.3,
      speechVoice: 'eve',
      speechVolume: 0.9,
    })
    const effective = effectivePetSpeech(preferences, null)

    expect(effective.source).toBe('custom')
    expect(effective.config).toMatchObject({
      pitch: -3.7,
      provider: 'xai',
      speed: 1.3,
      volume: 0.9,
      xai: { voice_id: 'eve' },
    })
  })

  it('prioritizes attention and live work states consistently', () => {
    expect(
      deriveMobilePetState({
        awaitingInput: true,
        busy: true,
        reasoning: true,
        toolRunning: true,
      }),
    ).toBe('waiting')
    expect(deriveMobilePetState({ busy: true, reasoning: true })).toBe('review')
    expect(deriveMobilePetState({ busy: true, toolRunning: true })).toBe('run')
    expect(deriveMobilePetState({ justCompleted: true })).toBe('wave')
  })

  it('keeps pet commentary active for the whole gateway turn', () => {
    expect(petTurnActiveAfterEvent(false, 'message.delta')).toBe(true)
    expect(petTurnActiveAfterEvent(true, 'tool.complete')).toBe(true)
    expect(petTurnActiveAfterEvent(true, 'reasoning.delta')).toBe(true)
    expect(petTurnActiveAfterEvent(true, 'message.complete')).toBe(false)
  })

  it('invalidates late automatic commentary and never queues overlapping requests', () => {
    const gate = createPetCommentaryRequestGate()
    const first = gate.begin(true, true)

    expect(first).not.toBeNull()
    expect(gate.begin(true, true)).toBeNull()
    expect(gate.canPublish(first!, true, true)).toBe(true)

    gate.cancel()
    expect(gate.canPublish(first!, true, false)).toBe(false)

    const nextTurn = gate.begin(true, true)
    expect(nextTurn).not.toBeNull()
    expect(nextTurn).not.toBe(first)
    gate.finish(first!)
    expect(gate.begin(true, true)).toBeNull()
    gate.finish(nextTurn!)
    expect(gate.begin(true, true)).not.toBeNull()
  })

  it('allows manual pet tests while idle but rejects automatic idle requests', () => {
    const gate = createPetCommentaryRequestGate()

    expect(gate.begin(true, false)).toBeNull()
    const manual = gate.begin(false, false)
    expect(manual).not.toBeNull()
    expect(gate.canPublish(manual!, false, false)).toBe(true)
  })

  it('reattaches pet sidechat when the runtime session was cleared', async () => {
    let attaches = 0
    expect(
      await resolvePetRuntimeSession('runtime-live', async () => {
        attaches += 1
        return 'runtime-replaced'
      }),
    ).toBe('runtime-live')
    expect(attaches).toBe(0)

    expect(
      await resolvePetRuntimeSession('', async () => {
        attaches += 1
        return 'runtime-resumed'
      }),
    ).toBe('runtime-resumed')
    expect(attaches).toBe(1)
  })

  it('uses a full-conversation character prompt instead of commentary brevity', () => {
    const prompt = petSidechatPrompt(BUILTIN_ALIEN_CHILD_PERSONALITY)
    expect(prompt).toContain('continuing private conversation')
    expect(prompt).toContain('whatever length is useful')
    expect(prompt).not.toContain('exactly one short context-aware interruption')

    const fallback = petSidechatPrompt({
      ...BUILTIN_ALIEN_CHILD_PERSONALITY,
      sidechat: undefined,
    })
    expect(fallback).toContain('Ignore commentary-only constraints')
    expect(fallback).toContain('Personality reference')
  })

  it('keeps long sidechat replies in the sheet and bounds only the roaming bubble', () => {
    const full = `Useful answer ${'with detail '.repeat(80)}`.trim()
    const bubble = compactPetBubbleText(full)
    expect(bubble.length).toBeLessThanOrEqual(240)
    expect(bubble.endsWith('…')).toBe(true)
    expect(full.length).toBeGreaterThan(bubble.length)
  })

  it('uses directional walk rows and real ragged frame counts', () => {
    const info = {
      enabled: true,
      framesByRow: { 'running-left': 7 },
      framesPerState: 12,
      stateRows: ['idle', 'running-left', 'running-right'],
    }
    expect(petRowForState(info, 'run', 'left')).toBe('running-left')
    expect(petFrameCount(info, 'running-left', 'run')).toBe(7)
    expect(petShouldTravel(true, 'idle')).toBe(true)
    expect(petShouldTravel(true, 'run')).toBe(true)
    expect(petShouldTravel(true, 'review')).toBe(false)
    expect(petShouldTravel(true, 'waiting')).toBe(false)
  })

  it('bounds commentary context to visible user and assistant turns', () => {
    const context = petContextFromTranscript(
      [
        { id: 'u', kind: 'user', text: 'hello' },
        {
          id: 't',
          kind: 'tool',
          tool: { name: 'terminal', status: 'complete', toolId: 't' },
        },
        { id: 'p', kind: 'pet', text: 'tiny heckle' },
        { id: 'a', kind: 'assistant', text: 'hi back' },
      ],
      4,
    )
    expect(context).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi back' },
    ])
  })

  it('builds bounded redacted progress and tool observer frames', () => {
    const frames = petObserverFramesFromTranscript(
      [
        { id: 'u', kind: 'user', text: 'fix the build' },
        {
          id: 't',
          kind: 'tool',
          tool: {
            args: { command: 'npm test', token: 'do-not-leak' },
            name: 'terminal',
            result: { status: 'passed', api_key: 'do-not-leak-either' },
            status: 'complete',
            toolId: 'tool-1',
          },
        },
      ],
      4,
    )

    expect(frames.progress.events[0]).toMatchObject({
      category: 'implementation',
      id: 't',
      status: 'completed',
      tool: 'terminal',
    })
    expect(frames.tool.tools[0].arguments).toContain('[redacted]')
    expect(frames.tool.tools[0].arguments).not.toContain('do-not-leak')
    expect(frames.tool.tools[0].result).not.toContain('do-not-leak-either')
  })

  it('treats arguments and results arriving on the same tool row as new evidence', () => {
    const provisional = petObserverFramesFromTranscript(
      [
        { id: 'u', kind: 'user', text: 'check the directory' },
        {
          id: 't',
          kind: 'tool',
          tool: {
            name: 'terminal',
            status: 'running',
            toolId: 'tool-1',
          },
        },
      ],
      4,
    )

    expect(provisional.tool.newEventIds).toEqual(['t'])
    expect(petToolObserverHasSettledNewEvidence(provisional.tool)).toBe(false)

    const completed = petObserverFramesFromTranscript(
      [
        { id: 'u', kind: 'user', text: 'check the directory' },
        {
          id: 't',
          kind: 'tool',
          tool: {
            args: { command: 'Get-ChildItem', token: 'do-not-leak' },
            name: 'terminal',
            result: { output: 'one.txt', api_key: 'do-not-leak-either' },
            status: 'complete',
            toolId: 'tool-1',
          },
        },
      ],
      4,
      provisional.ids,
    )

    expect(completed.tool.newEventIds).toEqual(['t'])
    expect(petToolObserverHasSettledNewEvidence(completed.tool)).toBe(true)
    expect(completed.tool.tools[0].arguments).toContain('Get-ChildItem')
    expect(completed.tool.tools[0].arguments).not.toContain('do-not-leak')
    expect(completed.tool.tools[0].result).toContain('one.txt')
    expect(completed.tool.tools[0].result).not.toContain(
      'do-not-leak-either',
    )
  })

  it('includes bounded redacted tool arguments and results in companion context', () => {
    const context = petContextFromTranscript(
      [
        { id: 'u', kind: 'user', text: 'inspect it' },
        {
          id: 't',
          kind: 'tool',
          tool: {
            args: { command: 'pwd', token: 'do-not-leak' },
            name: 'terminal',
            result: { output: 'C:\\workspace', api_key: 'also-secret' },
            status: 'complete',
            toolId: 'tool-1',
          },
        },
      ],
      2,
      2,
    )

    expect(context[1].content).toContain('terminal completed')
    expect(context[1].content).toContain('"command": "pwd"')
    expect(context[1].content).toContain('C:\\\\workspace')
    expect(context[1].content).not.toContain('do-not-leak')
    expect(context[1].content).not.toContain('also-secret')
  })

  it('omits tool evidence when tool observations are disabled', () => {
    const frames = petObserverFramesFromTranscript(
      [
        {
          id: 'tool-1',
          kind: 'tool',
          tool: {
            name: 'terminal',
            status: 'complete',
            toolId: 'tool-1',
            args: { command: 'pwd' },
            result: 'C:\\workspace',
          },
        },
      ],
      0,
    )

    expect(frames.ids).toEqual([])
    expect(frames.progress.events).toEqual([])
    expect(frames.tool.tools).toEqual([])
  })
})
