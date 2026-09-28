import { describe, expect, it } from 'vitest'
import { pickWord, pickWords, WORDS } from '../../realtime/src/words'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  dequantize,
  editDistance,
  isDrawingMessage,
  isFreehand,
  isLanguage,
  isOpaque,
  LANGUAGES,
  maskWord,
  normalizeGuess,
  POINT_STRIDE,
  quantize,
  votesNeeded,
  wordLengths,
} from '../../shared/utils/protocol'

describe('coordinate quantisation', () => {
  it('round-trips to a tenth of a unit', () => {
    for (const value of [0, 1, 123.4, 799.9, CANVAS_WIDTH, CANVAS_HEIGHT])
      expect(dequantize(quantize(value))).toBeCloseTo(value, 1)
  })

  it('keeps every wire value an integer', () => {
    for (const value of [0.04, 12.345, 1599.99])
      expect(Number.isInteger(quantize(value))).toBe(true)
  })

  it('stays within a tenth of a unit of the original', () => {
    const error = Math.abs(dequantize(quantize(1234.567)) - 1234.567)
    expect(error).toBeLessThanOrEqual(0.05)
  })
})

describe('stroke modes', () => {
  it('sends a timestamp with every point', () => {
    // x, y, and ms since the stroke began: watchers replay by the clock.
    expect(POINT_STRIDE).toBe(3)
  })

  it('classifies which modes can be previewed from points', () => {
    expect(isFreehand('draw')).toBe(true)
    expect(isFreehand('highlighter')).toBe(true)
    expect(isFreehand('rectangle')).toBe(false)
    // perfect-freehand has no incremental form; it previews as a shape.
    expect(isFreehand('stylus')).toBe(false)
  })

  it('treats erase and bucket as whole-canvas operations', () => {
    // These rewrite existing nodes and masks, so a point stream cannot
    // describe them and they resync the full canvas instead.
    expect(isOpaque('eraseLine')).toBe(true)
    expect(isOpaque('bucket')).toBe(true)
    expect(isOpaque('draw')).toBe(false)
  })
})

describe('drawer enforcement', () => {
  it('covers every message that mutates the canvas', () => {
    expect(isDrawingMessage({ t: 'strokeStart', id: 'a', brush: { mode: 'draw', color: '#000', size: 1 } })).toBe(true)
    expect(isDrawingMessage({ t: 'draw', id: 'a', pts: [] })).toBe(true)
    expect(isDrawingMessage({ t: 'preview', id: 'a', svg: '' })).toBe(true)
    expect(isDrawingMessage({ t: 'commit', id: 'a', svg: '' })).toBe(true)
    expect(isDrawingMessage({ t: 'canvas', svg: '' })).toBe(true)
  })

  it('leaves chat and guessing open to everyone', () => {
    expect(isDrawingMessage({ t: 'guess', text: 'cat' })).toBe(false)
    expect(isDrawingMessage({ t: 'chat', text: 'hi' })).toBe(false)
    expect(isDrawingMessage({ t: 'start' })).toBe(false)
  })
})

describe('word masking', () => {
  it('hides every letter', () => {
    expect(maskWord('octopus')).toBe('_______')
  })

  it('keeps spaces visible so the shape is readable', () => {
    expect(maskWord('ice cream')).toBe('___ _____')
  })

  it('never leaks a character of the word', () => {
    const word = 'lighthouse'
    const masked = maskWord(word)
    for (const char of new Set(word))
      expect(masked.includes(char)).toBe(false)
  })
})

describe('guess normalisation', () => {
  it('ignores case, padding and repeated spaces', () => {
    expect(normalizeGuess('  ICE   Cream ')).toBe('ice cream')
  })

  it('ignores accents', () => {
    expect(normalizeGuess('café')).toBe(normalizeGuess('cafe'))
  })
})

describe('near-miss detection', () => {
  it('scores an exact match as zero', () => {
    expect(editDistance('cat', 'cat')).toBe(0)
  })

  it('catches a typo and a plural', () => {
    expect(editDistance('rocket', 'rockets')).toBe(1)
    expect(editDistance('giraffe', 'girafe')).toBe(1)
  })

  it('bails out early on wildly different lengths', () => {
    expect(editDistance('a', 'watermelon')).toBeGreaterThan(3)
  })

  it('rejects an unrelated word of similar length', () => {
    expect(editDistance('panda', 'rocket')).toBeGreaterThan(3)
  })
})

describe('word selection', () => {
  it('never repeats a word still in the used list', () => {
    const used: string[] = []
    for (let i = 0; i < 40; i++) {
      const word = pickWord('en', used)
      expect(used).not.toContain(word)
      used.push(word)
    }
  })

  it('returns distinct words in one draw', () => {
    const words = pickWords('en', 3)
    expect(new Set(words).size).toBe(3)
  })

  it('still yields a word once the list is exhausted', () => {
    const everything = pickWords('en', 500)
    expect(pickWord('en', everything)).toBeTruthy()
  })
})

describe('word lists', () => {
  it('has a list for every language the client can pick', () => {
    expect(Object.keys(WORDS).sort()).toEqual(Object.keys(LANGUAGES).sort())
  })

  it.each(Object.entries(WORDS))('keeps %s guessable', (_, words) => {
    expect(words.length).toBeGreaterThan(50)
    expect(new Set(words).size).toBe(words.length)
    for (const word of words) {
      // The hint masks every non-space character, so a hyphen or apostrophe
      // would be invisible to guessers yet still required by the answer.
      expect(word).toMatch(/^\p{Ll}+(?: \p{Ll}+)*$/u)
    }
  })

  it('draws only from the requested language', () => {
    expect(WORDS.it).toContain(pickWord('it'))
  })
})

describe('isLanguage', () => {
  it('accepts known tags and rejects anything else', () => {
    expect(isLanguage('it')).toBe(true)
    expect(isLanguage('xx')).toBe(false)
    expect(isLanguage('toString')).toBe(false)
    expect(isLanguage(undefined)).toBe(false)
  })
})

describe('votesNeeded', () => {
  it('takes everyone to pause', () => {
    expect(votesNeeded(1, false)).toBe(1)
    expect(votesNeeded(4, false)).toBe(4)
  })

  it('takes a strict majority to resume', () => {
    expect(votesNeeded(2, true)).toBe(2)
    expect(votesNeeded(3, true)).toBe(2)
    expect(votesNeeded(4, true)).toBe(3)
    expect(votesNeeded(5, true)).toBe(3)
  })
})

describe('wordLengths', () => {
  it('counts the letters of each word', () => {
    expect(wordLengths('cat')).toEqual([3])
    expect(wordLengths('ice cream')).toEqual([3, 5])
  })

  it('gives guessers the same counts from the masked hint', () => {
    expect(wordLengths(maskWord('città di notte'))).toEqual(wordLengths('città di notte'))
  })

  it('is empty when there is no word', () => {
    expect(wordLengths('')).toEqual([])
  })
})
