import {
  formatDisplayValue,
  type TranscriptItem,
} from './state/transcript'
import alienChildPersonalityJson from './assets/alien-child-personality.json'
import alienChildSpritesheetUrl from './assets/alien-child-spritesheet.webp?url'

export type MobilePetState =
  | 'failed'
  | 'idle'
  | 'jump'
  | 'review'
  | 'run'
  | 'waiting'
  | 'wave'

export interface MobilePetInfo {
  enabled: boolean
  slug?: string
  displayName?: string
  mime?: string
  spritesheetBase64?: string
  spritesheetUrl?: string
  spritesheetRevision?: string
  frameW?: number
  frameH?: number
  framesPerState?: number
  framesByState?: Record<string, number>
  framesByRow?: Record<string, number>
  loopMs?: number
  scale?: number
  stateRows?: string[]
}

export interface PetPersonalitySummary {
  slug: string
  displayName: string
  description: string
  path: string
  revision: string
  valid: boolean
}

export interface PetPersonalityData {
  schemaVersion: 1 | 2
  id: string
  displayName: string
  description: string
  lines: Record<MobilePetState, string[]>
  interactions?: {
    click: string[]
    resetAfterSeconds: number
  }
  commentary?: {
    prompt: string
    maxCharacters: number
  }
  sidechat?: {
    prompt: string
  }
}

export interface PetPreferences {
  visible: boolean
  roam: boolean
  commentary: boolean
  speakCommentary: boolean
  speechMode: 'desktop' | 'custom'
  speechProvider: string
  speechVoice: string
  speechSpeed: number
  speechPitch: number
  speechVolume: number
  personalitySlug: string
  commentaryLens: PetCommentaryLens
  contextTurns: number
  toolTurns: number
  commentaryHistory: number
  delaySeconds: number
  intervalSeconds: number
}

export interface PetHostCapabilities {
  mode: 'checking' | 'full' | 'visual-only'
  commentary: boolean
  personalities: boolean
  sidechat: boolean
}

export const CHECKING_PET_HOST_CAPABILITIES: PetHostCapabilities = {
  mode: 'checking',
  commentary: false,
  personalities: false,
  sidechat: false,
}

export const FULL_PET_HOST_CAPABILITIES: PetHostCapabilities = {
  mode: 'full',
  commentary: true,
  personalities: true,
  sidechat: true,
}

export const VISUAL_ONLY_PET_HOST_CAPABILITIES: PetHostCapabilities = {
  mode: 'visual-only',
  commentary: false,
  personalities: false,
  sidechat: false,
}

const PET_TURN_ACTIVITY_EVENTS = [
  'message.delta',
  'message.interim',
  'reasoning.',
  'thinking.',
  'tool.',
  'approval.request',
  'clarify.request',
  'sudo.request',
  'secret.request',
]

export function petTurnActiveAfterEvent(
  current: boolean,
  eventType: string,
): boolean {
  if (eventType === 'message.complete') return false
  if (
    PET_TURN_ACTIVITY_EVENTS.some(prefix =>
      prefix.endsWith('.')
        ? eventType.startsWith(prefix)
        : eventType === prefix,
    )
  ) {
    return true
  }
  return current
}

export async function resolvePetRuntimeSession(
  runtimeSessionId: string,
  ensureSession: () => Promise<string>,
): Promise<string> {
  const current = runtimeSessionId.trim()
  if (current) return current
  const attached = String(await ensureSession()).trim()
  if (!attached) {
    throw new Error('Could not attach this pet sidechat to a Hermes session')
  }
  return attached
}

export type PetCommentaryLens = 'companion' | 'progress' | 'tool'

export interface PetSpeechProfile {
  enabled: boolean
  mode: 'browser' | 'hermes'
  provider: string
  voice: string
  speed: number
  pitch: number
  volume: number
}

export interface PetObserverFrames {
  ids: string[]
  progress: {
    events: Array<{
      id: string
      category: string
      status: string
      tool: string
    }>
    newEventIds: string[]
    phaseEstimate: { value: string }
  }
  tool: {
    initialUserDirection: string
    latestUserDirection: string
    newEventIds: string[]
    tools: Array<{
      id: string
      name: string
      status: string
      arguments: string
      result: string
      argumentsTruncated: boolean
      resultTruncated: boolean
    }>
  }
}

export interface PetActivity {
  busy?: boolean
  awaitingInput?: boolean
  toolRunning?: boolean
  reasoning?: boolean
  error?: boolean
  justCompleted?: boolean
}

export const BUILTIN_ALIEN_CHILD_PERSONALITY =
  alienChildPersonalityJson as PetPersonalityData

export function petSidechatPrompt(
  personality: PetPersonalityData | null | undefined,
  fallbackName = 'Your pet',
): string {
  const explicit = String(personality?.sidechat?.prompt || '').trim()
  if (explicit) return explicit
  const name = String(personality?.displayName || fallbackName || 'Your pet').trim()
  const reference = String(personality?.commentary?.prompt || '').trim()
  return [
    `Fully embody ${name} in a continuing private conversation with the user.`,
    'Respond directly, preserve continuity across prior sidechat turns, and give useful complete answers at the length the user requests.',
    'Casual banter can be short. Explanations, opinions, recaps, plans, and creative responses must not be forced into a one-line quip.',
    'The personality reference below controls voice and temperament only. Ignore commentary-only constraints in it that require one short interruption, prohibit answering, or impose a character limit.',
    reference ? `Personality reference:\n${reference}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function compactPetBubbleText(text: string, maximum = 240): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maximum) return clean
  return `${clean.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`
}

export const BUILTIN_ALIEN_CHILD_SUMMARY: PetPersonalitySummary = {
  slug: 'alien-child',
  displayName: BUILTIN_ALIEN_CHILD_PERSONALITY.displayName,
  description: BUILTIN_ALIEN_CHILD_PERSONALITY.description,
  path: 'mobile://built-in/alien-child',
  revision: 'mobile-builtin-v1',
  valid: true,
}

export const BUILTIN_ALIEN_CHILD_INFO: MobilePetInfo = {
  enabled: true,
  slug: 'alien-child',
  displayName: 'Alien Child',
  mime: 'image/webp',
  spritesheetUrl: alienChildSpritesheetUrl,
  spritesheetRevision: 'mobile-builtin-v1',
  frameW: 192,
  frameH: 208,
  framesPerState: 6,
  loopMs: 1_100,
  scale: 0.33,
  stateRows: [
    'idle',
    'running-right',
    'running-left',
    'waving',
    'jumping',
    'failed',
    'waiting',
    'running',
    'review',
  ],
}

const DEFAULT_PET_PREFERENCES: PetPreferences = {
  visible: true,
  roam: true,
  commentary: true,
  speakCommentary: false,
  speechMode: 'desktop',
  speechProvider: '',
  speechVoice: '',
  speechSpeed: 1,
  speechPitch: 0,
  speechVolume: 1,
  personalitySlug: 'alien-child',
  commentaryLens: 'companion',
  contextTurns: 3,
  toolTurns: 4,
  commentaryHistory: 5,
  delaySeconds: 12,
  intervalSeconds: 45,
}

function storageKey(connectionId: string): string {
  return `hermes-mobile.pet.v1.${connectionId || 'default'}`
}

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, Math.round(parsed)))
    : fallback
}

function boundedDecimal(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  precision = 2,
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const factor = 10 ** precision
  return (
    Math.round(Math.max(minimum, Math.min(maximum, parsed)) * factor) / factor
  )
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function normalizePetPreferences(
  value: Partial<PetPreferences> | null | undefined,
): PetPreferences {
  return {
    visible:
      typeof value?.visible === 'boolean'
        ? value.visible
        : DEFAULT_PET_PREFERENCES.visible,
    roam:
      typeof value?.roam === 'boolean'
        ? value.roam
        : DEFAULT_PET_PREFERENCES.roam,
    commentary:
      typeof value?.commentary === 'boolean'
        ? value.commentary
        : DEFAULT_PET_PREFERENCES.commentary,
    speakCommentary:
      typeof value?.speakCommentary === 'boolean'
        ? value.speakCommentary
        : DEFAULT_PET_PREFERENCES.speakCommentary,
    speechMode:
      value?.speechMode === 'custom'
        ? 'custom'
        : DEFAULT_PET_PREFERENCES.speechMode,
    speechProvider: String(value?.speechProvider ?? '').trim(),
    speechVoice: String(value?.speechVoice ?? '').trim(),
    speechSpeed: boundedDecimal(value?.speechSpeed, 1, 0.5, 2),
    speechPitch: boundedDecimal(value?.speechPitch, 0, -12, 12, 1),
    speechVolume: boundedDecimal(value?.speechVolume, 1, 0, 1),
    personalitySlug:
      String(value?.personalitySlug || '').trim() ||
      DEFAULT_PET_PREFERENCES.personalitySlug,
    commentaryLens:
      value?.commentaryLens === 'progress' || value?.commentaryLens === 'tool'
        ? value.commentaryLens
        : DEFAULT_PET_PREFERENCES.commentaryLens,
    contextTurns: boundedNumber(value?.contextTurns, 3, 1, 10),
    toolTurns: boundedNumber(value?.toolTurns, 4, 0, 20),
    commentaryHistory: boundedNumber(value?.commentaryHistory, 5, 0, 20),
    delaySeconds: boundedNumber(value?.delaySeconds, 12, 3, 120),
    intervalSeconds: boundedNumber(value?.intervalSeconds, 45, 10, 600),
  }
}

export function petSpeechProfileFromConfig(
  config: Record<string, unknown> | null | undefined,
): PetSpeechProfile | null {
  const pet = recordValue(config?.pet)
  const speech = recordValue(pet.speech)
  if (!Object.keys(speech).length) return null
  return {
    enabled: speech.enabled !== false,
    mode: speech.mode === 'browser' ? 'browser' : 'hermes',
    provider: String(speech.provider ?? 'inherit').trim().toLowerCase(),
    voice: String(speech.voice ?? '').trim(),
    speed: boundedDecimal(speech.speed, 1, 0.5, 2),
    pitch: boundedDecimal(speech.pitch, 0, -12, 12, 1),
    volume: boundedDecimal(speech.volume, 1, 0, 1),
  }
}

function backendPetPitch(pitch: number): number {
  const clamped = Math.max(-12, Math.min(12, pitch))
  if (Math.abs(clamped) < 0.01) return 0
  const sign = clamped < 0 ? -1 : 1
  const magnitude = Math.abs(clamped) / 12
  return (sign * Math.round(12 * magnitude ** 1.7 * 10)) / 10
}

export function petTtsConfigOverride(
  speech: Pick<
    PetSpeechProfile,
    'provider' | 'voice' | 'speed' | 'pitch' | 'volume'
  >,
): Record<string, unknown> | undefined {
  const provider = speech.provider.trim().toLowerCase()
  const voice = speech.voice.trim()
  const config: Record<string, unknown> = {}
  if (provider && provider !== 'inherit') {
    config.provider = provider
    if (voice) {
      const voiceIdProviders = new Set([
        'elevenlabs',
        'minimax',
        'mistral',
        'xai',
      ])
      const knownProviders = new Set([
        'deepinfra',
        'edge',
        'elevenlabs',
        'gemini',
        'kittentts',
        'minimax',
        'mistral',
        'neutts',
        'openai',
        'piper',
        'xai',
      ])
      if (knownProviders.has(provider)) {
        config[provider] = {
          [voiceIdProviders.has(provider) ? 'voice_id' : 'voice']: voice,
        }
      } else {
        const customVoice = { voice }
        config.voice = voice
        config[provider] = customVoice
        config.providers = { [provider]: customVoice }
      }
    }
  }
  if (Math.abs(speech.speed - 1) >= 0.01) {
    config.speed = Math.max(0.5, Math.min(2, speech.speed))
  }
  const pitch = backendPetPitch(speech.pitch)
  if (Math.abs(pitch) >= 0.1) config.pitch = pitch
  if (Math.abs(speech.volume - 1) >= 0.01) {
    config.volume = Math.max(0, Math.min(1, speech.volume))
  }
  return Object.keys(config).length ? config : undefined
}

export function effectivePetSpeech(
  preferences: PetPreferences,
  desktop: PetSpeechProfile | null,
): {
  config?: Record<string, unknown>
  source: 'custom' | 'desktop' | 'host'
  speech: PetSpeechProfile
} {
  if (
    preferences.speechMode === 'desktop' &&
    desktop?.enabled &&
    desktop.mode === 'hermes'
  ) {
    return {
      config: petTtsConfigOverride(desktop),
      source: 'desktop',
      speech: desktop,
    }
  }
  if (preferences.speechMode === 'custom') {
    const custom: PetSpeechProfile = {
      enabled: true,
      mode: 'hermes',
      provider: preferences.speechProvider || 'inherit',
      voice: preferences.speechVoice,
      speed: preferences.speechSpeed,
      pitch: preferences.speechPitch,
      volume: preferences.speechVolume,
    }
    return {
      config: petTtsConfigOverride(custom),
      source: 'custom',
      speech: custom,
    }
  }
  const host: PetSpeechProfile = {
    enabled: true,
    mode: 'hermes',
    provider: 'inherit',
    voice: '',
    speed: 1,
    pitch: 0,
    volume: 1,
  }
  return { source: 'host', speech: host }
}

export function loadPetPreferences(connectionId: string): PetPreferences {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_PET_PREFERENCES }
  }
  try {
    return normalizePetPreferences(
      JSON.parse(localStorage.getItem(storageKey(connectionId)) || 'null'),
    )
  } catch {
    return { ...DEFAULT_PET_PREFERENCES }
  }
}

export function persistPetPreferences(
  connectionId: string,
  preferences: PetPreferences,
): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(
    storageKey(connectionId),
    JSON.stringify(normalizePetPreferences(preferences)),
  )
}

export function deriveMobilePetState(activity: PetActivity): MobilePetState {
  if (activity.error) return 'failed'
  if (activity.justCompleted) return 'wave'
  if (activity.awaitingInput) return 'waiting'
  if (activity.toolRunning) return 'run'
  if (activity.reasoning) return 'review'
  if (activity.busy) return 'run'
  return 'idle'
}

export function petShouldTravel(
  roam: boolean,
  state: MobilePetState,
): boolean {
  return roam && (state === 'idle' || state === 'run')
}

export function petContextFromTranscript(
  transcript: TranscriptItem[],
  turns = 3,
  toolTurns = 0,
): Array<{ role: 'assistant' | 'user'; content: string }> {
  const conversation = transcript
    .filter(
      item =>
        (item.kind === 'assistant' || item.kind === 'user') &&
        Boolean(item.text?.trim()),
    )
    .slice(-Math.max(1, Math.min(10, Math.round(turns))) * 2)
    .map(item => ({
      role: item.kind as 'assistant' | 'user',
      content: (item.text || '').slice(0, 4_000),
    }))
  const toolLimit = Math.max(0, Math.min(20, Math.round(toolTurns)))
  const toolContext = toolLimit
    ? transcript
        .filter(
          item =>
            item.kind === 'tool' &&
            item.tool &&
            (item.tool.args !== undefined ||
              item.tool.result !== undefined ||
              Boolean(item.tool.summary?.trim()) ||
              Boolean(item.tool.progress?.trim())),
        )
        .slice(-toolLimit)
        .map(item => {
          const args = clippedEvidence(item.tool?.args, 2_000)
          const result = clippedEvidence(
            item.tool?.result ?? item.tool?.summary ?? item.tool?.progress,
            3_000,
          )
          return {
            role: 'assistant' as const,
            content: [
              `Live tool activity: ${item.tool?.name || 'tool'} ${
                item.tool?.status === 'complete'
                  ? 'completed'
                  : item.tool?.status
              }.`,
              args.text
                ? `Arguments${args.truncated ? ' [clipped]' : ''}:\n${args.text}`
                : '',
              result.text
                ? `Result${result.truncated ? ' [clipped]' : ''}:\n${result.text}`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
          }
        })
    : []
  return [...conversation, ...toolContext]
}

function observerStatus(item: TranscriptItem): string {
  if (item.tool?.status === 'complete') return 'completed'
  if (item.tool?.status === 'failed') return 'failed'
  return 'started'
}

function observerCategory(name: string): string {
  const normalized = name.toLowerCase()
  if (/test|lint|compile|build|check/.test(normalized)) return 'validation'
  if (/read|search|find|list|view|inspect/.test(normalized)) return 'inspection'
  if (/publish|push|commit|release/.test(normalized)) return 'publication'
  if (/package|archive|zip|artifact/.test(normalized)) return 'packaging'
  if (/write|patch|edit|terminal|exec|apply/.test(normalized)) {
    return 'implementation'
  }
  return 'working'
}

function clippedEvidence(value: unknown, limit: number): {
  text: string
  truncated: boolean
} {
  const text = formatDisplayValue(value)
  return {
    text: text.slice(0, limit),
    truncated: text.length > limit,
  }
}

function observerTextHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function toolObserverCursor(
  item: TranscriptItem,
  args: ReturnType<typeof clippedEvidence>,
  result: ReturnType<typeof clippedEvidence>,
): string {
  return [
    item.id,
    item.tool?.name || 'tool',
    observerStatus(item),
    observerTextHash(args.text),
    args.truncated ? 'args-clipped' : 'args-complete',
    observerTextHash(result.text),
    result.truncated ? 'result-clipped' : 'result-complete',
  ].join(':')
}

export function petObserverFramesFromTranscript(
  transcript: TranscriptItem[],
  toolTurns: number,
  seenIds: Iterable<string> = [],
): PetObserverFrames {
  const seen = new Set(seenIds)
  const toolLimit = Math.max(0, Math.min(20, Math.round(toolTurns)))
  const tools = toolLimit
    ? transcript
        .filter(item => item.kind === 'tool' && item.tool)
        .slice(-toolLimit)
    : []
  const userDirections = transcript.filter(
    item => item.kind === 'user' && Boolean(item.text?.trim()),
  )
  const preparedTools = tools.map(item => {
    const args = clippedEvidence(item.tool?.args, 8_000)
    const result = clippedEvidence(
      item.tool?.result ?? item.tool?.summary ?? item.tool?.progress,
      12_000,
    )
    return {
      cursor: toolObserverCursor(item, args, result),
      item,
      row: {
        id: item.id,
        name: item.tool?.name || 'tool',
        status: observerStatus(item),
        arguments: args.text,
        result: result.text,
        argumentsTruncated: args.truncated,
        resultTruncated: result.truncated,
      },
    }
  })
  const ids = preparedTools.map(tool => tool.cursor)
  const newEventIds = preparedTools
    .filter(tool => !seen.has(tool.cursor))
    .map(tool => tool.item.id)
  const toolRows = preparedTools.map(tool => tool.row)
  const phase = transcript.some(
    item => item.kind === 'reasoning' && item.streaming,
  )
    ? 'planning'
    : tools.some(item => item.tool?.status === 'running')
      ? 'working'
      : tools.some(item => item.tool?.status === 'failed')
        ? 'blocked'
        : 'validation'
  return {
    ids,
    progress: {
      events: tools.map(item => ({
        id: item.id,
        category: observerCategory(item.tool?.name || ''),
        status: observerStatus(item),
        tool: item.tool?.name || 'tool',
      })),
      newEventIds,
      phaseEstimate: { value: phase },
    },
    tool: {
      initialUserDirection: userDirections[0]?.text?.slice(0, 20_000) || '',
      latestUserDirection:
        userDirections[userDirections.length - 1]?.text?.slice(0, 20_000) || '',
      newEventIds,
      tools: toolRows,
    },
  }
}

export function petToolObserverHasSettledNewEvidence(
  frame: PetObserverFrames['tool'],
): boolean {
  const newIds = new Set(frame.newEventIds)
  return frame.tools.some(
    tool =>
      newIds.has(tool.id) &&
      (tool.status === 'completed' || tool.status === 'failed'),
  )
}

export function petRowForState(
  info: MobilePetInfo,
  state: MobilePetState,
  direction: 'left' | 'right' = 'right',
): string {
  const available = new Set(info.stateRows ?? [])
  if (state === 'run') {
    const directional = `running-${direction}`
    if (available.has(directional)) return directional
    if (available.has('running')) return 'running'
  }
  if (available.has(state)) return state
  const aliases: Partial<Record<MobilePetState, string[]>> = {
    wave: ['waving', 'idle'],
    jump: ['jumping', 'idle'],
    review: ['review', 'idle'],
    waiting: ['waiting', 'idle'],
    failed: ['failed', 'idle'],
  }
  return aliases[state]?.find(row => available.has(row)) ?? 'idle'
}

export function petFrameCount(
  info: MobilePetInfo,
  row: string,
  state: MobilePetState,
): number {
  return Math.max(
    1,
    Math.round(
      info.framesByRow?.[row] ??
        info.framesByState?.[state] ??
        info.framesPerState ??
        1,
    ),
  )
}

export function randomPetLine(lines: string[] | undefined): string {
  if (!lines?.length) return ''
  return lines[Math.floor(Math.random() * lines.length)]?.trim() ?? ''
}
