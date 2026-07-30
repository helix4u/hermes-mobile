import { isMissingCapabilityError } from './capability-errors'
import {
  FULL_PET_HOST_CAPABILITIES,
  type PetHostCapabilities,
  VISUAL_ONLY_PET_HOST_CAPABILITIES,
} from './pet'

export interface PetCapabilityProbe {
  capabilities: PetHostCapabilities
  error: string
}

export function resolvePetCapabilityProbe(
  result: PromiseSettledResult<unknown>,
): PetCapabilityProbe {
  if (result.status === 'fulfilled') {
    return {
      capabilities: FULL_PET_HOST_CAPABILITIES,
      error: '',
    }
  }
  return {
    capabilities: VISUAL_ONLY_PET_HOST_CAPABILITIES,
    error: isMissingCapabilityError(result.reason)
      ? ''
      : result.reason instanceof Error
        ? result.reason.message
        : String(result.reason),
  }
}
