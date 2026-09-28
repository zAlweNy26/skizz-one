import type { GamePlayer, GameState } from '../../shared/utils/protocol'
import { describe, expect, it } from 'vitest'
import { soundCues } from '../../app/utils/soundCues'

function player(id: string, extra: Partial<GamePlayer> = {}): GamePlayer {
  return { id, name: id, points: 0, connected: true, away: false, guessed: false, ...extra }
}

function game(extra: Partial<GameState> = {}): GameState {
  return {
    id: 'room',
    phase: 'drawing',
    round: 1,
    totalRounds: 3,
    language: 'en',
    drawTime: 80,
    hints: 2,
    customWordCount: 0,
    hostId: 'me',
    drawerId: 'ann',
    endsAt: null,
    hint: '____',
    players: [player('me'), player('ann'), player('bob')],
    paused: false,
    pauseVotes: [],
    remainingMs: null,
    ...extra,
  }
}

describe('sound cues', () => {
  it('stays silent when nothing changed', () => {
    expect(soundCues(game(), game(), 'me')).toEqual([])
  })

  it('tells you it is your turn when you start choosing', () => {
    const prev = game({ phase: 'intermission', drawerId: null })
    expect(soundCues(prev, game({ phase: 'choosing', drawerId: 'me' }), 'me')).toEqual(['your-turn'])
  })

  it('announces the turn to guessers but not to the drawer', () => {
    const prev = game({ phase: 'choosing' })
    expect(soundCues(prev, game(), 'me')).toEqual(['turn-start'])
    expect(soundCues(prev, game(), 'ann')).toEqual([])
  })

  it('tells your own guess apart from someone else\'s', () => {
    const mine = game({ players: [player('me', { guessed: true }), player('ann'), player('bob')] })
    const bobs = game({ players: [player('me'), player('ann'), player('bob', { guessed: true })] })
    expect(soundCues(game(), mine, 'me')).toEqual(['guessed-self'])
    expect(soundCues(game(), bobs, 'me')).toEqual(['guessed-other'])
  })

  it('plays the turn-end cue only when someone missed the word', () => {
    const allGuessed = [player('me', { guessed: true }), player('ann'), player('bob', { guessed: true })]
    const prev = game({ players: allGuessed })
    const end = { phase: 'intermission', drawerId: null } as const
    expect(soundCues(prev, game({ ...end, players: allGuessed }), 'me')).toEqual([])
    expect(soundCues(game(), game(end), 'me')).toEqual(['turn-end'])
  })

  it('celebrates the end of the game', () => {
    const prev = game({ phase: 'intermission', drawerId: null })
    expect(soundCues(prev, game({ phase: 'finished', drawerId: null }), 'me')).toEqual(['game-over'])
  })

  it('notices other players joining and leaving, but not you', () => {
    const joined = game({ players: [...game().players, player('cat')] })
    const left = game({ players: [player('me'), player('ann'), player('bob', { connected: false })] })
    const gone = game({ players: [player('me'), player('ann')] })
    expect(soundCues(game(), joined, 'me')).toEqual(['join'])
    expect(soundCues(game(), left, 'me')).toEqual(['leave'])
    expect(soundCues(left, game(), 'me')).toEqual(['join'])
    expect(soundCues(game(), gone, 'me')).toEqual(['leave'])
    expect(soundCues(game({ players: [player('ann')] }), game(), 'me')).toEqual(['join'])
  })
})
