import { isSubmissionDeliveryUncertain } from './protocol/json-rpc-client'

export function submissionFailureDisposition(error: unknown, current = true) {
  const definite = !isSubmissionDeliveryUncertain(error)
  return { clearTurn: current && definite, restoreDraft: current && definite, removeOptimistic: current && definite }
}

/** Submit acknowledgement loss is not an execution verdict. No retry lives here. */
export async function submitWithExecutionTruth<T>(
  call: () => Promise<T>, claim: () => void, retire: () => void, isCurrent: () => boolean,
): Promise<T> {
  claim()
  try {
    return await call()
  } catch (error) {
    if (submissionFailureDisposition(error, isCurrent()).clearTurn) retire()
    throw error
  }
}
