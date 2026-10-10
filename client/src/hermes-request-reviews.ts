export type HermesRequestStatus = 'pending' | 'submitting' | 'uncertain' | 'error' | 'sent'

export interface HermesRequestScope {
  connectionId: string
  profile: string
  sessionId: string
  generation: number
}

export interface HermesRequestReview extends HermesRequestScope {
  requestId: string
  revision: number
  message: string
  targetTitle: string
  workerId: string
  status: HermesRequestStatus
  error: string
  maxWorkers?: number
  delegationLimitSupported: boolean
}

export interface DraftHermesRequest {
  message: string
  requestId?: unknown
  expectedDraft?: unknown
  expectedRevision?: unknown
}

export const HERMES_REQUEST_GUIDE = 'Hermes is a full agent for quick answers or long-running work. Every request remains an independent editable review until its visible Send button is pressed. Spoken words never send, approve, delete or cancel reviews. To add another request call draft_hermes_request with message only and omit expectedDraft. To revise a request, read current application evidence and supply its exact current message as expectedDraft. This must match exactly one current request. Duplicate text or stale evidence fails without changing requests. Do not send unadvertised tool arguments. If the host advertises requestId and expectedRevision, exact IDs with revision guards are also supported. Acceptance is not completion.'

function sameScope(left: HermesRequestScope, right: HermesRequestScope) {
  return left.connectionId === right.connectionId && left.profile === right.profile &&
    left.sessionId === right.sessionId && left.generation === right.generation
}

/** App-owned reviews. Neither selection nor a transport reconnect owns delivery. */
export class HermesRequestReviews {
  private rows: HermesRequestReview[] = []
  private selected = ''
  private operations = new Map<string, symbol>()
  constructor(private readonly newId: () => string = () => crypto.randomUUID()) {}
  get requests(): HermesRequestReview[] { return this.rows.map(row => ({ ...row })) }
  get selectedRequestId() { return this.selected }
  get active() { return this.get(this.selected) }
  get(requestId: string) { return this.rows.find(row => row.requestId === requestId) }
  reset() { this.rows = []; this.selected = ''; this.operations.clear() }
  select(requestId: string) {
    if (!this.get(requestId)) return false
    this.selected = requestId
    return true
  }
  add(message: string, target: Omit<HermesRequestReview, 'requestId' | 'revision' | 'message' | 'status' | 'error'>) {
    const row: HermesRequestReview = { ...target, message, requestId: this.newId(), revision: 1, status: 'pending', error: '' }
    this.rows = [...this.rows, row]
    this.selected = row.requestId
    return row
  }
  draft(args: DraftHermesRequest, target: Omit<HermesRequestReview, 'requestId' | 'revision' | 'message' | 'status' | 'error'>) {
    if (!args.message.trim()) throw new Error('draft_hermes_request needs a message')
    // Older server tools supply an empty optional expectedDraft on creation.
    // Never treat it as a revision guard when an unsent request actually exists.
    if (args.requestId === undefined && args.expectedRevision === undefined && args.expectedDraft === '' &&
      !this.rows.some(row => row.status !== 'sent')) return this.add(args.message, target)
    const editing = args.requestId !== undefined || args.expectedDraft !== undefined || args.expectedRevision !== undefined
    if (!editing) return this.add(args.message, target)
    const pending = this.rows.filter(row => row.status !== 'sent')
    if (args.requestId === undefined && !pending.length)
      throw new Error('No draft is pending. To create another request call draft_hermes_request with message only and omit expectedDraft, expectedRevision and requestId. No request changed.')
    // The host's current public tool advertises message/expectedDraft only.
    // A unique exact-text guard identifies a stable row without selecting it.
    const candidates = pending.filter(row =>
      (args.expectedDraft === undefined || row.message === args.expectedDraft) &&
      (args.expectedRevision === undefined || row.revision === args.expectedRevision))
    if (args.requestId === undefined && candidates.length !== 1)
      throw new Error(`${candidates.length ? 'Ambiguous' : 'Stale'} request revision. Read current reviews and use the exact text of one unique request, or edit its visible card. No request changed.`)
    if (args.requestId !== undefined && (typeof args.requestId !== 'string' || !args.requestId))
      throw new Error('requestId must be an exact nonempty application ID. No request changed.')
    const row = args.requestId === undefined ? candidates[0] : this.get(args.requestId as string)
    if (!row) throw new Error('No draft is pending for that requestId. Read current reviews before revising. No request changed.')
    if (!sameScope(row, target) || row.workerId !== target.workerId)
      throw new Error('A different target owns that request. No request changed.')
    if (args.expectedDraft === undefined && args.expectedRevision === undefined)
      throw new Error('Revision requires expectedDraft or expectedRevision. No request changed.')
    if ((args.expectedDraft !== undefined && args.expectedDraft !== row.message) ||
      (args.expectedRevision !== undefined && args.expectedRevision !== row.revision))
      throw new Error('Stale request revision. Read current reviews for the exact requestId, text and revision. No request changed.')
    this.edit(row.requestId, args.message)
    return this.get(row.requestId)!
  }
  edit(requestId: string, message: string) {
    const row = this.get(requestId)
    if (!row || !['pending', 'error'].includes(row.status)) throw new Error('This request is not editable. No request changed.')
    this.rows = this.rows.map(item => item.requestId === requestId
      ? { ...item, message, revision: item.revision + 1, status: 'pending', error: '' } : item)
  }
  remove(requestId: string) {
    const row = this.get(requestId)
    if (!row || row.status === 'submitting') return false
    this.operations.delete(requestId)
    const index = this.rows.indexOf(row)
    this.rows = this.rows.filter(item => item.requestId !== requestId)
    if (this.selected === requestId) this.selected = this.rows[Math.min(index, this.rows.length - 1)]?.requestId ?? ''
    return true
  }
  begin(requestId: string) {
    const row = this.get(requestId)
    if (!row?.message.trim() || !['pending', 'error'].includes(row.status) || this.operations.size) return null
    const owner = Symbol(requestId)
    this.operations.set(requestId, owner)
    this.rows = this.rows.map(item => item.requestId === requestId ? { ...item, status: 'submitting', error: '' } : item)
    return { owner, request: { ...row } }
  }
  settle(requestId: string, owner: symbol, scope: HermesRequestScope, status: 'sent' | 'error' | 'uncertain', error = '') {
    const row = this.get(requestId)
    if (!row || this.operations.get(requestId) !== owner || !sameScope(row, scope)) return false
    this.operations.delete(requestId)
    this.rows = this.rows.map(item => item.requestId === requestId ? { ...item, status, error } : item)
    return true
  }
}
