import { HermesNative, isNativeHermesClient } from './transport/native-bridge'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new Error('Could not prepare the rendered file'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(blob)
  })
}

export async function saveBlob(
  blob: Blob,
  filename: string,
  mimeType = blob.type || 'application/octet-stream',
): Promise<boolean> {
  if (isNativeHermesClient()) {
    const result = await HermesNative.saveDataFile({
      dataUrl: await blobToDataUrl(blob),
      filename,
      mimeType,
    })
    return result.saved
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.rel = 'noopener noreferrer'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    return true
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
  }
}
