import { SentencePieceProcessor } from '@sctg/sentencepiece-js'
import { normalizeSherpaWakePhrase } from './wake-word'

const BPE_MODEL_URL =
  '/wakeword/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01/bpe.model'

let processorPromise: Promise<SentencePieceProcessor> | null = null

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

async function loadProcessor(): Promise<SentencePieceProcessor> {
  if (processorPromise) return processorPromise
  processorPromise = (async () => {
    const response = await fetch(BPE_MODEL_URL, { cache: 'force-cache' })
    if (!response.ok) {
      throw new Error(`Could not load the bundled Sherpa tokenizer (${response.status})`)
    }
    const processor = new SentencePieceProcessor()
    await processor.loadFromB64StringModel(
      bytesToBase64(new Uint8Array(await response.arrayBuffer())),
    )
    return processor
  })().catch(error => {
    processorPromise = null
    throw error
  })
  return processorPromise
}

export function formatSherpaKeywordDefinition(
  pieces: readonly string[],
  phrase: string,
): string {
  const normalized = normalizeSherpaWakePhrase(phrase)
  if (!normalized || !pieces.length || pieces.some(piece => !piece.trim())) {
    throw new Error('Enter a valid English wake phrase')
  }
  const display = normalized.toUpperCase().replace(/ /g, '_')
  return `${pieces.join(' ')} @${display}`
}

export async function buildSherpaKeywordDefinition(
  phrase: string,
): Promise<string> {
  const normalized = normalizeSherpaWakePhrase(phrase)
  if (!normalized) throw new Error('Enter a valid English wake phrase')
  const processor = await loadProcessor()
  return formatSherpaKeywordDefinition(
    processor.encodePieces(normalized.toUpperCase()),
    normalized,
  )
}
