import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { petHatchCancelToken, PetDexPanel, rankPetDexPets } from './PetDexPanel'

describe('PetDexPanel', () => {
  it('keeps a disconnected host honest', () => {
    const html = renderToStaticMarkup(
      <PetDexPanel gateway={null} onChanged={vi.fn()} profile="default" />,
    )

    expect(html).toContain('Connect to a pet-capable Hermes host')
  })

  it('prioritizes hatched and installed pets while retaining search', () => {
    const pets = rankPetDexPets(
      [
        {
          slug: 'curated',
          displayName: 'Curated',
          installed: false,
          curated: true,
        },
        { slug: 'installed', displayName: 'Installed', installed: true },
        {
          slug: 'hatched',
          displayName: 'Moon Moth',
          installed: true,
          generated: true,
        },
      ],
      '',
    )

    expect(pets.map((pet) => pet.slug)).toEqual([
      'hatched',
      'installed',
      'curated',
    ])
    expect(rankPetDexPets(pets, 'moon').map((pet) => pet.slug)).toEqual([
      'hatched',
    ])
  })

  it('uses a separate cancellation lane for hatching', () => {
    expect(petHatchCancelToken('draft-run')).toBe('draft-run-mobile-hatch')
  })
})
