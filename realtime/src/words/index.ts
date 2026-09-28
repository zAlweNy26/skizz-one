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
 * Pick `count` distinct words, avoiding any already used this game.
 *
 * Falls back to the full list once a long game has exhausted it, so a room
 * can never stall for want of an unused word.
 */
export function pickWords(language: Language, count: number, used: readonly string[] = []): string[] {
  const words = WORDS[language]
  const usedSet = new Set(used)
  let pool = words.filter(w => !usedSet.has(w))
  if (pool.length < count) pool = [...words]

  const picked: string[] = []
  const available = [...pool]
  for (let i = 0; i < count && available.length > 0; i++) {
    const index = Math.floor(Math.random() * available.length)
    picked.push(available.splice(index, 1)[0]!)
  }
  return picked
}

export function pickWord(language: Language, used: readonly string[] = []): string {
  return pickWords(language, 1, used)[0]!
}
