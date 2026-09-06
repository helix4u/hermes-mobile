import { useState } from 'react'
import { createPortal } from 'react-dom'
import { HermesNative, isNativeHermesClient } from '../transport/native-bridge'
import { voiceWebpageUrl } from '../voice-webpage'

export function VoiceWebpageNotice({ url, onClose }: { url: string; onClose: () => void }) {
  const [error, setError] = useState('')
  return createPortal(<aside className="voice-review-notice" aria-label="Voice webpage">
    <span style={{ overflowWrap: 'anywhere', flex: '1 1 12rem' }}>{url}</span>
    {error && <span role="alert">{error}</span>}
    <button className="quiet-button" onClick={() => {
      const safe = voiceWebpageUrl(url)
      if (isNativeHermesClient()) void HermesNative.openExternalUrl({ url: safe }).then(result => {
        if (!result.opened) throw new Error('No browser opened this link.')
        onClose()
      }).catch(reason => setError(String(reason)))
      else {
        const link = document.createElement('a')
        link.href = safe; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click()
        onClose()
      }
    }}>Open webpage</button>
    <button className="quiet-button" onClick={onClose}>Dismiss</button>
  </aside>, document.body)
}
