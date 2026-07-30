import { describe, expect, test } from 'vitest'
import type { SharedContent } from '../transport/native-bridge'
import {
  canSendSharedContent,
  sharedImageAttachParams,
  sharedPromptText,
} from './share'

const image: SharedContent = {
  id: 'share-1',
  kind: 'image',
  mimeType: 'image/png',
  name: 'screen.png',
  text: '',
}

describe('Android shared-content routing', () => {
  test('gives image-only shares a useful prompt without changing entered text', () => {
    expect(sharedPromptText(image, '')).toBe(
      'Take a look at this shared image.',
    )
    expect(sharedPromptText(image, 'inspect this')).toBe('inspect this')
  })

  test('builds the existing gateway image upload contract', () => {
    expect(
      sharedImageAttachParams(image, 'data:image/png;base64,AAAA', 'runtime-1'),
    ).toEqual({
      session_id: 'runtime-1',
      content_base64: 'data:image/png;base64,AAAA',
      filename: 'screen.png',
    })
  })

  test('requires the chosen host to be connected and new sessions to have a cwd', () => {
    expect(
      canSendSharedContent(
        image,
        {
          connectionId: 'host-b',
          sessionId: 'new',
          cwd: '/work',
          text: '',
        },
        'host-a',
        true,
      ),
    ).toBe(false)
    expect(
      canSendSharedContent(
        image,
        {
          connectionId: 'host-a',
          sessionId: 'new',
          cwd: '',
          text: '',
        },
        'host-a',
        true,
      ),
    ).toBe(false)
    expect(
      canSendSharedContent(
        image,
        {
          connectionId: 'host-a',
          sessionId: 'stored-1',
          cwd: '',
          text: '',
        },
        'host-a',
        true,
      ),
    ).toBe(true)
  })
})
