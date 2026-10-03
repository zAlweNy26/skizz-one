/**
 * Words kept out of player names, in English and Italian. An entry matches whole words; a trailing `*` also
 * matches anything after it, and a space spans two words.
 */
const BLOCKLIST = [
  // English
  'fuck*', 'motherfuck*', 'shit', 'shits', 'shitty', 'shithead*', 'bullshit', 'bitch', 'bitches', 'cunt*',
  'dickhead*', 'cock', 'cocks', 'cocksucker*', 'pussy', 'ass', 'asshole*', 'arse', 'arsehole*', 'bastard',
  'bastards', 'wank*', 'twat*', 'slut*', 'whore*', 'dildo*', 'porn*', 'jizz', 'cum', 'blowjob*', 'boobs', 'tits',
  'nigger*', 'nigga*', 'faggot*', 'fag', 'fags', 'retard', 'retards', 'retarded', 'tranny', 'kike', 'spic',
  'rapist*', 'nazi', 'hitler',
  // Italian
  'cazzo', 'cazzi', 'cazzone', 'stronzo', 'stronza', 'stronzi', 'merda', 'merdoso', 'vaffanculo', 'fanculo',
  'culo', 'puttana', 'puttane', 'troia', 'zoccola', 'mignotta', 'coglione', 'coglioni', 'minchia', 'figa', 'fica',
  'frocio', 'froci', 'ricchione', 'negro', 'negri', 'mongoloide', 'bastardo', 'bastarda', 'pompino', 'sborra',
  'segaiolo', 'porcodio', 'porco dio', 'diocane', 'dio cane', 'dioporco', 'dio porco', 'porcamadonna',
  'porca madonna',
] as const

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's' }

const WORD = /[\p{L}\p{M}\p{N}@$]+/gu

/** Lowercase, without accents, with look-alike digits and symbols read as letters. */
function normalize(word: string) {
  return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[0-9@$]/g, c => LEET[c] ?? c)
}

/** Matches stretched letters too, e.g. `fuuuck`, but needs a double letter where the word has one. */
function pattern(word: string) {
  const prefix = word.endsWith('*')
  const runs = (prefix ? word.slice(0, -1) : word).match(/(.)\1*/g) ?? []
  const body = runs.map(run => (run.length === 1 ? `${run}+` : `${run[0]}{${run.length},}`)).join('')
  return new RegExp(`^${body}${prefix ? '\\p{L}*' : ''}$`, 'u')
}

const ENTRIES = BLOCKLIST.map(entry => entry.split(' ').map(pattern))

/** Where each blocked word sits in `text`, as `[start, end)` offsets. */
function findBlocked(text: string) {
  const words = [...text.matchAll(WORD)]
    .map(m => ({ start: m.index, end: m.index + m[0].length, norm: normalize(m[0]) }))
  const spans: [number, number][] = []
  for (let i = 0; i < words.length; i++) {
    const entry = ENTRIES.find(parts => parts.every((part, k) => part.test(words[i + k]?.norm ?? '')))
    if (!entry) continue
    for (const word of words.slice(i, i + entry.length)) spans.push([word.start, word.end])
    i += entry.length - 1
  }
  return spans
}

export function isProfane(text: string) {
  return findBlocked(text).length > 0
}

/** `text` with every blocked word cut to its first letter, e.g. `s***`. */
export function maskProfanity(text: string) {
  let masked = text
  for (const [start, end] of findBlocked(text).reverse()) {
    const [first = '', ...rest] = text.slice(start, end)
    masked = masked.slice(0, start) + first + '*'.repeat(rest.length) + masked.slice(end)
  }
  return masked
}
