import type { Language } from '../../../shared/utils/protocol'
import en from './en'
import it from './it'

/** Word lists for rounds, one per language. */
export const WORDS: Record<Language, readonly string[]> = { en, it }

/** How much likelier a custom word is to come up than a built-in one. */
export const CUSTOM_WORD_WEIGHT = 2

/** Pick `count` distinct words, avoiding any already used this game unless the pool is exhausted. */
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
