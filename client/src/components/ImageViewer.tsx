import { useState } from 'react'

export function ImagePreview({
  alt,
  showHint = true,
  src,
}: {
  alt: string
  showHint?: boolean
  src: string
}) {
  const [fullScreen, setFullScreen] = useState(false)
  const [actualSize, setActualSize] = useState(false)

  return (
    <>
      <span className="image-preview">
        <button
          aria-label={`Open ${alt} full screen`}
          className="image-preview-button"
          type="button"
          onClick={() => setFullScreen(true)}
        >
          <img alt={alt} src={src} />
        </button>
        {showHint && <small>Tap the image for the full-screen viewer.</small>}
      </span>
      {fullScreen && (
        <span
          aria-label={`${alt} image viewer`}
          aria-modal="true"
          className="image-viewer"
          role="dialog"
        >
          <span className="image-viewer-toolbar">
            <button
              className="quiet-button"
              type="button"
              onClick={() => setActualSize(value => !value)}
            >
              {actualSize ? 'Fit screen' : 'Actual size'}
            </button>
            <button
              aria-label="Close image viewer"
              className="icon-button"
              type="button"
              onClick={() => setFullScreen(false)}
            >
              ×
            </button>
          </span>
          <span
            className={`image-viewer-canvas ${actualSize ? 'actual-size' : ''}`}
          >
            <img alt={alt} src={src} />
          </span>
        </span>
      )}
    </>
  )
}
