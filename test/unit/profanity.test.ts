import { describe, expect, it } from 'vitest'
import { isProfane, maskProfanity } from '#shared/utils/profanity'

describe('profanity', () => {
  it('masks blocked words to their first letter', () => {
    expect(maskProfanity('Shit Lord')).toBe('S*** Lord')
    expect(maskProfanity('il cazzo')).toBe('il c****')
  })

  it('sees through case, accents, stretching and look-alike characters', () => {
    for (const text of ['SHIT', 'shiiiit', 'sh1t', '$hit', 'stronzò', 'a$$hole', 'cazzzzo', 'b00bs'])
      expect(isProfane(text), text).toBe(true)
  })

  it('matches stems and inflections the list allows', () => {
    expect(maskProfanity('fucking motherfuckers')).toBe('f****** m************')
  })

  it('catches a blocked phrase across two words', () => {
    expect(maskProfanity('porco dio!')).toBe('p**** d**!')
    expect(maskProfanity('un porco e un dio')).toBe('un porco e un dio')
  })

  it('leaves names and words that contain or resemble a blocked one alone', () => {
    for (const text of ['Scunthorpe', 'Dick Smith', 'Regina', 'Cassandra', 'Glasshopper', 'class', 'as', 'assassin',
      'cocktail', 'cazzuola', 'shitake', 'culinary', 'figaro', 'cumulative', 'therapist', 'analisi', 'pesce', 'shhh'])
      expect(isProfane(text), text).toBe(false)
  })

  it('keeps the rest of the text as written', () => {
    expect(maskProfanity('🎨 merda!')).toBe('🎨 m****!')
    expect(maskProfanity('')).toBe('')
  })
})
