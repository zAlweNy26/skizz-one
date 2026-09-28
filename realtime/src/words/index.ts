import type { Language } from '../../../shared/utils/protocol'
import en from './en'
import it from './it'

/**
 * Word lists for rounds, one per language.
 *
 * Bundled as plain arrays on purpose: picking a word sits on the round-start
 * path, and the word must never leave the Durable Object. No I/O, no binding.
 *
 * To add a language, add its name to `LANGUAGES` in the protocol and a file
 * here. Keep words concrete and drawable, lowercase, and free of apostrophes
 * and hyphens: guessers can't see them in the masked hint.
 */
export const WORDS: Record<Language, readonly string[]> = { en, it }

/**
 * How much likelier a custom word is to come up than a built-in one.
 *
 * Per word, so a handful of custom words among a few hundred still turn up
 * only now and then: the host asked for "a bit more often", not "mostly".
 */
export const CUSTOM_WORD_WEIGHT = 2

/**
 * Pick `count` distinct words, avoiding any already used this game.
 *
 * `custom` words join the language's list at `CUSTOM_WORD_WEIGHT`. Falls
 * back to the full pool once a long game has exhausted it, so a room can
 * never stall for want of an unused word.
 */
export function pickWords(
  language: Language,
  count: number,
  used: readonly string[] = [],
  custom: readonly string[] = [],
): string[] {
  const weights = new Map<string, number>(WORDS[language].map(w => [w, 1]))
  for (const w of custom) weights.set(w, CUSTOM_WORD_WEIGHT)

  const usedSet = new Set(used)
  let pool = [...weights].filter(([w]) => !usedSet.has(w))
  if (pool.length < count) pool = [...weights]

  const picked: string[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    let roll = Math.random() * pool.reduce((sum, [, weight]) => sum + weight, 0)
    let index = pool.findIndex(([, weight]) => (roll -= weight) < 0)
    if (index === -1) index = pool.length - 1
    picked.push(pool.splice(index, 1)[0]![0])
  }
  return picked
}

export function pickWord(language: Language, used: readonly string[] = [], custom: readonly string[] = []): string {
  return pickWords(language, 1, used, custom)[0]!
}
