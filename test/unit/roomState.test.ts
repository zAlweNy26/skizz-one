import type { RoomState, StoredPlayer } from '#realtime/room/state'
import { describe, expect, it } from 'vitest'
import { activeCount, awards, initialState, listing, pruneDeparted, publicState, seated } from '#realtime/room/state'

function player(id: string, extra: Partial<StoredPlayer> = {}): StoredPlayer {
  return { id, name: id.toUpperCase(), avatar: id, points: 0, guessed: false, connected: true, ...extra }
}

function room(players: StoredPlayer[], extra: Partial<RoomState> = {}): RoomState {
  return {
    ...initialState(),
    players: Object.fromEntries(players.map(p => [p.id, p])),
    order: players.map(p => p.id),
    hostId: players[0]?.id ?? null,
    ...extra,
  }
}

describe('publicState', () => {
  it('masks the word, keeping the letters hints revealed', () => {
    const s = room([player('a'), player('b')], { phase: 'drawing', word: 'ice cream', revealed: [0, 4] })
    const state = publicState(s, 'room1')
    expect(state.hint).toBe('i__ c____')
    expect(JSON.stringify(state)).not.toContain('cream')
  })

  it('ranks players by exact score, shows whole points and hides the banned', () => {
    const s = room([
      player('a', { points: 10.4 }),
      player('b', { points: 10.6 }),
      player('c', { awaySince: 1 }),
      player('d'),
    ], { banned: ['d'] })
    const players = publicState(s, 'room1').players
    expect(players.map(p => [p.id, p.points, p.rank, p.away])).toEqual([
      ['a', 10, 2, false],
      ['b', 11, 1, false],
      ['c', 0, 3, true],
    ])
  })

  it('counts only active voters, and drops targets nobody votes against', () => {
    const s = room([player('a'), player('b'), player('c', { awaySince: 1 }), player('d')], {
      kickVotes: { d: ['a', 'c', 'd'], b: ['c'] },
      pauseVotes: ['a', 'c'],
    })
    const state = publicState(s, 'room1')
    expect(state.kickVotes).toEqual({ d: ['a'] })
    expect(state.pauseVotes).toEqual(['a'])
  })

  it('shows awards only once the game is over', () => {
    const stats = { fastest: { playerId: 'a', ms: 900 }, closeGuesses: {}, mostLiked: null, guessedOn: {} }
    expect(publicState(room([player('a')], { stats }), 'r').awards).toEqual([])
    expect(publicState(room([player('a')], { stats, phase: 'finished' }), 'r').awards).toHaveLength(1)
  })
})

describe('awards', () => {
  it('names the fastest, the most liked, the nearest misser and the most guessed drawer', () => {
    const s = room([player('a'), player('b'), player('c')], {
      stats: {
        fastest: { playerId: 'b', ms: 1200 },
        mostLiked: { playerId: 'a', likes: 3 },
        closeGuesses: { b: 2, c: 2 },
        guessedOn: { a: 1, c: 4 },
      },
    })
    expect(awards(s)).toEqual([
      { key: 'fastest', playerId: 'b', value: 1200 },
      { key: 'mostLiked', playerId: 'a', value: 3 },
      { key: 'almostHadIt', playerId: 'b', value: 2 },
      { key: 'picasso', playerId: 'c', value: 4 },
    ])
  })

  it('leaves out players who were kicked or left', () => {
    const s = room([player('a')], {
      banned: ['b'],
      stats: { fastest: { playerId: 'b', ms: 10 }, mostLiked: { playerId: 'gone', likes: 1 }, closeGuesses: {}, guessedOn: {} },
    })
    expect(awards(s)).toEqual([])
  })
})

describe('listing', () => {
  it('lists a public room with its host and active players', () => {
    const s = room([player('a'), player('b', { awaySince: 1 })], { public: true, language: 'fr', round: 2 })
    expect(listing(s, 'room1')).toEqual({
      id: 'room1',
      hostName: 'A',
      players: 1,
      language: 'fr',
      phase: 'lobby',
      round: 2,
      totalRounds: 3,
    })
  })

  it('keeps private, empty and hostless rooms unlisted', () => {
    expect(listing(room([player('a')]), 'r')).toBeNull()
    expect(listing(room([player('a', { awaySince: 1 })], { public: true }), 'r')).toBeNull()
    expect(listing(room([player('a')], { public: true, hostId: null }), 'r')).toBeNull()
  })
})

describe('seats', () => {
  it('counts away players as seated but not active', () => {
    const s = room([player('a'), player('b', { awaySince: 1 }), player('c', { connected: false })])
    expect(seated(s)).toEqual(['a', 'b'])
    expect(activeCount(s)).toBe(1)
  })

  it('forgets players whose seat was freed', () => {
    const s = room([player('a'), player('b', { connected: false })])
    pruneDeparted(s)
    expect(s.order).toEqual(['a'])
    expect(Object.keys(s.players)).toEqual(['a'])
  })
})
