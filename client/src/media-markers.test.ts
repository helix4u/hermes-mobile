import { describe, expect, test } from 'vitest'
import {
  displayTextForMediaMarkers,
  mediaPathFromHref,
  renderMediaMarkers,
  stripMediaMarkers,
} from './media-markers'

describe('Hermes MEDIA markers', () => {
  test('turns a Windows generated-image marker into a private media link', () => {
    const path =
      'C:\\Users\\person\\AppData\\Local\\hermes\\cache\\images\\result.png'
    const rendered = renderMediaMarkers(`Here he is.\n\nMEDIA:${path}`)

    expect(rendered).toContain('[Image: result.png](#hermes-media:')
    expect(mediaPathFromHref(rendered.match(/\((#hermes-media:[^)]+)\)/)?.[1]))
      .toBe(path)
  })

  test('supports quoted paths with spaces and labels other media types', () => {
    expect(
      renderMediaMarkers('MEDIA:"C:\\renders\\daily podcast.mp3"'),
    ).toContain('[Audio: daily podcast.mp3](#hermes-media:')
    expect(renderMediaMarkers('MEDIA:/renders/demo.mp4')).toContain(
      '[Video: demo.mp4](#hermes-media:',
    )
  })

  test('does not leak host paths into copied or spoken response text', () => {
    const message =
      'Finished.\n\nMEDIA:C:\\Users\\person\\private\\final.png'

    expect(displayTextForMediaMarkers(message)).toBe(
      'Finished.\n\n[Image: final.png]',
    )
    expect(stripMediaMarkers(message)).toBe('Finished.')
  })
})
