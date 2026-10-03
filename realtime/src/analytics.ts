import type { Language } from '#shared/utils/protocol'
import type { TurnEnd } from '#shared/utils/stats'

/**
 * Game events written to Workers Analytics Engine (dataset `skizz_games`), indexed by room code. Nothing that
 * identifies a player is written. Columns, by position:
 *
 * - `game_started`:  blob2 language, blob3 `public`/`private`, blob4 `first`/`rematch`;
 *                    double1 players, double2 rounds, double3 draw time (s)
 * - `game_finished`: blob2 language, blob3 `completed`/`abandoned`; double1 players, double2 rounds played,
 *                    double3 length (ms)
 * - `turn_ended`:    blob2 language, blob3 how it ended, blob4 word; double1 guessers, double2 correct guesses,
 *                    double3 time drawn (ms)
 */
export type GameEvent
  = | {
    event: 'game_started'
    language: Language
    public: boolean
    rematch: boolean
    players: number
    rounds: number
    drawTime: number
  }
  | { event: 'game_finished', language: Language, completed: boolean, players: number, rounds: number, ms: number }
  | {
    event: 'turn_ended'
    language: Language
    reason: TurnEnd
    word: string
    guessers: number
    correct: number
    ms: number
  }

export function dataPoint(room: string, e: GameEvent): AnalyticsEngineDataPoint {
  switch (e.event) {
    case 'game_started':
      return {
        indexes: [room],
        blobs: [e.event, e.language, e.public ? 'public' : 'private', e.rematch ? 'rematch' : 'first'],
        doubles: [e.players, e.rounds, e.drawTime],
      }
    case 'game_finished':
      return {
        indexes: [room],
        blobs: [e.event, e.language, e.completed ? 'completed' : 'abandoned'],
        doubles: [e.players, e.rounds, e.ms],
      }
    case 'turn_ended':
      return {
        indexes: [room],
        blobs: [e.event, e.language, e.reason, e.word],
        doubles: [e.guessers, e.correct, e.ms],
      }
  }
}
