import { describe, expect, it } from 'vitest'
import { WORDS } from '#realtime/words'
import { isProfane } from '#shared/utils/profanity'
import { LANGUAGES, normalizeGuess } from '#shared/utils/protocol'

describe.each(Object.keys(LANGUAGES) as (keyof typeof LANGUAGES)[])('the %s word list', (language) => {
  const words = WORDS[language]

  it('has plenty of words', () => {
    expect(words.length).toBeGreaterThanOrEqual(250)
  })

  it('is lowercase letters and single spaces only', () => {
    expect(words.filter(w => !/^\p{Ll}+(?: \p{Ll}+)*$/u.test(w))).toEqual([])
  })

  it('has no word twice, even once accents are dropped', () => {
    const seen = words.map(normalizeGuess)
    expect(seen.filter((w, i) => seen.indexOf(w) !== i)).toEqual([])
  })

  it('has nothing the name filter blocks', () => {
    expect(words.filter(isProfane)).toEqual([])
  })
})
