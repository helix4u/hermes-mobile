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
  applyPetPersonalityOverride,
  BUILTIN_ALIEN_CHILD_INFO,
  BUILTIN_ALIEN_CHILD_PERSONALITY,
  BUILTIN_MOBILE_PET_CATALOG,
  builtinMobilePetPersonality,
  CHECKING_PET_HOST_CAPABILITIES,
  compactPetBubbleText,
  createPetCommentaryRequestGate,
  deriveMobilePetState,
  effectivePetSpeech,
  FULL_PET_HOST_CAPABILITIES,
  loadPetPersonalityOverrides,
  loadPetPreferences,
  normalizePetPreferences,
  petObserverFramesFromTranscript,
  petPersonalityOverrideFromData,
  petSidechatPrompt,
  persistPetPersonalityOverrides,
  persistPetPreferences,
  petContextFromTranscript,
  petSpeechProfileFromConfig,
  petToolObserverHasSettledNewEvidence,
  randomPetLine,
  resolvePetRuntimeSession,
  type MobilePetInfo,
  type PetHostCapabilities,
  type PetPersonalityData,
  type PetPersonalityOverride,
  type PetPersonalityOverrides,
  type PetPersonalitySummary,
  type PetPreferences,
  type PetSpeechProfile,
  VISUAL_ONLY_PET_HOST_CAPABILITIES,
} from './pet'
import type { TranscriptItem } from './state/transcript'
import type { HermesTransport } from './transport/hermes-transport'
import type {
  PreparedSpeechSequence,
  SpeechPreparationOptions,
  SpeechSequenceItem,
  SpeechSequenceOptions,
} from './voice'

interface UsePetCompanionOptions {
  connected: boolean
  connectionId: string
  ensureSession: () => Promise<string>
  gateway: JsonRpcGatewayClient | null
  profile: string
  prepareSpeechSequence: (
    speechId: string,
    ttsConfig?: Record<string, unknown>,
    options?: SpeechPreparationOptions,
  ) => PreparedSpeechSequence | null
  runtimeSessionId: string
  transcript: TranscriptItem[]
  transport: HermesTransport | null
  turnActive: boolean
  speakSequence: (
    items: SpeechSequenceItem[],
    options?: SpeechSequenceOptions,
  ) => Promise<void>
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
  prepareSpeechSequence,
  runtimeSessionId,
  speakSequence,
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
  const [catalog, setCatalog] = useState<PetPersonalitySummary[]>(
    BUILTIN_MOBILE_PET_CATALOG,
  )
  const [basePersonality, setBasePersonality] = useState<PetPersonalityData | null>(
    BUILTIN_ALIEN_CHILD_PERSONALITY,
  )
  const [personalityOverrides, setPersonalityOverrides] =
    useState<PetPersonalityOverrides>(() =>
      loadPetPersonalityOverrides(connectionId),
    )
  const personality = useMemo(
    () =>
      basePersonality
        ? applyPetPersonalityOverride(
            basePersonality,
            personalityOverrides[basePersonality.id],
          )
        : null,
    [basePersonality, personalityOverrides],
  )
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  const [petRevision, setPetRevision] = useState(0)
  const [hostCapabilities, setHostCapabilities] =
    useState<PetHostCapabilities>(VISUAL_ONLY_PET_HOST_CAPABILITIES)
  const [error, setError] = useState('')
  const [bubble, setBubble] = useState('')
  const [speaking, setSpeaking] = useState(false)
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
  const firstCommentaryTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatingCommentaryTimerRef =
    useRef<ReturnType<typeof setInterval> | null>(null)
  const commentaryGateRef = useRef(createPetCommentaryRequestGate())
  const currentTurnActiveRef = useRef(turnActive)
  currentTurnActiveRef.current = turnActive
  const previousTurnActiveRef = useRef(turnActive)
  const pendingPetWorkRef = useRef(0)
  const pendingPetWaitersRef = useRef<Array<() => void>>([])
  const activeSpeechBubbleRef = useRef('')
  const deferredAutomaticCommentaryRef = useRef(false)
  const sidechatBusyRef = useRef(false)
  const observerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generateCommentaryRef = useRef<(force?: boolean) => Promise<void>>(
    async () => {},
  )
  const activeConnectionIdRef = useRef(connectionId)
  activeConnectionIdRef.current = connectionId

  const settlePendingPetWork = useCallback(() => {
    pendingPetWorkRef.current = Math.max(0, pendingPetWorkRef.current - 1)
    if (pendingPetWorkRef.current) return
    const waiters = pendingPetWaitersRef.current.splice(0)
    for (const resolve of waiters) resolve()
  }, [])

  const beginPendingPetWork = useCallback(() => {
    pendingPetWorkRef.current += 1
    let settled = false
    return () => {
      if (settled) return
      settled = true
      settlePendingPetWork()
    }
  }, [settlePendingPetWork])

  const waitForSpeechPriority = useCallback(() => {
    if (!pendingPetWorkRef.current) return Promise.resolve()
    return new Promise<void>(resolve => {
      pendingPetWaitersRef.current.push(resolve)
    })
  }, [])

  const clearCommentarySchedule = useCallback(() => {
    if (firstCommentaryTimerRef.current) {
      clearTimeout(firstCommentaryTimerRef.current)
      firstCommentaryTimerRef.current = null
    }
    if (repeatingCommentaryTimerRef.current) {
      clearInterval(repeatingCommentaryTimerRef.current)
      repeatingCommentaryTimerRef.current = null
    }
    if (observerTimerRef.current) {
      clearTimeout(observerTimerRef.current)
      observerTimerRef.current = null
    }
  }, [])

  const finishTurnCommentary = clearCommentarySchedule

  const cancelCommentary = useCallback(
    (clearBubble = false) => {
      commentaryGateRef.current.cancel()
      clearCommentarySchedule()
      if (clearBubble) {
        if (bubbleTimerRef.current) {
          clearTimeout(bubbleTimerRef.current)
          bubbleTimerRef.current = null
        }
        setBubble('')
      }
    },
    [clearCommentarySchedule],
  )

  useLayoutEffect(() => {
    cancelCommentary(true)
    pendingPetWorkRef.current = 0
    for (const resolve of pendingPetWaitersRef.current.splice(0)) resolve()
    activeSpeechBubbleRef.current = ''
    deferredAutomaticCommentaryRef.current = false
    setSpeaking(false)
    const nextPreferences = loadPetPreferences(connectionId)
    const nextOverrides = loadPetPersonalityOverrides(connectionId)
    preferencesRef.current = nextPreferences
    setPreferences(nextPreferences)
    setPersonalityOverrides(nextOverrides)
    setInfo(BUILTIN_ALIEN_CHILD_INFO)
    setCatalog(BUILTIN_MOBILE_PET_CATALOG)
    setBasePersonality(
      builtinMobilePetPersonality(nextPreferences.personalitySlug) ??
        BUILTIN_ALIEN_CHILD_PERSONALITY,
    )
    setHostCapabilities(
      connected
        ? CHECKING_PET_HOST_CAPABILITIES
        : VISUAL_ONLY_PET_HOST_CAPABILITIES,
    )
    recentRef.current = []
    observerIdsRef.current = []
    observerSignatureRef.current = ''
    sidechatBusyRef.current = false
    setSidechatBusy(false)
    setDesktopSpeech(null)
    setSidechatMessages([])
    setSidechatError('')
    setError('')
  }, [cancelCommentary, connected, connectionId])

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

  const updatePersonality = useCallback(
    (patch: Partial<PetPersonalityOverride>) => {
      if (!basePersonality) return
      setPersonalityOverrides(current => {
        const slug = basePersonality.id
        const next = {
          ...(current[slug] ??
            petPersonalityOverrideFromData(basePersonality)),
          ...patch,
        }
        const updated = { ...current, [slug]: next }
        persistPetPersonalityOverrides(connectionId, updated)
        return updated
      })
    },
    [basePersonality, connectionId],
  )

  const resetPersonality = useCallback(() => {
    if (!basePersonality) return
    setPersonalityOverrides(current => {
      const updated = { ...current }
      delete updated[basePersonality.id]
      persistPetPersonalityOverrides(connectionId, updated)
      return updated
    })
  }, [basePersonality, connectionId])

  const showBubble = useCallback((text: string, durationMs = 8_000) => {
    const clean = text.trim()
    if (!clean) return
    setBubble(clean)
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    bubbleTimerRef.current = null
    if (durationMs > 0) {
      bubbleTimerRef.current = setTimeout(() => setBubble(''), durationMs)
    }
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

  const speakPet = useCallback(
    async (
      text: string,
      speechId: string,
      options: {
        bubbleText?: string
        queueKey?: string
        replaceQueued?: boolean
      } = {},
    ) => {
      const clean = text.trim()
      if (!clean) return
      const releasePending = beginPendingPetWork()
      const bubbleOwner = eventId()
      let playbackStarted = false
      try {
        await speakSequence(
          [
            {
              id: speechId,
              text: clean,
              ttsConfig: speechRef.current.config,
              fallbackTtsConfigs: speechRef.current.config
                ? [undefined]
                : [],
            },
          ],
          {
            onPlaybackEnd: () => {
              if (activeSpeechBubbleRef.current === bubbleOwner) {
                setSpeaking(false)
              }
            },
            onPlaybackStart: () => {
              playbackStarted = true
              activeSpeechBubbleRef.current = bubbleOwner
              showBubble(options.bubbleText || clean, 0)
              setSpeaking(true)
            },
            priority: 20,
            queueKey: options.queueKey || speechId,
            replaceQueued: options.replaceQueued,
            speechId,
          },
        )
      } finally {
        if (activeSpeechBubbleRef.current === bubbleOwner) {
          activeSpeechBubbleRef.current = ''
          setSpeaking(false)
          setBubble('')
        } else if (!playbackStarted) {
          showBubble(options.bubbleText || clean)
        }
        releasePending()
        if (
          deferredAutomaticCommentaryRef.current &&
          currentTurnActiveRef.current &&
          pendingPetWorkRef.current === 0
        ) {
          deferredAutomaticCommentaryRef.current = false
          queueMicrotask(() => void generateCommentaryRef.current(false))
        }
      }
    },
    [beginPendingPetWork, showBubble, speakSequence],
  )

  const publish = useCallback(
    (text: string, source: 'generated' | 'interaction') => {
      const clean = text.trim()
      if (!clean) return
      recentRef.current = [...recentRef.current.filter(row => row !== clean), clean].slice(-12)
      if (preferencesRef.current.speakCommentary) {
        void speakPet(clean, `pet-${source}:${eventId()}`, {
          queueKey: source === 'interaction' ? 'pet-interaction' : undefined,
          replaceQueued: source === 'interaction',
        })
      } else {
        showBubble(clean)
      }
      void record(clean, source)
    },
    [record, showBubble, speakPet],
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
      setCatalog(BUILTIN_MOBILE_PET_CATALOG)
      setBasePersonality(
        builtinMobilePetPersonality(preferences.personalitySlug) ??
          BUILTIN_ALIEN_CHILD_PERSONALITY,
      )
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
          setCatalog(BUILTIN_MOBILE_PET_CATALOG)
          setBasePersonality(
            builtinMobilePetPersonality(preferences.personalitySlug) ??
              BUILTIN_ALIEN_CHILD_PERSONALITY,
          )
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
        const bundledSlugs = new Set(
          BUILTIN_MOBILE_PET_CATALOG.map(row => row.slug),
        )
        const personalities = [
          ...BUILTIN_MOBILE_PET_CATALOG,
          ...hostPersonalities
            .filter(row => !bundledSlugs.has(row.slug))
            .map(row => ({ ...row, source: 'host' as const })),
        ]
        const chosen =
          personalities.find(row => row.slug === preferences.personalitySlug) ??
          personalities.find(row => row.slug === 'alien-child') ??
          personalities[0]
        setInfo(
          nextInfo.enabled &&
            Boolean(nextInfo.spritesheetBase64 || nextInfo.spritesheetUrl)
            ? nextInfo
            : infoResult.status === 'fulfilled'
              ? { ...BUILTIN_ALIEN_CHILD_INFO, enabled: nextInfo.enabled }
              : BUILTIN_ALIEN_CHILD_INFO,
        )
        setCatalog(personalities)
        setHostCapabilities(
          resolvePetCapabilityProbe(personalityResult).capabilities,
        )
        let loaded: { ok: boolean; personality: PetPersonalityData }
        const bundled = builtinMobilePetPersonality(chosen.slug)
        if (bundled) {
          loaded = { ok: true, personality: bundled }
        } else {
          loaded = await gateway.request<{
            ok: boolean
            personality: PetPersonalityData
          }>('pet.personality.get', { profile, slug: chosen.slug })
        }
        if (!active) return
        setBasePersonality(loaded.personality)
        setStatus('ready')
      })
      .catch(loadError => {
        if (!active) return
        setInfo(BUILTIN_ALIEN_CHILD_INFO)
        setCatalog(BUILTIN_MOBILE_PET_CATALOG)
        setBasePersonality(
          builtinMobilePetPersonality(preferences.personalitySlug) ??
            BUILTIN_ALIEN_CHILD_PERSONALITY,
        )
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
    petRevision,
    profile,
    updatePreferences,
  ])

  useEffect(() => {
    const bundled = builtinMobilePetPersonality(preferences.personalitySlug)
    if (bundled) {
      setBasePersonality(bundled)
      setError('')
      return
    }
    if (!gateway || status !== 'ready' || !hostCapabilities.personalities) {
      return
    }
    let active = true
    void gateway
      .request<{ personality: PetPersonalityData }>('pet.personality.get', {
        profile,
        slug: preferences.personalitySlug,
      })
      .then(result => {
        if (active) setBasePersonality(result.personality)
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
    gateway,
    hostCapabilities.personalities,
    preferences.personalitySlug,
    profile,
    status,
  ])

  const generateCommentary = useCallback(async (force = false) => {
    if (
      !hostCapabilities.commentary ||
      !gateway ||
      !runtimeSessionId ||
      !personality?.commentary?.prompt
    ) {
      return
    }
    if (pendingPetWorkRef.current > 0) {
      if (!force) deferredAutomaticCommentaryRef.current = true
      return
    }
    const automatic = !force
    const requestId = commentaryGateRef.current.begin(
      automatic,
      currentTurnActiveRef.current,
    )
    if (requestId === null) return
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
      commentaryGateRef.current.finish(requestId)
      return
    }
    const releaseGenerationPending = preferencesRef.current.speakCommentary
      ? beginPendingPetWork()
      : () => {}
    const requestedConnectionId = connectionId
    try {
      const result = await gateway.request<{ ok: boolean; text: string }>(
        'pet.commentary.generate',
        {
          activity: currentTurnActiveRef.current
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
      if (
        activeConnectionIdRef.current !== requestedConnectionId ||
        !commentaryGateRef.current.canPublish(
          requestId,
          automatic,
          currentTurnActiveRef.current,
        )
      ) {
        return
      }
      if (result.ok && result.text) {
        observerIdsRef.current = frames.ids
        observerSignatureRef.current = observerSignature
        publish(result.text, 'generated')
      }
    } catch (commentaryError) {
      if (
        activeConnectionIdRef.current !== requestedConnectionId ||
        !commentaryGateRef.current.canPublish(
          requestId,
          automatic,
          currentTurnActiveRef.current,
        )
      ) {
        return
      }
      setError(
        commentaryError instanceof Error
          ? commentaryError.message
          : String(commentaryError),
      )
    } finally {
      commentaryGateRef.current.finish(requestId)
      releaseGenerationPending()
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
    beginPendingPetWork,
  ])

  const refreshInfo = useCallback(() => {
    setPetRevision(current => current + 1)
  }, [])

  useEffect(() => {
    if (!gateway) return
    return gateway.onEvent(event => {
      if (event.type === 'pet.changed') refreshInfo()
    })
  }, [gateway, refreshInfo])

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
    firstCommentaryTimerRef.current = setTimeout(
      () => void generateCommentaryRef.current(false),
      preferences.delaySeconds * 1_000,
    )
    repeatingCommentaryTimerRef.current = setInterval(
      () => void generateCommentaryRef.current(false),
      preferences.intervalSeconds * 1_000,
    )
    return clearCommentarySchedule
  }, [
    connected,
    hostCapabilities.commentary,
    preferences.commentary,
    preferences.delaySeconds,
    preferences.intervalSeconds,
    runtimeSessionId,
    status,
    turnActive,
    clearCommentarySchedule,
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
    if (previousTurnActiveRef.current && !turnActive) {
      finishTurnCommentary()
      setJustCompleted(true)
      const timer = setTimeout(() => setJustCompleted(false), 1_600)
      previousTurnActiveRef.current = turnActive
      return () => clearTimeout(timer)
    }
    previousTurnActiveRef.current = turnActive
  }, [finishTurnCommentary, turnActive])

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
    void speakPet(line, `pet-voice-preview:${eventId()}`)
  }, [info.displayName, personality, speakPet])

  const listen = useCallback(
    (text: string, speechId: string) =>
      speakPet(text, speechId, { bubbleText: compactPetBubbleText(text) }),
    [speakPet],
  )

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
    setSidechatBusy(true)
    const priorPetWork = waitForSpeechPriority()
    const releaseSidechatPending = beginPendingPetWork()
    let pendingHeldForSpeech = false
    let pendingReleased = false
    const releasePending = () => {
      if (pendingReleased) return
      pendingReleased = true
      releaseSidechatPending()
    }
    const requestedConnectionId = connectionId
    const turnId = `mobile-${eventId()}`
    const speechId = `pet-sidechat:${eventId()}`
    const bubbleOwner = eventId()
    let sidechatBubbleText = ''
    let sidechatStreamedText = ''
    const preparedSpeech = preferencesRef.current.speakCommentary
      ? prepareSpeechSequence(speechId, speechRef.current.config, {
          maxConcurrentSynthesis: 2,
          maxSegmentChars: 360,
          onPlaybackStart: () => {
            activeSpeechBubbleRef.current = bubbleOwner
            if (sidechatBubbleText) showBubble(sidechatBubbleText, 0)
            setSpeaking(true)
          },
          priority: 20,
          queueKey: speechId,
          speechId,
          startPlayback: true,
        })
      : null
    const stopSidechatDelta = gateway.onEvent(event => {
      if (event.type !== 'pet.sidechat.delta' || !preparedSpeech) return
      const payload = event.payload as { text?: unknown; turnId?: unknown }
      if (String(payload.turnId ?? '') !== turnId) return
      const delta = String(payload.text ?? '')
      if (delta) {
        sidechatStreamedText += delta
        sidechatBubbleText = compactPetBubbleText(sidechatStreamedText)
        preparedSpeech.append(delta)
      }
    })
    setSidechatError('')
    const optimistic = {
      id: `local-${eventId()}`,
      role: 'user' as const,
      text,
    }
    try {
      await priorPetWork
      if (activeConnectionIdRef.current !== requestedConnectionId) return false
      setSidechatMessages(current => [...current, optimistic])
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
        turnId,
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
        if (preparedSpeech) {
          pendingHeldForSpeech = true
          sidechatBubbleText = compactPetBubbleText(reply)
          void preparedSpeech.finish(reply).finally(() => {
            if (activeSpeechBubbleRef.current === bubbleOwner) {
              activeSpeechBubbleRef.current = ''
              setSpeaking(false)
              setBubble('')
            }
            releasePending()
          })
        } else if (preferencesRef.current.speakCommentary) {
          void speakPet(reply, `pet-sidechat:${eventId()}`, {
            bubbleText: compactPetBubbleText(reply),
          })
        } else {
          showBubble(compactPetBubbleText(reply))
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
      stopSidechatDelta()
      if (!pendingHeldForSpeech) {
        preparedSpeech?.cancel()
        releasePending()
      }
      if (activeConnectionIdRef.current === requestedConnectionId) {
        sidechatBusyRef.current = false
        setSidechatBusy(false)
      }
    }
  }, [
    ensureSession,
    beginPendingPetWork,
    connectionId,
    gateway,
    hostCapabilities.sidechat,
    info.displayName,
    personality,
    prepareSpeechSequence,
    preferences.contextTurns,
    preferences.personalitySlug,
    preferences.toolTurns,
    profile,
    runtimeSessionId,
    showBubble,
    speakPet,
    transcript,
    waitForSpeechPriority,
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
      cancelCommentary()
      pendingPetWorkRef.current = 0
      for (const resolve of pendingPetWaitersRef.current.splice(0)) resolve()
    },
    [cancelCommentary],
  )

  return {
    bubble,
    cancelCommentary,
    catalog,
    desktopSpeech,
    desktopSpeechStatus,
    error,
    finishTurnCommentary,
    generateCommentary: () => generateCommentary(true),
    hostCapabilities,
    info,
    interact,
    listen,
    personality,
    prepareSpeechSequence,
    personalityEdited: Boolean(
      basePersonality && personalityOverrides[basePersonality.id],
    ),
    preferences,
    previewVoice,
    refreshInfo,
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
    speaking,
    state,
    status,
    resetPersonality,
    updatePersonality,
    updatePreferences,
    waitForSpeechPriority,
  }
}
