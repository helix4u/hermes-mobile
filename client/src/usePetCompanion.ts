import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { isMissingCapabilityError } from './capability-errors'
import { resolvePetCapabilityProbe } from './pet-host-capabilities'
import type { JsonRpcGatewayClient } from './protocol/json-rpc-client'
import {
  BUILTIN_ALIEN_CHILD_INFO,
  BUILTIN_ALIEN_CHILD_PERSONALITY,
  BUILTIN_ALIEN_CHILD_SUMMARY,
  CHECKING_PET_HOST_CAPABILITIES,
  compactPetBubbleText,
  deriveMobilePetState,
  effectivePetSpeech,
  FULL_PET_HOST_CAPABILITIES,
  loadPetPreferences,
  normalizePetPreferences,
  petObserverFramesFromTranscript,
  petSidechatPrompt,
  persistPetPreferences,
  petContextFromTranscript,
  petSpeechProfileFromConfig,
  petToolObserverHasSettledNewEvidence,
  randomPetLine,
  resolvePetRuntimeSession,
  type MobilePetInfo,
  type PetHostCapabilities,
  type PetPersonalityData,
  type PetPersonalitySummary,
  type PetPreferences,
  type PetSpeechProfile,
  VISUAL_ONLY_PET_HOST_CAPABILITIES,
} from './pet'
import type { TranscriptItem } from './state/transcript'
import type { HermesTransport } from './transport/hermes-transport'

interface UsePetCompanionOptions {
  connected: boolean
  connectionId: string
  ensureSession: () => Promise<string>
  gateway: JsonRpcGatewayClient | null
  profile: string
  runtimeSessionId: string
  transcript: TranscriptItem[]
  transport: HermesTransport | null
  turnActive: boolean
  speak: (
    text: string,
    id: string,
    ttsConfig?: Record<string, unknown>,
  ) => void | Promise<void>
}

function eventId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `pet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function usePetCompanion({
  connected,
  connectionId,
  ensureSession,
  gateway,
  profile,
  runtimeSessionId,
  speak,
  transcript,
  transport,
  turnActive,
}: UsePetCompanionOptions) {
  const [preferences, setPreferences] = useState(() =>
    loadPetPreferences(connectionId),
  )
  const preferencesRef = useRef(preferences)
  preferencesRef.current = preferences
  const [info, setInfo] = useState<MobilePetInfo>(BUILTIN_ALIEN_CHILD_INFO)
  const [catalog, setCatalog] = useState<PetPersonalitySummary[]>([
    BUILTIN_ALIEN_CHILD_SUMMARY,
  ])
  const [personality, setPersonality] = useState<PetPersonalityData | null>(
    BUILTIN_ALIEN_CHILD_PERSONALITY,
  )
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  const [hostCapabilities, setHostCapabilities] =
    useState<PetHostCapabilities>(VISUAL_ONLY_PET_HOST_CAPABILITIES)
  const [error, setError] = useState('')
  const [bubble, setBubble] = useState('')
  const [justCompleted, setJustCompleted] = useState(false)
  const [desktopSpeech, setDesktopSpeech] = useState<PetSpeechProfile | null>(
    null,
  )
  const [desktopSpeechStatus, setDesktopSpeechStatus] = useState<
    'idle' | 'loading' | 'ready' | 'missing'
  >('idle')
  const [sidechatMessages, setSidechatMessages] = useState<
    Array<{ id: string; role: 'assistant' | 'user'; text: string; timestamp?: number }>
  >([])
  const [sidechatBusy, setSidechatBusy] = useState(false)
  const [sidechatError, setSidechatError] = useState('')
  const recentRef = useRef<string[]>([])
  const observerIdsRef = useRef<string[]>([])
  const observerSignatureRef = useRef('')
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generatingRef = useRef(false)
  const turnActiveRef = useRef(turnActive)
  const sidechatBusyRef = useRef(false)
  const observerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generateCommentaryRef = useRef<(force?: boolean) => Promise<void>>(
    async () => {},
  )
  const activeConnectionIdRef = useRef(connectionId)
  activeConnectionIdRef.current = connectionId

  useLayoutEffect(() => {
    const nextPreferences = loadPetPreferences(connectionId)
    preferencesRef.current = nextPreferences
    setPreferences(nextPreferences)
    setInfo(BUILTIN_ALIEN_CHILD_INFO)
    setCatalog([BUILTIN_ALIEN_CHILD_SUMMARY])
    setPersonality(BUILTIN_ALIEN_CHILD_PERSONALITY)
    setHostCapabilities(
      connected
        ? CHECKING_PET_HOST_CAPABILITIES
        : VISUAL_ONLY_PET_HOST_CAPABILITIES,
    )
    recentRef.current = []
    observerIdsRef.current = []
    observerSignatureRef.current = ''
    generatingRef.current = false
    sidechatBusyRef.current = false
    setSidechatBusy(false)
    setDesktopSpeech(null)
    setSidechatMessages([])
    setSidechatError('')
    setError('')
  }, [connected, connectionId])

  const updatePreferences = useCallback(
    (patch: Partial<PetPreferences>) => {
      setPreferences(current => {
        const next = normalizePetPreferences({ ...current, ...patch })
        persistPetPreferences(connectionId, next)
        return next
      })
    },
    [connectionId],
  )

  const showBubble = useCallback((text: string) => {
    const clean = text.trim()
    if (!clean) return
    setBubble(clean)
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    bubbleTimerRef.current = setTimeout(() => setBubble(''), 8_000)
  }, [])

  const record = useCallback(
    async (text: string, source: 'generated' | 'interaction') => {
      if (
        !hostCapabilities.commentary ||
        !gateway ||
        !runtimeSessionId ||
        !text.trim()
      ) {
        return
      }
      try {
        await gateway.request('pet.commentary.record', {
          eventId: eventId(),
          lens: preferences.commentaryLens,
          personalityId: personality?.id || preferences.personalitySlug,
          personalityName: personality?.displayName || '',
          profile,
          session_id: runtimeSessionId,
          source,
          text: text.trim(),
        })
      } catch {
        // Commentary persistence is cosmetic and must never interrupt chat.
      }
    },
    [
      gateway,
      hostCapabilities.commentary,
      personality,
      preferences.commentaryLens,
      preferences.personalitySlug,
      profile,
      runtimeSessionId,
    ],
  )

  const speech = useMemo(
    () => effectivePetSpeech(preferences, desktopSpeech),
    [desktopSpeech, preferences],
  )
  const speechRef = useRef(speech)
  speechRef.current = speech

  const publish = useCallback(
    (text: string, source: 'generated' | 'interaction') => {
      const clean = text.trim()
      if (!clean) return
      showBubble(clean)
      recentRef.current = [...recentRef.current.filter(row => row !== clean), clean].slice(-12)
      if (preferencesRef.current.speakCommentary) {
        void speak(clean, `pet-${source}`, speechRef.current.config)
      }
      void record(clean, source)
    },
    [record, showBubble, speak],
  )

  const refreshDesktopSpeech = useCallback(async () => {
    if (!connected || !transport) {
      setDesktopSpeech(null)
      setDesktopSpeechStatus('idle')
      return
    }
    setDesktopSpeechStatus('loading')
    const requestedConnectionId = connectionId
    const query =
      profile && profile !== 'default'
        ? `?profile=${encodeURIComponent(profile)}`
        : ''
    try {
      const config = await transport.requestJson<Record<string, unknown>>(
        `/api/config${query}`,
      )
      if (activeConnectionIdRef.current !== requestedConnectionId) return
      const configured = petSpeechProfileFromConfig(config)
      setDesktopSpeech(configured)
      setDesktopSpeechStatus(configured ? 'ready' : 'missing')
    } catch {
      if (activeConnectionIdRef.current !== requestedConnectionId) return
      setDesktopSpeech(null)
      setDesktopSpeechStatus('missing')
    }
  }, [connected, connectionId, profile, transport])

  useEffect(() => {
    void refreshDesktopSpeech()
    if (!connected || preferences.speechMode !== 'desktop') return
    const interval = setInterval(() => {
      void refreshDesktopSpeech()
    }, 15_000)
    return () => clearInterval(interval)
  }, [connected, preferences.speechMode, refreshDesktopSpeech])

  useEffect(() => {
    if (!connected || !gateway) {
      setInfo(BUILTIN_ALIEN_CHILD_INFO)
      setCatalog([BUILTIN_ALIEN_CHILD_SUMMARY])
      setPersonality(BUILTIN_ALIEN_CHILD_PERSONALITY)
      setHostCapabilities(VISUAL_ONLY_PET_HOST_CAPABILITIES)
      setStatus('ready')
      return
    }
    let active = true
    setStatus('loading')
    setHostCapabilities(CHECKING_PET_HOST_CAPABILITIES)
    setError('')
    void Promise.allSettled([
      gateway.request<MobilePetInfo>('pet.info', { profile }),
      gateway
        .request<{ personalities?: PetPersonalitySummary[] }>(
          'pet.personality.list',
          { profile },
        ),
    ])
      .then(async ([infoResult, personalityResult]) => {
        if (!active) return
        if (personalityResult.status === 'rejected') {
          const probe = resolvePetCapabilityProbe(personalityResult)
          setInfo(BUILTIN_ALIEN_CHILD_INFO)
          setCatalog([BUILTIN_ALIEN_CHILD_SUMMARY])
          setPersonality(BUILTIN_ALIEN_CHILD_PERSONALITY)
          setHostCapabilities(probe.capabilities)
          setStatus('ready')
          setError(probe.error)
          return
        }
        const nextInfo =
          infoResult.status === 'fulfilled'
            ? infoResult.value
            : BUILTIN_ALIEN_CHILD_INFO
        const listed = personalityResult.value
        const hostPersonalities = (listed.personalities ?? []).filter(
          row => row.valid,
        )
        const personalities = [
          hostPersonalities.find(row => row.slug === 'alien-child') ??
            BUILTIN_ALIEN_CHILD_SUMMARY,
          ...hostPersonalities.filter(row => row.slug !== 'alien-child'),
        ]
        const chosen =
          personalities.find(row => row.slug === preferences.personalitySlug) ??
          personalities.find(row => row.slug === 'alien-child') ??
          personalities[0]
        setInfo(
          nextInfo.enabled &&
            nextInfo.slug === 'alien-child' &&
            Boolean(nextInfo.spritesheetBase64)
            ? nextInfo
            : BUILTIN_ALIEN_CHILD_INFO,
        )
        setCatalog(personalities)
        setHostCapabilities(
          resolvePetCapabilityProbe(personalityResult).capabilities,
        )
        let loaded: { ok: boolean; personality: PetPersonalityData }
        try {
          loaded = await gateway.request<{
            ok: boolean
            personality: PetPersonalityData
          }>('pet.personality.get', { profile, slug: chosen.slug })
        } catch {
          if (chosen.slug !== 'alien-child') {
            throw new Error(`Could not load pet personality '${chosen.slug}'.`)
          }
          loaded = {
            ok: true,
            personality: BUILTIN_ALIEN_CHILD_PERSONALITY,
          }
        }
        if (!active) return
        setPersonality(loaded.personality)
        setStatus('ready')
      })
      .catch(loadError => {
        if (!active) return
        setInfo(BUILTIN_ALIEN_CHILD_INFO)
        setCatalog([BUILTIN_ALIEN_CHILD_SUMMARY])
        setPersonality(BUILTIN_ALIEN_CHILD_PERSONALITY)
        setHostCapabilities(VISUAL_ONLY_PET_HOST_CAPABILITIES)
        setStatus('ready')
        if (!isMissingCapabilityError(loadError)) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        }
      })
    return () => {
      active = false
    }
  }, [
    connected,
    gateway,
    preferences.personalitySlug,
    profile,
    updatePreferences,
  ])

  useEffect(() => {
    if (
      !gateway ||
      status !== 'ready' ||
      !hostCapabilities.personalities
    ) {
      return
    }
    if (
      preferences.personalitySlug === 'alien-child' &&
      !catalog.some(
        row =>
          row.slug === 'alien-child' &&
          row.path !== BUILTIN_ALIEN_CHILD_SUMMARY.path,
      )
    ) {
      setPersonality(BUILTIN_ALIEN_CHILD_PERSONALITY)
      return
    }
    let active = true
    void gateway
      .request<{ personality: PetPersonalityData }>('pet.personality.get', {
        profile,
        slug: preferences.personalitySlug,
      })
      .then(result => {
        if (active) setPersonality(result.personality)
      })
      .catch(loadError => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        }
      })
    return () => {
      active = false
    }
  }, [
    catalog,
    gateway,
    hostCapabilities.personalities,
    preferences.personalitySlug,
    profile,
    status,
  ])

  const generateCommentary = useCallback(async (force = false) => {
    if (
      generatingRef.current ||
      !hostCapabilities.commentary ||
      !gateway ||
      !runtimeSessionId ||
      !personality?.commentary?.prompt
    ) {
      return
    }
    const lens = preferences.commentaryLens
    const frames = petObserverFramesFromTranscript(
      transcript,
      preferences.toolTurns,
      observerIdsRef.current,
    )
    const observerSignature = JSON.stringify(
      lens === 'progress'
        ? frames.progress
        : lens === 'tool'
          ? frames.tool
          : [],
    )
    if (
      !force &&
      lens !== 'companion' &&
      (!frames.progress.newEventIds.length ||
        observerSignature === observerSignatureRef.current ||
        (lens === 'tool' &&
          !petToolObserverHasSettledNewEvidence(frames.tool)))
    ) {
      return
    }
    generatingRef.current = true
    const requestedConnectionId = connectionId
    try {
      const result = await gateway.request<{ ok: boolean; text: string }>(
        'pet.commentary.generate',
        {
          activity: turnActive
            ? 'Hermes is working on the current request.'
            : 'Hermes is ready.',
          context:
            lens === 'companion'
              ? petContextFromTranscript(
                  transcript,
                  preferences.contextTurns,
                  preferences.toolTurns,
                )
              : [],
          lens,
          maxCharacters: personality.commentary.maxCharacters || 180,
          ...(lens === 'progress'
            ? { observerFrame: frames.progress }
            : lens === 'tool'
              ? { toolObserverFrame: frames.tool }
              : {}),
          profile,
          prompt: personality.commentary.prompt,
          recentCommentary: recentRef.current.slice(
            -preferences.commentaryHistory,
          ),
        },
        { timeoutMs: 60_000 },
      )
      if (activeConnectionIdRef.current !== requestedConnectionId) return
      if (result.ok && result.text) {
        observerIdsRef.current = frames.ids
        observerSignatureRef.current = observerSignature
        publish(result.text, 'generated')
      }
    } catch (commentaryError) {
      if (activeConnectionIdRef.current !== requestedConnectionId) return
      setError(
        commentaryError instanceof Error
          ? commentaryError.message
          : String(commentaryError),
      )
    } finally {
      if (activeConnectionIdRef.current === requestedConnectionId) {
        generatingRef.current = false
      }
    }
  }, [
    gateway,
    connectionId,
    hostCapabilities.commentary,
    personality,
    preferences.commentaryHistory,
    preferences.commentaryLens,
    preferences.contextTurns,
    preferences.toolTurns,
    profile,
    publish,
    runtimeSessionId,
    transcript,
    turnActive,
  ])

  useEffect(() => {
    generateCommentaryRef.current = generateCommentary
  }, [generateCommentary])

  useEffect(() => {
    if (
      !turnActive ||
      !connected ||
      !preferences.commentary ||
      !hostCapabilities.commentary ||
      status !== 'ready' ||
      !runtimeSessionId
    ) {
      return
    }
    const first = setTimeout(
      () => void generateCommentaryRef.current(false),
      preferences.delaySeconds * 1_000,
    )
    const repeating = setInterval(
      () => void generateCommentaryRef.current(false),
      preferences.intervalSeconds * 1_000,
    )
    return () => {
      clearTimeout(first)
      clearInterval(repeating)
    }
  }, [
    connected,
    hostCapabilities.commentary,
    preferences.commentary,
    preferences.delaySeconds,
    preferences.intervalSeconds,
    runtimeSessionId,
    status,
    turnActive,
  ])

  useEffect(() => {
    if (
      !turnActive ||
      !connected ||
      !preferences.commentary ||
      !hostCapabilities.commentary ||
      preferences.commentaryLens === 'companion' ||
      status !== 'ready' ||
      !runtimeSessionId
    ) {
      if (observerTimerRef.current) {
        clearTimeout(observerTimerRef.current)
        observerTimerRef.current = null
      }
      return
    }
    if (!observerTimerRef.current) {
      observerTimerRef.current = setTimeout(() => {
        observerTimerRef.current = null
        void generateCommentaryRef.current(false)
      }, 900)
    }
  }, [
    connected,
    hostCapabilities.commentary,
    preferences.commentary,
    preferences.commentaryLens,
    runtimeSessionId,
    status,
    transcript,
    turnActive,
  ])

  useEffect(() => {
    if (turnActiveRef.current && !turnActive) {
      setJustCompleted(true)
      const timer = setTimeout(() => setJustCompleted(false), 1_600)
      turnActiveRef.current = turnActive
      return () => clearTimeout(timer)
    }
    turnActiveRef.current = turnActive
  }, [turnActive])

  const awaitingInput = transcript.some(
    item => item.kind === 'request' && !item.request?.answered,
  )
  const toolRunning = transcript.some(
    item => item.kind === 'tool' && item.tool?.status === 'running',
  )
  const reasoning = transcript.some(
    item => item.kind === 'reasoning' && item.streaming,
  )
  const state = useMemo(
    () =>
      deriveMobilePetState({
        awaitingInput,
        busy: turnActive,
        justCompleted,
        reasoning,
        toolRunning,
      }),
    [awaitingInput, justCompleted, reasoning, toolRunning, turnActive],
  )

  const interact = useCallback(() => {
    const line =
      randomPetLine(personality?.interactions?.click) ||
      randomPetLine(personality?.lines[state]) ||
      randomPetLine(personality?.lines.idle)
    if (line) publish(line, 'interaction')
  }, [personality, publish, state])

  const previewVoice = useCallback(() => {
    const line =
      randomPetLine(personality?.interactions?.click) ||
      `Hey. ${personality?.displayName || info.displayName || 'Your pet'} is here.`
    showBubble(line)
    void speak(line, 'pet-voice-preview', speechRef.current.config)
  }, [info.displayName, personality, showBubble, speak])

  const loadSidechat = useCallback(async () => {
    if (!hostCapabilities.sidechat) {
      setSidechatMessages([])
      setSidechatError('Pet sidechat is not available on this Hermes host.')
      return
    }
    if (!gateway || !runtimeSessionId) {
      setSidechatMessages([])
      setSidechatError(
        gateway
          ? 'Send a message to attach this sidechat to a Hermes session.'
          : 'Reconnect to Hermes to use pet sidechat.',
      )
      return
    }
    try {
      const result = await gateway.request<{
        messages?: Array<{
          id: string
          role: 'assistant' | 'user'
          text: string
          timestamp?: number
        }>
      }>('pet.sidechat.history', { profile, session_id: runtimeSessionId })
      setSidechatMessages(result.messages ?? [])
      setSidechatError('')
    } catch (loadError) {
      setSidechatError(loadError instanceof Error ? loadError.message : String(loadError))
    }
  }, [gateway, hostCapabilities.sidechat, profile, runtimeSessionId])

  const sendSidechat = useCallback(async (rawText: string) => {
    const text = rawText.trim()
    if (!text || sidechatBusyRef.current) return false
    if (!hostCapabilities.sidechat) {
      setSidechatError('Pet sidechat is not available on this Hermes host.')
      return false
    }
    if (!gateway) {
      setSidechatError('Reconnect to Hermes to use pet sidechat.')
      return false
    }
    sidechatBusyRef.current = true
    const requestedConnectionId = connectionId
    setSidechatBusy(true)
    setSidechatError('')
    const optimistic = {
      id: `local-${eventId()}`,
      role: 'user' as const,
      text,
    }
    setSidechatMessages(current => [...current, optimistic])
    try {
      const sessionId = await resolvePetRuntimeSession(
        runtimeSessionId,
        ensureSession,
      )
      const result = await gateway.request<{
        messages?: Array<{
          id: string
          role: 'assistant' | 'user'
          text: string
          timestamp?: number
        }>
        reply?: string
      }>('pet.sidechat.submit', {
        context: petContextFromTranscript(
          transcript,
          preferences.contextTurns,
          preferences.toolTurns,
        ),
        personalityId: personality?.id || preferences.personalitySlug,
        personalityName: personality?.displayName || info.displayName,
        profile,
        prompt: petSidechatPrompt(personality, info.displayName),
        session_id: sessionId,
        text,
        turnId: `mobile-${eventId()}`,
      }, { timeoutMs: 180_000 })
      if (activeConnectionIdRef.current !== requestedConnectionId) return false
      const stored = result.messages ?? [
        optimistic,
        {
          id: `reply-${eventId()}`,
          role: 'assistant' as const,
          text: result.reply ?? '',
        },
      ]
      setSidechatMessages(current => [
        ...current.filter(message => message.id !== optimistic.id),
        ...stored,
      ])
      const reply = result.reply || stored.find(message => message.role === 'assistant')?.text
      if (reply) {
        showBubble(compactPetBubbleText(reply))
        if (preferencesRef.current.speakCommentary) {
          void speak(reply, 'pet-sidechat', speechRef.current.config)
        }
      }
      return true
    } catch (sendError) {
      setSidechatMessages(current =>
        current.filter(message => message.id !== optimistic.id),
      )
      setSidechatError(sendError instanceof Error ? sendError.message : String(sendError))
      return false
    } finally {
      if (activeConnectionIdRef.current === requestedConnectionId) {
        sidechatBusyRef.current = false
        setSidechatBusy(false)
      }
    }
  }, [
    ensureSession,
    connectionId,
    gateway,
    hostCapabilities.sidechat,
    info.displayName,
    personality,
    preferences.contextTurns,
    preferences.personalitySlug,
    preferences.toolTurns,
    profile,
    runtimeSessionId,
    showBubble,
    speak,
    transcript,
  ])

  const resetSidechat = useCallback(async () => {
    if (sidechatBusyRef.current) return
    if (!hostCapabilities.sidechat) {
      setSidechatError('Pet sidechat is not available on this Hermes host.')
      return
    }
    if (!gateway || !runtimeSessionId) {
      setSidechatError(
        gateway
          ? 'Send a message to attach this sidechat to a Hermes session.'
          : 'Reconnect to Hermes to use pet sidechat.',
      )
      return
    }
    sidechatBusyRef.current = true
    setSidechatBusy(true)
    try {
      await gateway.request('pet.sidechat.reset', {
        profile,
        session_id: runtimeSessionId,
      })
      setSidechatMessages([])
      setSidechatError('')
    } catch (resetError) {
      setSidechatError(resetError instanceof Error ? resetError.message : String(resetError))
    } finally {
      sidechatBusyRef.current = false
      setSidechatBusy(false)
    }
  }, [gateway, hostCapabilities.sidechat, profile, runtimeSessionId])

  useEffect(
    () => () => {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      if (observerTimerRef.current) clearTimeout(observerTimerRef.current)
    },
    [],
  )

  return {
    bubble,
    catalog,
    desktopSpeech,
    desktopSpeechStatus,
    error,
    generateCommentary: () => generateCommentary(true),
    hostCapabilities,
    info,
    interact,
    personality,
    preferences,
    previewVoice,
    refreshDesktopSpeech,
    speech,
    sidechat: {
      busy: sidechatBusy,
      error: sidechatError,
      load: loadSidechat,
      messages: sidechatMessages,
      reset: resetSidechat,
      send: sendSidechat,
    },
    state,
    status,
    updatePreferences,
  }
}
