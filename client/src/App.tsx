import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { EmbedPreferencesProvider } from './embeds'
import { ConnectionSheet } from './components/ConnectionSheet'
import { ControlPanel } from './components/ControlPanel'
import { FilesView } from './components/FilesView'
import { MobilePet } from './components/MobilePet'
import { PetSidechatSheet } from './components/PetSidechatSheet'
import { ReaderView } from './components/ReaderView'
import { ShareSheet } from './components/ShareSheet'
import { SessionsView } from './components/SessionsView'
import { WorkspaceSheet } from './components/WorkspaceSheet'
import { Transcript, type ToolDetailMode } from './components/Transcript'
import type {
  GatewayConnectionState,
  GatewayEvent,
  MobileCapabilities,
  ProjectSessionsResult,
  ProjectsTreeResult,
  ProjectTree,
  SessionCreateResult,
  SessionListResult,
  SessionSummary,
} from './protocol/types'
import {
  historyToTranscript,
  markRequestAnswered,
  mergeResumedTranscript,
  reduceGatewayEvent,
  type RequestTranscriptData,
  type TranscriptItem,
} from './state/transcript'
import {
  cacheTranscript,
  readCachedTranscript,
  type TranscriptCache,
} from './state/transcript-cache'
import {
  createConnection,
  defaultConnection,
  loadConnection,
  loadConnections,
  loadDraft,
  persistConnection,
  persistDraft,
  removeConnection,
} from './state/connection'
import { aliasCommand, commandParts } from './state/commands'
import {
  cloudAgentConnectable,
  cloudAgentStatus,
  isNousCloudAgentUrl,
  resolveNousCloudAgent,
} from './state/cloud'
import { projectSessionRows } from './state/sessions'
import {
  sharedImageAttachParams,
  sharedPromptText,
  type ShareDestination,
} from './state/share'
import {
  loadPreferredWorkspace,
  persistPreferredWorkspace,
  sessionCreateParams,
} from './state/workspace'
import {
  loadVoiceSelection,
  persistVoiceSelection,
  ttsOverride,
  type VoiceSelection,
} from './reader'
import type { PreviewDocument } from './preview'
import {
  applyThemeSelection,
  bindHermesSkin,
  hostSkinForConnection,
  loadThemeSelection,
  persistThemeSelection,
  type BoundHermesSkin,
  type MobileThemeSelection,
} from './state/theme'
import type { BrowserConnection } from './transport/browser-transport'
import {
  createHermesTransport,
  type HermesTransport,
} from './transport/hermes-transport'
import { prepareDirectAuthentication } from './transport/direct-auth'
import {
  reconcileForegroundConnection,
  shouldSurfaceGatewayStateError,
} from './transport/foreground-reconnect'
import { becameActive, usesDocumentVisibility } from './transport/app-activity'
import {
  type CloudAgent,
  type CloudOrganization,
  HermesNative,
  isNativeHermesClient,
  type SharedContent,
} from './transport/native-bridge'
import {
  canToggleVoiceRecording,
  completedAssistantText,
  loadAutoSpeak,
  persistAutoSpeak,
  useVoice,
} from './voice'
import {
  loadWakeWordMode,
  persistWakeWordMode,
  type WakeWordMode,
  useWakeWord,
} from './wake-word'
import { markdownToSpeechText } from './markdown'
import { petTurnActiveAfterEvent } from './pet'
import {
  pinTranscriptToBottom,
  shouldFollowTranscriptAfterScroll,
} from './transcript-follow'
import { usePetCompanion } from './usePetCompanion'

type AppTab = 'chat' | 'sessions' | 'reader' | 'files' | 'control'
const MAX_RECONNECT_ATTEMPTS = 5

function normalizeToolDetailMode(value: unknown): ToolDetailMode {
  return value === 'expanded' || value === 'hidden' ? value : 'collapsed'
}

interface CommandsCatalog {
  pairs?: Array<[string, string]>
}

interface SlashSuggestion {
  text: string
  display: string
  meta: string
}

interface CommandDirective {
  type?: string
  output?: string
  warning?: string
  target?: string
  message?: string
  notice?: string
  name?: string
}

function directive(value: unknown): CommandDirective {
  return value && typeof value === 'object' ? (value as CommandDirective) : {}
}

function NavIcon({ tab }: { tab: AppTab }) {
  if (tab === 'chat') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 6.5h14v9H10l-4.5 3v-3H5z" />
      </svg>
    )
  }
  if (tab === 'sessions') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M7 5h12v12H7zM4 8v11h11" />
      </svg>
    )
  }
  if (tab === 'reader') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 5.5h5.5a3 3 0 0 1 3 3v10a3 3 0 0 0-3-3H5zM19 5.5h-5.5v10a3 3 0 0 1 3-3H19z" />
      </svg>
    )
  }
  if (tab === 'files') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4.5 7h6l1.5 2H19.5v9.5h-15z" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 7h14M5 17h14M9 4v6M15 14v6" />
    </svg>
  )
}

function MicrophoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect height="10" rx="3" width="6" x="9" y="4" />
      <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3M9 20h6" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 14-7-4 14-3-5zM12 14l7-9" />
    </svg>
  )
}

export function App() {
  const initialConnection = useMemo<BrowserConnection>(
    () =>
      typeof window === 'undefined' ? defaultConnection : loadConnection(),
    [],
  )
  const nativeClient = isNativeHermesClient()
  const [connection, setConnection] =
    useState<BrowserConnection>(initialConnection)
  const [connectionState, setConnectionState] =
    useState<GatewayConnectionState>('disconnected')
  const [capabilities, setCapabilities] = useState<MobileCapabilities | null>(
    null,
  )
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [projects, setProjects] = useState<ProjectTree[]>([])
  const [activeProjectId, setActiveProjectId] = useState('')
  const [projectDetail, setProjectDetail] = useState<ProjectTree | null>(null)
  const [projectLoading, setProjectLoading] = useState(false)
  const [savedConnections, setSavedConnections] = useState<BrowserConnection[]>(
    () => (typeof window === 'undefined' ? [] : loadConnections()),
  )
  const [selectedStoredId, setSelectedStoredId] = useState('')
  const [runtimeSessionId, setRuntimeSessionId] = useState('')
  const [preferredWorkspace, setPreferredWorkspace] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : loadPreferredWorkspace(initialConnection.id),
  )
  const [sessionCwd, setSessionCwd] = useState('')
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [shareWorkspaceOpen, setShareWorkspaceOpen] = useState(false)
  const [shareWorkspace, setShareWorkspace] = useState('')
  const [pendingShare, setPendingShare] = useState<SharedContent | null>(null)
  const [readerImport, setReaderImport] = useState<{
    document: PreviewDocument
    id: number
    mode: 'preview' | 'reader'
  } | null>(null)
  const [draft, setDraft] = useState(() =>
    typeof window === 'undefined' ? '' : loadDraft(initialConnection.id),
  )
  const [transcript, setTranscript] = useState<TranscriptItem[]>([])
  const [toolDetailMode, setToolDetailMode] =
    useState<ToolDetailMode>('collapsed')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [turnActive, setTurnActive] = useState(false)
  const [activeTab, setActiveTab] = useState<AppTab>('chat')
  const [controlVisit, setControlVisit] = useState(0)
  const [connectionOpen, setConnectionOpen] = useState(
    !nativeClient || !initialConnection.baseUrl,
  )
  const [petSidechatOpen, setPetSidechatOpen] = useState(false)
  const petSidechatTranscriptRef = useRef<((text: string) => void) | null>(null)
  const [commandCatalog, setCommandCatalog] = useState<Array<[string, string]>>(
    [],
  )
  const [liveSuggestions, setLiveSuggestions] = useState<SlashSuggestion[]>([])
  const [cloudSignedIn, setCloudSignedIn] = useState(false)
  const [cloudAgents, setCloudAgents] = useState<CloudAgent[]>([])
  const [cloudOrgs, setCloudOrgs] = useState<CloudOrganization[]>([])
  const [cloudOrg, setCloudOrg] = useState('')
  const [orphanCredentialIds, setOrphanCredentialIds] = useState<string[]>([])
  const [activeSkinName, setActiveSkinName] = useState('default')
  const [themeSelection, setThemeSelection] = useState<MobileThemeSelection>(
    () =>
      typeof window === 'undefined'
        ? 'mobile'
        : loadThemeSelection(initialConnection.id),
  )
  const [autoSpeak, setAutoSpeak] = useState(() =>
    typeof window === 'undefined' ? false : loadAutoSpeak(initialConnection.id),
  )
  const [wakeWordMode, setWakeWordMode] = useState<WakeWordMode>(() =>
    typeof window === 'undefined'
      ? 'off'
      : loadWakeWordMode(initialConnection.id),
  )
  const [wakeReviewPending, setWakeReviewPending] = useState(false)
  const [appIsActive, setAppIsActive] = useState(true)
  const [voiceSelection, setVoiceSelection] = useState<VoiceSelection>(() =>
    typeof window === 'undefined'
      ? { provider: '', voice: '', speed: 1 }
      : loadVoiceSelection(initialConnection.id),
  )
  const transportRef = useRef<HermesTransport | null>(null)
  const transcriptCacheRef = useRef<TranscriptCache>(new Map())
  const transportCleanupRef = useRef<(() => void) | null>(null)
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const transcriptFollowRef = useRef(true)
  const transcriptLastScrollTopRef = useRef(0)
  const transcriptManualScrollUntilRef = useRef(0)
  const transcriptPinFrameRef = useRef<number | null>(null)
  const transcriptPinRecoveryRef = useRef<number | null>(null)
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null)
  const autoConnectStartedRef = useRef(false)
  const autoSpeakRef = useRef(autoSpeak)
  const wakeWordModeRef = useRef(wakeWordMode)
  const connectionRef = useRef(connection)
  const selectedStoredIdRef = useRef(selectedStoredId)
  const runtimeSessionIdRef = useRef(runtimeSessionId)
  const desiredConnectedRef = useRef(false)
  const appActiveRef = useRef(true)
  const connectingRef = useRef(false)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const connectionEpochRef = useRef(0)
  const sessionSelectionEpochRef = useRef(0)
  const projectSelectionEpochRef = useRef(0)
  const reconnectInFlightRef = useRef<{
    epoch: number
    task: Promise<void>
  } | null>(null)
  const hostSkinRef = useRef<BoundHermesSkin | null>(null)
  const themeSelectionRef = useRef(themeSelection)
  const sharedImageUploadRef = useRef<{
    sessionId: string
    shareId: string
  } | null>(null)

  const activeSession = useMemo(
    () =>
      sessions.find(session => session.id === selectedStoredId) ??
      projectSessionRows(projectDetail).find(
        row => row.session.id === selectedStoredId,
      )?.session ??
      null,
    [projectDetail, selectedStoredId, sessions],
  )
  const latestAssistantText = useMemo(
    () =>
      [...transcript]
        .reverse()
        .find(item => item.kind === 'assistant' && item.text?.trim())
        ?.text?.trim() ?? '',
    [transcript],
  )
  const connected = connectionState === 'connected'
  autoSpeakRef.current = autoSpeak
  connectionRef.current = connection
  selectedStoredIdRef.current = selectedStoredId
  runtimeSessionIdRef.current = runtimeSessionId
  themeSelectionRef.current = themeSelection

  useEffect(() => {
    cacheTranscript(
      transcriptCacheRef.current,
      connection.id,
      selectedStoredIdRef.current,
      transcript,
    )
  }, [connection.id, transcript])

  const commandSuggestions = useMemo(() => {
    const text = draft.trimStart()
    if (!text.startsWith('/') || text.includes('\n')) return []
    if (liveSuggestions.length > 0) return liveSuggestions.slice(0, 6)
    const first = text.split(/\s+/, 1)[0].toLowerCase()
    if (!first || text.includes(' ')) return []
    return commandCatalog
      .filter(([name]) => name.toLowerCase().startsWith(first))
      .slice(0, 6)
      .map(([name, description]) => ({
        text: name,
        display: name,
        meta: description,
      }))
  }, [commandCatalog, draft, liveSuggestions])

  const getTransport = useCallback(() => transportRef.current, [])
  const changeToolDetailMode = useCallback((value: string) => {
    setToolDetailMode(normalizeToolDetailMode(value))
  }, [])
  const getDefaultTtsConfig = useCallback(
    () => ttsOverride(voiceSelection),
    [voiceSelection],
  )
  const appendVoiceTranscript = useCallback((text: string) => {
    if (petSidechatTranscriptRef.current) {
      petSidechatTranscriptRef.current(text)
      return
    }
    setDraft(current => {
      const existing = current.trimEnd()
      return existing ? `${existing} ${text}` : text
    })
  }, [])
  const {
    activeSpeechId,
    pausePlayback,
    phase: voicePhase,
    playbackPaused,
    renderSequence,
    resumePlayback,
    speak,
    speakSequence,
    stopPlayback,
    toggleRecording,
    toggleSpeech,
  } = useVoice({
    connectionId: connection.id,
    getDefaultTtsConfig,
    getTransport,
    nativeClient,
    onError: setError,
    onTranscript: appendVoiceTranscript,
  })
  const voiceRecordingAvailable = canToggleVoiceRecording(
    voicePhase,
    activeSpeechId,
    playbackPaused,
  )
  const {
    cancelCapture: cancelWakeCapture,
    status: wakeWordStatus,
  } = useWakeWord({
    appActive: appIsActive,
    available: !busy && !turnActive && !wakeReviewPending,
    connected,
    connectionId: connection.id,
    enabled: wakeWordMode !== 'off',
    getTransport,
    nativeClient,
    onDetected: () => {
      setNotice('Hey Hermes heard. Say your request, then pause.')
    },
    onError: setError,
    onNotice: setNotice,
    onTranscript: text => {
      setActiveTab('chat')
      if (wakeWordModeRef.current === 'send') {
        void sendWakeTranscript(text)
        return
      }
      setDraft(text)
      setWakeReviewPending(true)
      setNotice('Request transcribed. Review it or send it to Hermes.')
    },
    voicePhase,
  })
  const pet = usePetCompanion({
    connected,
    connectionId: connection.id,
    ensureSession: () => ensureSession(),
    gateway: transportRef.current?.gateway ?? null,
    profile: connection.profile,
    runtimeSessionId,
    speak,
    transcript,
    transport: transportRef.current,
    turnActive,
  })
  useEffect(() => {
    if (!pet.hostCapabilities.sidechat) setPetSidechatOpen(false)
  }, [pet.hostCapabilities.sidechat])

  const appendEvent = useCallback(
    (event: GatewayEvent) => {
      setTurnActive(current =>
        petTurnActiveAfterEvent(current, event.type),
      )
      if (event.type === 'gateway.ready') {
        const payload =
          event.payload && typeof event.payload === 'object'
            ? (event.payload as Record<string, unknown>)
            : {}
        const bound = bindHermesSkin(connectionRef.current.id, payload.skin)
        if (bound) {
          hostSkinRef.current = bound
          setActiveSkinName(String(bound.skin.name ?? 'default'))
          if (themeSelectionRef.current === 'host') {
            applyThemeSelection('host', bound.skin)
          }
        }
      } else if (event.type === 'skin.changed') {
        const bound = bindHermesSkin(connectionRef.current.id, event.payload)
        if (bound) {
          hostSkinRef.current = bound
          setActiveSkinName(String(bound.skin.name ?? 'default'))
          if (themeSelectionRef.current === 'host') {
            applyThemeSelection('host', bound.skin)
          }
        }
      }
      setTranscript(current => reduceGatewayEvent(current, event))
      if (!autoSpeakRef.current) return
      const text = completedAssistantText(event)
      if (text) void speak(markdownToSpeechText(text), 'auto-response')
    },
    [speak],
  )

  const disconnect = useCallback(() => {
    connectionEpochRef.current += 1
    desiredConnectedRef.current = false
    connectingRef.current = false
    reconnectAttemptRef.current = 0
    reconnectInFlightRef.current = null
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    transportCleanupRef.current?.()
    transportCleanupRef.current = null
    transportRef.current?.disconnect()
    transportRef.current = null
    setConnectionState('disconnected')
    runtimeSessionIdRef.current = ''
    setRuntimeSessionId('')
    setTurnActive(false)
  }, [])

  useEffect(() => () => disconnect(), [disconnect])
  useEffect(() => {
    const selection = loadThemeSelection(connection.id)
    themeSelectionRef.current = selection
    setThemeSelection(selection)
    const hostSkin = hostSkinForConnection(hostSkinRef.current, connection.id)
    if (!hostSkin) {
      hostSkinRef.current = null
      setActiveSkinName('default')
    }
    applyThemeSelection(selection, hostSkin)
  }, [connection.id])
  useEffect(() => {
    persistDraft(connection.id, draft)
  }, [connection.id, draft])
  useEffect(() => {
    if (!connected || preferredWorkspace || !transportRef.current) return
    void transportRef.current
      .requestJson<{ cwd?: string }>('/api/fs/default-cwd')
      .then(result => {
        const cwd = String(result.cwd || '').trim()
        if (!cwd) return
        setPreferredWorkspace(cwd)
        persistPreferredWorkspace(connection.id, cwd)
      })
      .catch(() => undefined)
  }, [connected, connection.id, preferredWorkspace])
  useEffect(() => {
    setAutoSpeak(loadAutoSpeak(connection.id))
    const nextWakeWordMode = loadWakeWordMode(connection.id)
    setWakeWordMode(nextWakeWordMode)
    wakeWordModeRef.current = nextWakeWordMode
    setWakeReviewPending(false)
    setVoiceSelection(loadVoiceSelection(connection.id))
    stopPlayback()
  }, [connection.id, stopPlayback])
  useEffect(() => {
    if (!nativeClient) return
    void Promise.allSettled([
      HermesNative.cloudStatus().then(status =>
        setCloudSignedIn(status.signedIn),
      ),
      HermesNative.listCredentialIds().then(({ connectionIds }) => {
        const known = new Set(loadConnections().map(row => row.id))
        setOrphanCredentialIds(
          (connectionIds ?? []).filter(id => !known.has(id)),
        )
      }),
    ]).then(results => {
      if (results[0].status === 'rejected') setCloudSignedIn(false)
    })
  }, [nativeClient])
  useEffect(() => {
    if (!nativeClient) return
    let disposed = false
    let removeShareListener: (() => Promise<void>) | null = null
    const receiveShare = (share: SharedContent) => {
      if (disposed || !share?.id) return
      setShareWorkspace(loadPreferredWorkspace(connectionRef.current.id))
      setPendingShare(share)
    }
    void HermesNative.addListener('shareReceived', receiveShare).then(
      handle => {
        if (disposed) {
          void handle.remove()
          return
        }
        removeShareListener = () => handle.remove()
      },
    )
    void HermesNative.getPendingShare()
      .then(result => {
        if (result.share) receiveShare(result.share)
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      if (removeShareListener) void removeShareListener()
    }
  }, [nativeClient])
  useEffect(() => {
    if (
      !nativeClient ||
      !initialConnection.baseUrl ||
      autoConnectStartedRef.current
    ) {
      return
    }
    autoConnectStartedRef.current = true
    void connect(initialConnection)
    // The saved connection is the one startup target. Later switches are
    // explicit and go through the connection sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    let disposed = false
    let removeNativeListener: (() => Promise<void>) | null = null

    const onActive = (isActive: boolean) => {
      const wasActive = appActiveRef.current
      appActiveRef.current = isActive
      setAppIsActive(isActive)
      if (becameActive(wasActive, isActive)) scheduleReconnect(200)
    }
    const onVisibilityChange = () => {
      onActive(document.visibilityState !== 'hidden')
    }

    if (nativeClient) {
      appActiveRef.current = true
      setAppIsActive(true)
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        onActive(isActive)
      }).then(handle => {
        if (disposed) {
          void handle.remove()
          return
        }
        removeNativeListener = () => handle.remove()
      })
    } else if (usesDocumentVisibility(nativeClient)) {
      document.addEventListener('visibilitychange', onVisibilityChange)
      appActiveRef.current = document.visibilityState !== 'hidden'
      setAppIsActive(appActiveRef.current)
    }

    return () => {
      disposed = true
      if (usesDocumentVisibility(nativeClient)) {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      if (removeNativeListener) void removeNativeListener()
    }
    // Lifecycle callbacks operate entirely on current-value refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeClient])
  const pinTranscriptNow = useCallback(() => {
    const node = transcriptRef.current
    if (!node || !transcriptFollowRef.current) return
    if (Date.now() < transcriptManualScrollUntilRef.current) return
    transcriptLastScrollTopRef.current = pinTranscriptToBottom(node)
  }, [])
  const scheduleTranscriptPin = useCallback(() => {
    if (transcriptPinFrameRef.current !== null) return
    transcriptPinFrameRef.current = window.requestAnimationFrame(() => {
      transcriptPinFrameRef.current = null
      pinTranscriptNow()
    })
  }, [pinTranscriptNow])
  const scheduleTranscriptPinRecovery = useCallback(() => {
    if (transcriptPinRecoveryRef.current !== null) {
      window.clearTimeout(transcriptPinRecoveryRef.current)
    }
    const delay = Math.max(
      16,
      transcriptManualScrollUntilRef.current - Date.now() + 16,
    )
    transcriptPinRecoveryRef.current = window.setTimeout(() => {
      transcriptPinRecoveryRef.current = null
      scheduleTranscriptPin()
    }, delay)
  }, [scheduleTranscriptPin])
  const markTranscriptManualScroll = useCallback(() => {
    transcriptManualScrollUntilRef.current = Date.now() + 350
    if (transcriptPinFrameRef.current !== null) {
      window.cancelAnimationFrame(transcriptPinFrameRef.current)
      transcriptPinFrameRef.current = null
    }
    scheduleTranscriptPinRecovery()
  }, [scheduleTranscriptPinRecovery])
  useLayoutEffect(() => {
    scheduleTranscriptPin()
  }, [scheduleTranscriptPin, transcript])
  useEffect(() => {
    const node = transcriptRef.current
    if (!node) return

    const observedChildren = new Set<Element>()
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => scheduleTranscriptPin())
    const syncObservedChildren = () => {
      if (!resizeObserver) return
      for (const child of observedChildren) {
        if (child.parentElement !== node) {
          resizeObserver.unobserve(child)
          observedChildren.delete(child)
        }
      }
      for (const child of Array.from(node.children)) {
        if (observedChildren.has(child)) continue
        observedChildren.add(child)
        resizeObserver.observe(child)
      }
    }

    resizeObserver?.observe(node)
    syncObservedChildren()
    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            syncObservedChildren()
            scheduleTranscriptPin()
          })
    mutationObserver?.observe(node, {
      characterData: true,
      childList: true,
      subtree: true,
    })

    return () => {
      mutationObserver?.disconnect()
      resizeObserver?.disconnect()
      if (transcriptPinFrameRef.current !== null) {
        window.cancelAnimationFrame(transcriptPinFrameRef.current)
        transcriptPinFrameRef.current = null
      }
      if (transcriptPinRecoveryRef.current !== null) {
        window.clearTimeout(transcriptPinRecoveryRef.current)
        transcriptPinRecoveryRef.current = null
      }
    }
  }, [scheduleTranscriptPin])
  const handleTranscriptScroll = useCallback(() => {
    const node = transcriptRef.current
    if (!node) return
    const manualScroll =
      Date.now() <= transcriptManualScrollUntilRef.current
    transcriptFollowRef.current = shouldFollowTranscriptAfterScroll({
      clientHeight: node.clientHeight,
      manualScroll,
      previousScrollTop: transcriptLastScrollTopRef.current,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
      wasFollowing: transcriptFollowRef.current,
    })
    transcriptLastScrollTopRef.current = node.scrollTop
    if (manualScroll) {
      transcriptManualScrollUntilRef.current = Date.now() + 350
      scheduleTranscriptPinRecovery()
    }
  }, [scheduleTranscriptPinRecovery])
  useEffect(() => {
    const node = composerInputRef.current
    if (!node) return
    node.style.height = 'auto'
    const nextHeight = Math.min(Math.max(node.scrollHeight, 40), 144)
    node.style.height = `${nextHeight}px`
    node.style.overflowY = node.scrollHeight > 144 ? 'auto' : 'hidden'
  }, [draft])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    const text = draft.trimStart()
    const gateway = transportRef.current?.gateway
    if (
      !connected ||
      !gateway ||
      !text.startsWith('/') ||
      text.includes('\n')
    ) {
      setLiveSuggestions([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      void gateway
        .request<{
          items?: Array<{ text?: string; display?: string; meta?: string }>
          replace_from?: number
        }>('complete.slash', { text })
        .then(result => {
          if (cancelled) return
          const replaceFrom =
            typeof result.replace_from === 'number' ? result.replace_from : 1
          const prefix = replaceFrom > 1 ? text.slice(0, replaceFrom) : ''
          setLiveSuggestions(
            (result.items ?? []).map(item => {
              const raw = String(item.text ?? '')
              const completion = replaceFrom > 1 ? `${prefix}${raw}` : raw
              const normalized = completion.startsWith('/')
                ? completion
                : `/${completion}`
              return {
                text: normalized,
                display: String(item.display ?? normalized),
                meta: String(item.meta ?? ''),
              }
            }),
          )
        })
        .catch(() => {
          if (!cancelled) setLiveSuggestions([])
        })
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [connected, draft])

  function clearReconnectTimer() {
    if (!reconnectTimerRef.current) return
    clearTimeout(reconnectTimerRef.current)
    reconnectTimerRef.current = null
  }

  function scheduleReconnect(delay?: number) {
    if (
      !desiredConnectedRef.current ||
      !appActiveRef.current ||
      !transportRef.current ||
      connectingRef.current ||
      reconnectInFlightRef.current ||
      reconnectTimerRef.current
    ) {
      return
    }
    const delays = [250, 1_000, 2_500, 5_000, 10_000]
    const nextDelay =
      delay ?? delays[Math.min(reconnectAttemptRef.current, delays.length - 1)]
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      void reconcileAfterInterruption()
    }, nextDelay)
  }

  async function reconcileAfterInterruption(): Promise<void> {
    const epoch = connectionEpochRef.current
    const existing = reconnectInFlightRef.current
    if (existing?.epoch === epoch) {
      await existing.task
      return
    }
    const transport = transportRef.current
    if (!transport || !desiredConnectedRef.current || !appActiveRef.current) {
      return
    }

    let retry = false
    const task = (async () => {
      const activeConnection = connectionRef.current
      const result = await reconcileForegroundConnection({
        transport,
        profile: activeConnection.profile,
        storedSessionId: selectedStoredIdRef.current,
      })
      if (
        transportRef.current !== transport ||
        !desiredConnectedRef.current ||
        connectionEpochRef.current !== epoch
      ) {
        return
      }

      reconnectAttemptRef.current = 0
      if (result.resumed) {
        const storedId =
          result.resumed.stored_session_id || selectedStoredIdRef.current
        selectedStoredIdRef.current = storedId
        runtimeSessionIdRef.current = result.resumed.session_id
        setSelectedStoredId(storedId)
        setRuntimeSessionId(result.resumed.session_id)
        setTranscript(current =>
          mergeResumedTranscript(current, result.messages ?? []),
        )
      }

      if (result.reconnected) {
        await Promise.allSettled([
          refreshSessions(transport, activeConnection.profile),
          refreshCommands(transport),
          refreshToolDetailMode(transport),
        ])
        setError('')
        setNotice(`Reconnected to ${activeConnection.name || 'Hermes'}`)
      }
    })()
    const inFlight = { epoch, task }
    reconnectInFlightRef.current = inFlight

    try {
      await task
    } catch {
      const stillCurrent =
        transportRef.current === transport &&
        desiredConnectedRef.current &&
        appActiveRef.current &&
        connectionEpochRef.current === epoch
      if (stillCurrent) {
        reconnectAttemptRef.current += 1
        setConnectionState('disconnected')
        retry = reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS
        if (!retry) {
          setError(
            'Could not restore the Hermes connection. Open the host menu to retry.',
          )
        }
      }
    } finally {
      if (reconnectInFlightRef.current === inFlight) {
        reconnectInFlightRef.current = null
      }
    }

    if (retry && connectionEpochRef.current === epoch) scheduleReconnect()
  }

  async function connect(target = connection) {
    disconnect()
    if (
      target.connectionType !== 'cloud' &&
      isNousCloudAgentUrl(target.baseUrl)
    ) {
      if (!nativeClient) {
        setError('Nous Cloud connections require the Android app')
        return false
      }
      return connectNousCloudUrl(target.baseUrl)
    }

    setBusy(true)
    setError('')
    setCapabilities(null)
    setToolDetailMode('collapsed')

    try {
      const activeTarget = await prepareDirectAuthentication(
        target,
        nativeClient,
        HermesNative,
      )
      connectionRef.current = activeTarget
      setConnection(activeTarget)
      persistConnection(activeTarget)
      setSavedConnections(loadConnections())
      const transport = createHermesTransport(activeTarget)
      transportRef.current = transport
      desiredConnectedRef.current = true
      const stopState = transport.gateway.onState((state, stateError) => {
        setConnectionState(state)
        if (
          stateError &&
          shouldSurfaceGatewayStateError(
            appActiveRef.current,
            connectingRef.current,
          )
        ) {
          setError(stateError.message)
        }
        if (
          (state === 'disconnected' || state === 'failed') &&
          desiredConnectedRef.current &&
          !connectingRef.current
        ) {
          scheduleReconnect()
        }
      })
      const stopEvents = transport.gateway.onEvent(appendEvent)
      transportCleanupRef.current = () => {
        stopState()
        stopEvents()
      }

      try {
        const nextCapabilities = await transport.capabilities()
        setCapabilities(nextCapabilities)
        if (nextCapabilities.status === 'incompatible') {
          throw new Error(
            nextCapabilities.details.join(', ') ||
              'The Hermes Mobile server plugin is incompatible',
          )
        }

        connectingRef.current = true
        try {
          await transport.connect()
        } finally {
          connectingRef.current = false
        }
        clearReconnectTimer()
        reconnectAttemptRef.current = 0
        if (transport.kind === 'native' && activeTarget.token) {
          setConnection(current => ({ ...current, token: '' }))
        }
        setOrphanCredentialIds(current =>
          current.filter(id => id !== activeTarget.id),
        )
        await Promise.all([
          refreshSessions(transport, activeTarget.profile),
          refreshCommands(transport),
          refreshToolDetailMode(transport),
        ])
        setConnectionOpen(false)
        setNotice(`Connected to ${activeTarget.name || 'Hermes'}`)
        return true
      } catch (connectError) {
        throw connectError
      }
    } catch (connectError) {
      disconnect()
      setError(
        connectError instanceof Error
          ? connectError.message
          : String(connectError),
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  async function refreshSessions(
    transport = transportRef.current,
    profile = connection.profile,
  ): Promise<void> {
    if (!transport) return
    const result = await transport.gateway.request<SessionListResult>(
      'session.list',
      {
        profile: profile === 'default' ? '' : profile,
        limit: 100,
      },
    )
    if (transportRef.current !== transport) return
    setSessions(result.sessions ?? [])
    if (profile !== 'default') {
      setProjects([])
      setActiveProjectId('')
      setProjectDetail(null)
      return
    }

    const projectId = activeProjectId
    void transport.gateway
      .request<ProjectsTreeResult>('projects.tree', {
        preview_limit: 0,
        session_limit: 2000,
      })
      .then(projectResult => {
        if (transportRef.current !== transport) return
        setProjects(projectResult.projects ?? [])
        if (projectId) void selectProject(projectId, transport)
      })
      .catch(() => {
        if (transportRef.current !== transport) return
        setProjects([])
        setActiveProjectId('')
        setProjectDetail(null)
      })
  }

  async function refreshToolDetailMode(
    transport = transportRef.current,
  ): Promise<void> {
    if (!transport) return
    const result = await transport.gateway.request<{ value?: unknown }>(
      'config.get',
      { key: 'details_mode' },
    )
    setToolDetailMode(normalizeToolDetailMode(result.value))
  }

  async function selectProject(
    projectId: string,
    selectedTransport = transportRef.current,
  ): Promise<void> {
    const selectionEpoch = ++projectSelectionEpochRef.current
    setActiveProjectId(projectId)
    setProjectDetail(null)
    if (!projectId) return
    const transport = selectedTransport
    if (!transport) return
    setProjectLoading(true)
    try {
      const result = await transport.gateway.request<ProjectSessionsResult>(
        'projects.project_sessions',
        {
          project_id: projectId,
          session_limit: 5000,
        },
      )
      if (
        projectSelectionEpochRef.current !== selectionEpoch ||
        transportRef.current !== transport
      ) {
        return
      }
      setProjectDetail(result.project ?? null)
    } catch (projectError) {
      if (
        projectSelectionEpochRef.current !== selectionEpoch ||
        transportRef.current !== transport
      ) {
        return
      }
      setError(
        projectError instanceof Error
          ? projectError.message
          : String(projectError),
      )
    } finally {
      if (projectSelectionEpochRef.current === selectionEpoch) {
        setProjectLoading(false)
      }
    }
  }

  async function refreshCommands(
    transport = transportRef.current,
  ): Promise<void> {
    if (!transport) return
    const result =
      await transport.gateway.request<CommandsCatalog>('commands.catalog')
    setCommandCatalog(result.pairs ?? [])
  }

  async function discoverCloud(org = cloudOrg) {
    setBusy(true)
    setError('')
    try {
      const result = await HermesNative.cloudDiscover(org ? { org } : {})
      if (result.needsOrgSelection) {
        setCloudOrgs(result.orgs ?? [])
        setCloudAgents([])
        return
      }
      setCloudAgents(result.agents ?? [])
      setCloudOrgs([])
      if (result.org) setCloudOrg(result.org.slug || result.org.id)
    } catch (cloudError) {
      setError(
        cloudError instanceof Error ? cloudError.message : String(cloudError),
      )
    } finally {
      setBusy(false)
    }
  }

  async function signInToCloud() {
    setBusy(true)
    setError('')
    try {
      const status = await HermesNative.cloudLogin()
      setCloudSignedIn(status.signedIn)
      if (!status.signedIn)
        throw new Error('Hermes Cloud sign-in did not complete')
      await discoverCloud('')
    } catch (cloudError) {
      setError(
        cloudError instanceof Error ? cloudError.message : String(cloudError),
      )
    } finally {
      setBusy(false)
    }
  }

  async function signOutOfCloud() {
    setBusy(true)
    setError('')
    try {
      const status = await HermesNative.cloudLogout()
      setCloudSignedIn(status.signedIn)
      setCloudAgents([])
      setCloudOrgs([])
      setCloudOrg('')
      if (connection.connectionType === 'cloud') disconnect()
    } catch (cloudError) {
      setError(
        cloudError instanceof Error ? cloudError.message : String(cloudError),
      )
    } finally {
      setBusy(false)
    }
  }

  async function connectNousCloudUrl(value: string): Promise<boolean> {
    setBusy(true)
    setError('')
    try {
      const resolved = await resolveNousCloudAgent(value, HermesNative)
      setCloudSignedIn(true)
      setCloudAgents(resolved.agents)
      setCloudOrgs(resolved.organizations)
      setCloudOrg(
        resolved.selectedOrganization?.slug ||
          resolved.selectedOrganization?.id ||
          '',
      )
      if (!cloudAgentConnectable(resolved.agent)) {
        throw new Error(
          `${resolved.agent.name} is ${cloudAgentStatus(resolved.agent)} and is not ready to connect yet`,
        )
      }
      return await connectCloudAgent(resolved.agent)
    } catch (cloudError) {
      setError(
        cloudError instanceof Error ? cloudError.message : String(cloudError),
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  async function connectCloudAgent(agent: CloudAgent): Promise<boolean> {
    if (!agent.dashboardUrl) {
      setError('This Cloud agent does not have a dashboard URL yet')
      return false
    }
    setBusy(true)
    setError('')
    const nextConnection: BrowserConnection = {
      id: `cloud-${agent.id}`,
      name: agent.name,
      baseUrl: agent.dashboardUrl,
      profile: 'default',
      token: '',
      authMode: 'oauth',
      connectionType: 'cloud',
    }
    try {
      const signedIn = await HermesNative.cloudAgentSignIn({
        connectionId: nextConnection.id,
        dashboardUrl: agent.dashboardUrl,
      })
      if (!signedIn.connected) {
        throw new Error('The Cloud agent did not establish a gateway session')
      }
      nextConnection.baseUrl = signedIn.baseUrl
      prepareConnectionView(nextConnection)
      return await connect(nextConnection)
    } catch (cloudError) {
      setError(
        cloudError instanceof Error ? cloudError.message : String(cloudError),
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  function prepareConnectionView(nextConnection: BrowserConnection) {
    sessionSelectionEpochRef.current += 1
    projectSelectionEpochRef.current += 1
    disconnect()
    transcriptFollowRef.current = true
    connectionRef.current = nextConnection
    selectedStoredIdRef.current = ''
    runtimeSessionIdRef.current = ''
    setConnection(nextConnection)
    setDraft(loadDraft(nextConnection.id))
    setSelectedStoredId('')
    setRuntimeSessionId('')
    setPreferredWorkspace(loadPreferredWorkspace(nextConnection.id))
    setSessionCwd('')
    setWorkspaceOpen(false)
    setTranscript([])
    setSessions([])
    setProjects([])
    setActiveProjectId('')
    setProjectDetail(null)
    hostSkinRef.current = null
    setCapabilities(null)
    setBusy(false)
  }

  function newDirectConnection() {
    const recoverableId =
      orphanCredentialIds.length === 1 ? orphanCredentialIds[0] : ''
    const nextConnection = createConnection({
      ...(recoverableId ? { id: recoverableId } : {}),
      name: 'My Hermes',
      baseUrl: '',
      authMode: 'token',
      connectionType: 'direct',
    })
    prepareConnectionView(nextConnection)
    if (recoverableId) {
      setNotice(
        'Recovered the protected credential from your earlier direct host. Enter its HTTPS address to reconnect.',
      )
    }
  }

  async function switchSavedConnection(
    saved: BrowserConnection,
  ): Promise<boolean> {
    const nextConnection = { ...saved, token: '' }
    prepareConnectionView(nextConnection)
    if (nextConnection.connectionType !== 'cloud') {
      return connect(nextConnection)
    }
    if (!nativeClient) {
      setError('Hermes Cloud connections require the Android app')
      return false
    }
    setBusy(true)
    setError('')
    try {
      const signedIn = await HermesNative.cloudAgentSignIn({
        connectionId: nextConnection.id,
        dashboardUrl: nextConnection.baseUrl,
      })
      if (!signedIn.connected) {
        throw new Error('The Cloud agent did not establish a gateway session')
      }
      const refreshed = { ...nextConnection, baseUrl: signedIn.baseUrl }
      setConnection(refreshed)
      connectionRef.current = refreshed
      return await connect(refreshed)
    } catch (cloudError) {
      setError(
        cloudError instanceof Error ? cloudError.message : String(cloudError),
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  function editSavedConnection(saved: BrowserConnection) {
    prepareConnectionView({ ...saved, token: '' })
    setError('')
    setNotice('')
  }

  function saveEditedConnection() {
    persistConnection(connection)
    setSavedConnections(loadConnections())
    setNotice(`${connection.name || 'Hermes host'} saved`)
  }

  async function deleteSavedConnection(saved: BrowserConnection) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Delete the saved connection "${saved.name}"?`)
    ) {
      return
    }
    if (nativeClient) {
      await HermesNative.removeCredential({ connectionId: saved.id })
      setOrphanCredentialIds(current =>
        current.filter(connectionId => connectionId !== saved.id),
      )
    }
    const remaining = removeConnection(saved.id)
    setSavedConnections(remaining)
    if (connectionRef.current.id === saved.id) {
      prepareConnectionView(
        remaining[0] ??
          createConnection({
            name: 'My Hermes',
            baseUrl: '',
            authMode: 'token',
            connectionType: 'direct',
          }),
      )
    }
    setNotice(`${saved.name || 'Hermes host'} deleted`)
  }

  async function selectSession(session: SessionSummary): Promise<string> {
    const transport = transportRef.current
    if (!transport) throw new Error('Connect to Hermes first')
    const selectionEpoch = ++sessionSelectionEpochRef.current
    const connectionId = connectionRef.current.id
    const selectionIsCurrent = () =>
      sessionSelectionEpochRef.current === selectionEpoch &&
      transportRef.current === transport &&
      connectionRef.current.id === connectionId
    const previousStoredId = selectedStoredIdRef.current
    cacheTranscript(
      transcriptCacheRef.current,
      connection.id,
      previousStoredId,
      transcript,
    )
    setBusy(true)
    setError('')
    transcriptFollowRef.current = true
    try {
      const resumed = await transport.gateway.request<SessionCreateResult>(
        'session.resume',
        {
          session_id: session.id,
          profile: connection.profile === 'default' ? '' : connection.profile,
          cols: 100,
        },
      )
      if (!selectionIsCurrent()) return ''
      const storedId = resumed.stored_session_id || session.id
      selectedStoredIdRef.current = storedId
      runtimeSessionIdRef.current = resumed.session_id
      setSelectedStoredId(storedId)
      setRuntimeSessionId(resumed.session_id)
      setSessionCwd(
        resumed.info?.cwd ||
          session.cwd ||
          session.git_repo_root ||
          preferredWorkspace,
      )
      let messages = resumed.messages ?? []
      try {
        const history = await transport.gateway.request<{
          messages?: unknown[]
        }>('session.history', { session_id: resumed.session_id })
        if (!selectionIsCurrent()) return ''
        messages = history.messages ?? messages
      } catch {
        // session.resume already returns a compatible history projection.
      }
      if (!selectionIsCurrent()) return ''
      const cached =
        readCachedTranscript(
          transcriptCacheRef.current,
          connection.id,
          storedId,
        ) ??
        readCachedTranscript(
          transcriptCacheRef.current,
          connection.id,
          session.id,
        )
      setTranscript(current => {
        if (cached) return mergeResumedTranscript(cached, messages)
        return previousStoredId && previousStoredId === storedId
          ? mergeResumedTranscript(current, messages)
          : historyToTranscript(messages)
      })
      setActiveTab('chat')
      return resumed.session_id
    } catch (resumeError) {
      if (!selectionIsCurrent()) return ''
      setError(
        resumeError instanceof Error
          ? resumeError.message
          : String(resumeError),
      )
      throw resumeError
    } finally {
      if (selectionIsCurrent()) setBusy(false)
    }
  }

  async function ensureSession(preview = ''): Promise<string> {
    const activeRuntimeId = runtimeSessionIdRef.current
    if (activeRuntimeId) return activeRuntimeId
    const transport = transportRef.current
    if (!transport) throw new Error('Connect to Hermes first')
    const storedSessionId = selectedStoredIdRef.current
    if (storedSessionId) {
      const resumed = await transport.gateway.request<SessionCreateResult>(
        'session.resume',
        {
          session_id: storedSessionId,
          profile:
            connectionRef.current.profile === 'default'
              ? ''
              : connectionRef.current.profile,
          cols: 100,
        },
      )
      const storedId = resumed.stored_session_id || storedSessionId
      runtimeSessionIdRef.current = resumed.session_id
      selectedStoredIdRef.current = storedId
      setRuntimeSessionId(resumed.session_id)
      setSelectedStoredId(storedId)
      setSessionCwd(
        resumed.info?.cwd || preferredWorkspace,
      )
      if (resumed.messages?.length) {
        setTranscript(current =>
          mergeResumedTranscript(current, resumed.messages ?? []),
        )
      }
      return resumed.session_id
    }
    const created = await transport.gateway.request<SessionCreateResult>(
      'session.create',
      sessionCreateParams({
        cwd: preferredWorkspace,
        preview,
        profile: connection.profile,
      }),
    )
    runtimeSessionIdRef.current = created.session_id
    selectedStoredIdRef.current = created.stored_session_id
    setRuntimeSessionId(created.session_id)
    setSelectedStoredId(created.stored_session_id)
    setSessionCwd(created.info?.cwd || preferredWorkspace)
    return created.session_id
  }

  function appendSystem(text: string) {
    if (!text.trim()) return
    setTranscript(current => [
      ...current,
      {
        id: `system-${Date.now()}-${current.length}`,
        kind: 'event',
        text,
      },
    ])
  }

  async function submitPrompt(text: string, sessionId: string) {
    const transport = transportRef.current
    if (!transport) throw new Error('Connect to Hermes first')
    setTurnActive(true)
    try {
      await transport.gateway.request('prompt.submit', {
        session_id: sessionId,
        text,
      })
    } catch (submitError) {
      setTurnActive(false)
      throw submitError
    }
    void refreshSessions(transport)
  }

  async function handleCommandDirective(
    result: unknown,
    command: string,
    sessionId: string,
    depth: number,
  ): Promise<boolean> {
    const row = directive(result)
    if (!row.type) {
      if (row.output || row.warning) {
        appendSystem(
          [row.warning ? `Warning: ${row.warning}` : '', row.output || '']
            .filter(Boolean)
            .join('\n'),
        )
        return true
      }
      return false
    }

    if (row.type === 'exec' || row.type === 'plugin') {
      appendSystem(row.output || '(no output)')
      return true
    }
    if (row.type === 'alias' && row.target) {
      await runSlash(aliasCommand(row.target, command), sessionId, depth + 1)
      return true
    }
    if (row.notice) appendSystem(row.notice)
    if (row.type === 'prefill') {
      setDraft(row.message || '')
      return true
    }
    if (row.type === 'send' || row.type === 'skill') {
      if (row.type === 'skill') {
        appendSystem(`Loading skill: ${row.name || commandParts(command).name}`)
      }
      if (!row.message?.trim()) {
        appendSystem(`/${commandParts(command).name}: empty message`)
        return true
      }
      await submitPrompt(row.message, sessionId)
      return true
    }
    return false
  }

  async function runSlash(
    rawCommand: string,
    existingSessionId = '',
    depth = 0,
  ): Promise<void> {
    if (depth > 5) throw new Error('Slash alias loop detected')
    const transport = transportRef.current
    if (!transport) throw new Error('Connect to Hermes first')
    const command = rawCommand.trim()
    const { name, arg } = commandParts(command)
    if (!name) throw new Error('Enter a slash command')

    if (name === 'new') {
      startDraft()
      return
    }
    if (name === 'clear') {
      setTranscript([])
      return
    }
    if (name === 'sessions' || name === 'resume') {
      setActiveTab('sessions')
      return
    }
    if (name === 'stop' || name === 'interrupt') {
      await stop()
      return
    }
    if (name === 'help' && !arg) {
      appendSystem(
        commandCatalog
          .map(([key, description]) => `${key}  ${description}`)
          .join('\n'),
      )
      return
    }

    const sessionId = existingSessionId || (await ensureSession(command))
    appendSystem(command)
    let slashError: unknown = null
    try {
      const result = await transport.gateway.request('slash.exec', {
        session_id: sessionId,
        command: command.replace(/^\/+/, ''),
      })
      if (await handleCommandDirective(result, command, sessionId, depth))
        return
    } catch (error) {
      slashError = error
    }

    try {
      const result = await transport.gateway.request('command.dispatch', {
        session_id: sessionId,
        name,
        arg,
      })
      if (await handleCommandDirective(result, command, sessionId, depth))
        return
      appendSystem(`/${name}: no output`)
    } catch (dispatchError) {
      throw slashError ?? dispatchError
    }
  }

  async function sendTextToHermes(text: string): Promise<boolean> {
    const transport = transportRef.current
    if (!text || !transport) return false

    setBusy(true)
    setError('')
    setDraft('')
    setWakeReviewPending(false)
    transcriptFollowRef.current = true
    try {
      if (text.startsWith('/')) {
        await runSlash(text)
      } else {
        const sessionId = await ensureSession(text)
        setTranscript(current => [
          ...current,
          {
            id: `user-${Date.now()}-${current.length}`,
            kind: 'user',
            text,
          },
        ])
        await submitPrompt(text, sessionId)
      }
      return true
    } catch (submitError) {
      setDraft(text)
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  async function sendWakeTranscript(text: string): Promise<void> {
    const sent = await sendTextToHermes(text.trim())
    if (sent) setNotice('Wake request sent to Hermes.')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    await sendTextToHermes(text)
  }

  async function stop() {
    const transport = transportRef.current
    if (!transport || !runtimeSessionId) return
    try {
      await transport.gateway.request('session.interrupt', {
        session_id: runtimeSessionId,
      })
      setTurnActive(false)
      appendSystem('Interrupt requested.')
    } catch (stopError) {
      setError(
        stopError instanceof Error ? stopError.message : String(stopError),
      )
    }
  }

  async function respondToRequest(
    request: RequestTranscriptData,
    value: string,
  ) {
    const transport = transportRef.current
    if (!transport) throw new Error('Connect to Hermes first')
    setError('')
    try {
      if (request.kind === 'approval') {
        await transport.gateway.request('approval.respond', {
          session_id: runtimeSessionId,
          choice: value === 'approve' ? 'once' : 'deny',
        })
      } else {
        const key =
          request.kind === 'clarify'
            ? 'answer'
            : request.kind === 'sudo'
              ? 'password'
              : 'value'
        await transport.gateway.request(`${request.kind}.respond`, {
          request_id: request.requestId,
          [key]: value,
        })
      }
      setTranscript(current => markRequestAnswered(current, request.requestId))
    } catch (responseError) {
      setError(
        responseError instanceof Error
          ? responseError.message
          : String(responseError),
      )
      throw responseError
    }
  }

  function startDraft() {
    sessionSelectionEpochRef.current += 1
    stopPlayback()
    transcriptFollowRef.current = true
    selectedStoredIdRef.current = ''
    runtimeSessionIdRef.current = ''
    setSelectedStoredId('')
    setRuntimeSessionId('')
    setTurnActive(false)
    setBusy(false)
    setWakeReviewPending(false)
    setSessionCwd('')
    setTranscript([])
    setError('')
    setActiveTab('chat')
  }

  function changeAutoSpeak(enabled: boolean) {
    setAutoSpeak(enabled)
    autoSpeakRef.current = enabled
    persistAutoSpeak(connection.id, enabled)
    if (!enabled) stopPlayback()
  }

  function changeWakeWordMode(mode: WakeWordMode) {
    setWakeWordMode(mode)
    wakeWordModeRef.current = mode
    persistWakeWordMode(connection.id, mode)
    if (mode === 'off') {
      cancelWakeCapture()
      setWakeReviewPending(false)
    }
  }

  function changeVoiceSelection(selection: VoiceSelection) {
    setVoiceSelection(selection)
    persistVoiceSelection(connection.id, selection)
    stopPlayback()
  }

  function changeThemeSelection(selection: MobileThemeSelection) {
    setThemeSelection(selection)
    themeSelectionRef.current = selection
    persistThemeSelection(connection.id, selection)
    applyThemeSelection(
      selection,
      hostSkinForConnection(hostSkinRef.current, connection.id),
    )
  }

  async function applySessionWorkspace(cwd: string) {
    const path = cwd.trim()
    if (!path) return
    const transport = transportRef.current
    if (!transport) throw new Error('Connect to Hermes first')
    let resolved = path
    const activeRuntimeId = runtimeSessionIdRef.current
    if (activeRuntimeId) {
      const info = await transport.gateway.request<{
        branch?: string
        cwd?: string
      }>('session.cwd.set', {
        session_id: activeRuntimeId,
        cwd: path,
      })
      resolved = info.cwd || path
      setSessionCwd(resolved)
      setSessions(current =>
        current.map(session =>
          session.id === selectedStoredIdRef.current
            ? { ...session, cwd: resolved, git_branch: info.branch }
            : session,
        ),
      )
      void refreshSessions(transport)
    }
    setPreferredWorkspace(resolved)
    persistPreferredWorkspace(connection.id, resolved)
    setNotice(
      activeRuntimeId
        ? `Session workspace set to ${resolved}`
        : `New conversations will start in ${resolved}`,
    )
  }

  async function chooseShareConnection(
    target: BrowserConnection,
  ): Promise<boolean> {
    setShareWorkspace(loadPreferredWorkspace(target.id))
    if (
      target.id === connectionRef.current.id &&
      connected &&
      transportRef.current &&
      desiredConnectedRef.current
    ) {
      return true
    }
    return switchSavedConnection(target)
  }

  async function discardPendingShare() {
    const share = pendingShare
    setPendingShare(null)
    setShareWorkspaceOpen(false)
    sharedImageUploadRef.current = null
    if (!share || !nativeClient) return
    await HermesNative.discardShare({ shareId: share.id }).catch(
      () => undefined,
    )
  }

  async function sendPendingShare(destination: ShareDestination) {
    const share = pendingShare
    const transport = transportRef.current
    if (!share || !transport || !connected) {
      throw new Error('Connect the selected Hermes target first')
    }
    if (destination.connectionId !== connectionRef.current.id) {
      throw new Error('The selected Hermes target is not active')
    }

    setBusy(true)
    setError('')
    transcriptFollowRef.current = true
    try {
      const promptText = sharedPromptText(share, destination.text)
      let sessionId = ''
      if (destination.sessionId === 'new') {
        const created = await transport.gateway.request<SessionCreateResult>(
          'session.create',
          sessionCreateParams({
            cwd: destination.cwd,
            preview: promptText,
            profile: connectionRef.current.profile,
          }),
        )
        sessionId = created.session_id
        runtimeSessionIdRef.current = sessionId
        selectedStoredIdRef.current = created.stored_session_id
        setRuntimeSessionId(sessionId)
        setSelectedStoredId(created.stored_session_id)
        setSessionCwd(created.info?.cwd || destination.cwd)
        setTranscript(historyToTranscript(created.messages ?? []))
      } else {
        const session = sessions.find(row => row.id === destination.sessionId)
        if (!session) {
          throw new Error('The selected session is no longer available')
        }
        sessionId = await selectSession(session)
        if (!sessionId) {
          throw new Error('Session selection was superseded')
        }
      }

      if (
        share.kind === 'image' &&
        (sharedImageUploadRef.current?.shareId !== share.id ||
          sharedImageUploadRef.current.sessionId !== sessionId)
      ) {
        const image = await HermesNative.readSharedImage({ shareId: share.id })
        const attached = await transport.gateway.request<{
          attached?: boolean
          message?: string
        }>(
          'image.attach_bytes',
          sharedImageAttachParams(share, image.dataUrl, sessionId),
        )
        if (!attached.attached) {
          throw new Error(
            attached.message || 'Could not attach the shared image',
          )
        }
        sharedImageUploadRef.current = { sessionId, shareId: share.id }
      }

      const displayText =
        share.kind === 'image'
          ? [`[Shared image: ${share.name || 'image'}]`, promptText]
              .filter(Boolean)
              .join('\n\n')
          : promptText
      setTranscript(current => [
        ...current,
        {
          id: `user-${Date.now()}-${current.length}`,
          kind: 'user',
          text: displayText,
        },
      ])
      await submitPrompt(promptText, sessionId)
      setActiveTab('chat')
      setNotice(`Sent to ${connectionRef.current.name || 'Hermes'}`)
      await discardPendingShare()
    } finally {
      setBusy(false)
    }
  }

  const wakeCaptureActive = wakeWordStatus === 'capturing'
  const wakeTranscribing = wakeWordStatus === 'transcribing'

  return (
    <EmbedPreferencesProvider connectionId={connection.id}>
      <main className="app-shell">
        <header className="topbar">
          <button className="brand-button" onClick={() => setActiveTab('chat')}>
            <img
              alt=""
              aria-hidden="true"
              className="brand-mark"
              src="./nous-sidecar-128.png"
            />
            <span>
              <small>Hermes</small>
              <strong>Mobile</strong>
            </span>
          </button>
          <button
            className={`host-pill state-${connectionState}`}
            onClick={() => setConnectionOpen(true)}
          >
            <span className="host-dot" />
            <span>
              {connected ? connection.name || 'Connected' : 'Connect'}
            </span>
            <span className="host-chevron">⌄</span>
          </button>
        </header>

        {(error || notice) && (
          <div className={`toast ${error ? 'toast-error' : 'toast-success'}`}>
            <span>{error || notice}</span>
            <button
              aria-label="Dismiss"
              onClick={() => {
                setError('')
                setNotice('')
              }}
            >
              ×
            </button>
          </div>
        )}

        <div className="mobile-workspace">
          <section
            className={`app-view chat-view ${activeTab === 'chat' ? 'active' : ''}`}
          >
            <div className="thread-heading">
              <div>
                <p className="eyebrow">
                  {runtimeSessionId ? 'Live session' : 'Ready when you are'}
                </p>
                <h1>{activeSession?.title || 'New conversation'}</h1>
              </div>
              <div className="thread-actions">
                <button
                  className="thread-new-button quiet-button"
                  disabled={!connected || busy || turnActive}
                  onClick={startDraft}
                  type="button"
                >
                  <span aria-hidden="true">＋</span>
                  New
                </button>
                {runtimeSessionId && (
                  <button className="stop-button" onClick={() => void stop()}>
                    <span className="stop-square" />
                    Stop
                  </button>
                )}
              </div>
            </div>
            <button
              className="session-workspace-button"
              disabled={!connected || busy}
              onClick={() => setWorkspaceOpen(true)}
            >
              <span>Session cwd</span>
              <strong>
                {sessionCwd || preferredWorkspace || 'Choose workspace'}
              </strong>
              <small>Change</small>
            </button>
            <div
              aria-label="Session voice controls"
              className="chat-voice-controls"
            >
              <label>
                <span>Wake</span>
                <select
                  aria-label="Wake word behavior"
                  disabled={!nativeClient}
                  value={wakeWordMode}
                  onChange={event =>
                    changeWakeWordMode(event.target.value as WakeWordMode)
                  }
                >
                  <option value="off">Off</option>
                  <option value="review">Review</option>
                  <option value="send">Auto-send</option>
                </select>
              </label>
              <label>
                <span>Replies</span>
                <select
                  aria-label="Automatic reply playback"
                  value={autoSpeak ? 'auto' : 'manual'}
                  onChange={event =>
                    changeAutoSpeak(event.target.value === 'auto')
                  }
                >
                  <option value="manual">Manual</option>
                  <option value="auto">Auto-play</option>
                </select>
              </label>
            </div>

            <div
              className="transcript"
              aria-live="polite"
              ref={transcriptRef}
              onPointerDown={markTranscriptManualScroll}
              onScroll={handleTranscriptScroll}
              onTouchMove={markTranscriptManualScroll}
              onWheel={markTranscriptManualScroll}
            >
              <Transcript
                activeSpeechId={activeSpeechId}
                connectionId={connection.id}
                items={transcript}
                toolDetailMode={toolDetailMode}
                transport={transportRef.current}
                voicePhase={voicePhase}
                onOpenDocumentPreviewer={document => {
                  setReaderImport({
                    document,
                    id: Date.now(),
                    mode: 'preview',
                  })
                  setActiveTab('reader')
                }}
                onOpenDocumentReader={document => {
                  setReaderImport({
                    document,
                    id: Date.now(),
                    mode: 'reader',
                  })
                  setActiveTab('reader')
                }}
                onRespond={respondToRequest}
                onSpeak={(text, itemId) =>
                  toggleSpeech(markdownToSpeechText(text), itemId)
                }
              />
            </div>

            <form className="composer" onSubmit={event => void submit(event)}>
              {wakeReviewPending && (
                <div className="wake-review" role="status">
                  <div>
                    <strong>Wake request ready</strong>
                    <span>{draft || 'No request text'}</span>
                  </div>
                  <div className="wake-review-actions">
                    <button
                      className="quiet-button"
                      type="button"
                      onClick={() => {
                        setWakeReviewPending(false)
                        setDraft('')
                        setNotice('Wake request discarded.')
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      disabled={!draft.trim() || busy}
                      type="submit"
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
              {commandSuggestions.length > 0 && (
                <div className="command-suggestions">
                  {commandSuggestions.map(suggestion => (
                    <button
                      key={`${suggestion.text}-${suggestion.display}`}
                      type="button"
                      onClick={() => setDraft(`${suggestion.text} `)}
                    >
                      <strong>{suggestion.display}</strong>
                      <span>{suggestion.meta}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="composer-box">
                <button
                  aria-label={
                    wakeCaptureActive
                      ? 'Cancel wake request recording'
                      : voicePhase === 'recording'
                      ? 'Stop recording and transcribe'
                      : 'Record a voice message'
                  }
                  className={`voice-button ${
                    wakeCaptureActive || voicePhase === 'recording'
                      ? 'recording'
                      : ''
                  }`}
                  disabled={
                    !connected ||
                    (!wakeCaptureActive &&
                      (!voiceRecordingAvailable || wakeTranscribing))
                  }
                  type="button"
                  onClick={
                    wakeCaptureActive ? cancelWakeCapture : toggleRecording
                  }
                >
                  {wakeCaptureActive || voicePhase === 'recording' ? (
                    <span className="recording-stop" />
                  ) : (
                    <MicrophoneIcon />
                  )}
                </button>
                <textarea
                  ref={composerInputRef}
                  disabled={!connected}
                  placeholder={
                    connected ? 'Message Hermes…' : 'Connect to a Hermes host'
                  }
                  rows={1}
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={event => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                  }}
                />
                <button
                  aria-label="Send"
                  className="send-button"
                  disabled={!connected || busy || !draft.trim()}
                  type="submit"
                >
                  <SendIcon />
                </button>
              </div>
              <div className="composer-meta">
                <span>
                  {wakeCaptureActive
                    ? 'Listening for your request, pause when finished'
                    : wakeTranscribing
                      ? 'Hermes is transcribing your wake request'
                    : voicePhase === 'recording'
                    ? 'Recording, tap stop to transcribe'
                    : voicePhase === 'transcribing'
                      ? 'Hermes is transcribing'
                      : playbackPaused && activeSpeechId === 'reader'
                        ? 'Reader paused, microphone remains available'
                      : voicePhase === 'synthesizing'
                        ? 'Hermes is preparing reply audio'
                        : voicePhase === 'speaking'
                          ? 'Playing reply audio'
                          : runtimeSessionId
                            ? 'Session attached'
                            : 'Creates on send'}
                </span>
                {voicePhase === 'speaking' || voicePhase === 'synthesizing' ? (
                  <button
                    className="composer-audio-stop"
                    type="button"
                    onClick={stopPlayback}
                  >
                    Stop audio
                  </button>
                ) : (
                  <span>/ commands supported</span>
                )}
              </div>
            </form>
          </section>

          <section
            className={`app-view sessions-view ${
              activeTab === 'sessions' ? 'active' : ''
            }`}
          >
            <SessionsView
              activeProjectId={activeProjectId}
              connected={connected}
              profile={connection.profile}
              projectDetail={projectDetail}
              projectLoading={projectLoading}
              projects={projects}
              selectedSessionId={selectedStoredId}
              sessions={sessions}
              onNewSession={startDraft}
              onProject={selectProject}
              onRefresh={() => refreshSessions()}
              onSession={async session => {
                await selectSession(session)
              }}
            />
          </section>

          <section
            className={`app-view reader-view ${
              activeTab === 'reader' ? 'active' : ''
            }`}
          >
            <ReaderView
              key={connection.id}
              active={activeTab === 'reader'}
              activeSpeechId={activeSpeechId}
              connected={connected}
              connectionId={connection.id}
              latestText={latestAssistantText}
              normalVoice={voiceSelection}
              phase={voicePhase}
              playbackPaused={playbackPaused}
              transport={transportRef.current}
              importedDocument={readerImport}
              onRender={renderSequence}
              onPause={pausePlayback}
              onResume={resumePlayback}
              onSpeak={speakSequence}
              onStop={stopPlayback}
            />
          </section>

          <section
            className={`app-view files-view ${
              activeTab === 'files' ? 'active' : ''
            }`}
          >
            <FilesView
              key={connection.id}
              connected={connected}
              connectionId={connection.id}
              initialPath={
                sessionCwd ||
                activeSession?.cwd ||
                activeSession?.git_repo_root ||
                preferredWorkspace
              }
              transport={transportRef.current}
              onOpenInPreviewer={document => {
                setReaderImport({
                  document,
                  id: Date.now(),
                  mode: 'preview',
                })
                setActiveTab('reader')
              }}
              onOpenInReader={document => {
                setReaderImport({
                  document,
                  id: Date.now(),
                  mode: 'reader',
                })
                setActiveTab('reader')
              }}
              onUseAsWorkspace={path => applySessionWorkspace(path)}
            />
          </section>

          <section
            className={`app-view control-view ${
              activeTab === 'control' ? 'active' : ''
            }`}
          >
            <ControlPanel
              key={controlVisit}
              connected={connected}
              gateway={transportRef.current?.gateway ?? null}
              runtimeSessionId={runtimeSessionId}
              profile={connection.profile}
              sessionCwd={sessionCwd}
              preferredWorkspace={preferredWorkspace}
              activeSkinName={activeSkinName}
              themeSelection={themeSelection}
              autoSpeak={autoSpeak}
              wakeWordAvailable={nativeClient}
              wakeWordMode={wakeWordMode}
              wakeWordStatus={wakeWordStatus}
              transport={transportRef.current}
              voiceSelection={voiceSelection}
              voicePhase={voicePhase}
              pet={{
                catalog: pet.catalog,
                desktopSpeech: pet.desktopSpeech,
                desktopSpeechStatus: pet.desktopSpeechStatus,
                error: pet.error,
                hostCapabilities: pet.hostCapabilities,
                info: pet.info,
                personality: pet.personality,
                preferences: pet.preferences,
                status: pet.status,
                onPreferences: pet.updatePreferences,
                onPreviewVoice: pet.previewVoice,
                onRefreshDesktopSpeech: pet.refreshDesktopSpeech,
                onTest: pet.generateCommentary,
              }}
              onAutoSpeakChange={changeAutoSpeak}
              onWakeWordModeChange={changeWakeWordMode}
              onThemeSelectionChange={changeThemeSelection}
              onNotice={setNotice}
              onOpenWorkspace={() => setWorkspaceOpen(true)}
              onStopSpeech={stopPlayback}
              onToolDetailModeChange={changeToolDetailMode}
              onVoiceSelectionChange={changeVoiceSelection}
            />
          </section>

          {pet.preferences.visible && (
            <MobilePet
              bubble={pet.bubble}
              connectionId={connection.id}
              info={pet.info}
              key={connection.id}
              roam={pet.preferences.roam}
              sidechatAvailable={pet.hostCapabilities.sidechat}
              state={pet.state}
              onClick={pet.interact}
              onSidechat={() => setPetSidechatOpen(true)}
            />
          )}
        </div>

        <nav className="bottom-nav" aria-label="Primary">
          {(
            [
              ['chat', 'Chat'],
              ['sessions', 'Sessions'],
              ['reader', 'Reader'],
              ['files', 'Files'],
              ['control', 'Control'],
            ] as Array<[AppTab, string]>
          ).map(([tab, label]) => (
            <button
              className={activeTab === tab ? 'active' : ''}
              key={tab}
              onClick={() => {
                if (tab === 'control') setControlVisit(value => value + 1)
                setActiveTab(tab)
              }}
            >
              <span className="nav-icon-shell">
                <NavIcon tab={tab} />
              </span>
              <small>{label}</small>
            </button>
          ))}
        </nav>
        <WorkspaceSheet
          connected={connected}
          currentPath={sessionCwd || preferredWorkspace}
          open={workspaceOpen}
          transport={transportRef.current}
          onApply={applySessionWorkspace}
          onClose={() => setWorkspaceOpen(false)}
        />

        <ShareSheet
          activeConnection={connection}
          activeSessionId={selectedStoredId}
          busy={busy}
          connected={connected}
          connections={savedConnections}
          defaultWorkspace={preferredWorkspace}
          sessions={sessions}
          share={pendingShare}
          shareWorkspace={shareWorkspace}
          onChooseWorkspace={() => setShareWorkspaceOpen(true)}
          onClose={() => void discardPendingShare()}
          onConnection={chooseShareConnection}
          onSend={sendPendingShare}
        />

        <WorkspaceSheet
          applyLabel="Use for new session"
          connected={connected}
          currentPath={shareWorkspace || preferredWorkspace}
          description="This directory is used only for the new conversation receiving the shared content."
          eyebrow="Shared destination"
          open={shareWorkspaceOpen}
          stacked
          title="Choose new-session workspace"
          transport={transportRef.current}
          onApply={async path => {
            setShareWorkspace(path)
          }}
          onClose={() => setShareWorkspaceOpen(false)}
        />

        <ConnectionSheet
          busy={busy}
          capabilities={capabilities}
          cloudAgents={cloudAgents}
          cloudOrgs={cloudOrgs}
          cloudSignedIn={cloudSignedIn}
          connected={connected}
          connection={connection}
          nativeClient={nativeClient}
          open={connectionOpen}
          savedConnections={savedConnections}
          onClose={() => setConnectionOpen(false)}
          onCloudAgent={connectCloudAgent}
          onCloudDiscover={discoverCloud}
          onCloudLogin={signInToCloud}
          onCloudLogout={signOutOfCloud}
          onConnect={async () => {
            await connect(connection)
          }}
          onConnectionChange={setConnection}
          onDisconnect={disconnect}
          onDeleteConnection={deleteSavedConnection}
          onEditConnection={editSavedConnection}
          onNewDirect={newDirectConnection}
          onSaveConnection={saveEditedConnection}
          onSavedConnection={async saved => {
            await switchSavedConnection(saved)
          }}
        />
      </main>
      <PetSidechatSheet
        busy={pet.sidechat.busy}
        error={pet.sidechat.error}
        messages={pet.sidechat.messages}
        name={pet.personality?.displayName || pet.info.displayName || 'Pet'}
        open={petSidechatOpen}
        onClose={() => setPetSidechatOpen(false)}
        onLoad={pet.sidechat.load}
        onReset={pet.sidechat.reset}
        onSend={pet.sidechat.send}
        onSendToHermes={text => setDraft(text)}
        onToggleRecording={toggleRecording}
        onTranscriptTarget={target => {
          petSidechatTranscriptRef.current = target
        }}
        voicePhase={voicePhase}
        voiceRecordingAvailable={voiceRecordingAvailable}
      />
    </EmbedPreferencesProvider>
  )
}
