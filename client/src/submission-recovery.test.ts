import { describe, expect, it, vi } from 'vitest'
import { JsonRpcGatewayError, SUBMISSION_UNCERTAIN_MESSAGE } from './protocol/json-rpc-client'
import { submissionFailureDisposition, submitWithExecutionTruth } from './submission-recovery'

const uncertain = () => new JsonRpcGatewayError(SUBMISSION_UNCERTAIN_MESSAGE, -32052, {
  reason: 'SUBMISSION_DELIVERY_UNCERTAIN', submission_id: 'synthetic-dispatch',
})

describe('actual submit execution-truth boundary', () => {
  it('never retires, restores a replayable draft or drops an optimistic row on uncertainty', async () => {
    let active = false
    const call = vi.fn().mockRejectedValue(uncertain())
    const retire = vi.fn(() => { active = false })
    await expect(submitWithExecutionTruth(call, () => { active = true }, retire, () => true)).rejects.toMatchObject({ code: -32052 })
    expect(active).toBe(true)
    expect(retire).not.toHaveBeenCalled()
    expect(call).toHaveBeenCalledOnce()
    expect(submissionFailureDisposition(uncertain())).toEqual({ clearTurn: false, restoreDraft: false, removeOptimistic: false })
  })

  it('does not overwrite a newer authoritative terminal or newly selected source after delayed rejection', async () => {
    let active = false
    let current = true
    let reject!: (error: Error) => void
    const request = new Promise<void>((_, fail) => { reject = fail })
    const pending = submitWithExecutionTruth(() => request, () => { active = true }, () => { active = false }, () => current)
    const outcome = pending.catch(error => error)
    active = false // real terminal event arrived before the acknowledgement loss
    current = false
    reject(uncertain())
    await outcome
    expect(active).toBe(false)
    expect(submissionFailureDisposition(new Error('legacy failure'), false).clearTurn).toBe(false)
  })

  it.each([new Error('legacy timeout'), new JsonRpcGatewayError('session busy', 4009)])(
    'retains definite/legacy failure behavior for %s', async error => {
      const retire = vi.fn()
      await expect(submitWithExecutionTruth(() => Promise.reject(error), vi.fn(), retire, () => true)).rejects.toBe(error)
      expect(retire).toHaveBeenCalledOnce()
      expect(submissionFailureDisposition(error).restoreDraft).toBe(true)
    },
  )
})
