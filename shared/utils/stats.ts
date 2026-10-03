/** Days the public stats page can look back over. */
export const STATS_PERIODS = [7, 30] as const

export type StatsPeriod = typeof STATS_PERIODS[number]

export const TURN_ENDS = ['guessed', 'timeUp', 'drawerGone', 'drawerKicked'] as const

export type TurnEnd = typeof TURN_ENDS[number]

/** Turns a word needs before it can rank as hardest or easiest. */
const MIN_WORD_TURNS = 3

const WORDS_SHOWN = 5

type Row = Record<string, unknown>

/** What the Analytics Engine queries in `server/utils/analytics.ts` return, one list per query. */
export interface StatsRows {
  started: Row[]
  finished: Row[]
  turns: Row[]
  words: Row[]
}

/** Analytics Engine sends some sums as strings. */
function num(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function total(rows: Row[], column: string, where?: (row: Row) => boolean) {
  return rows.filter(row => !where || where(row)).reduce((sum, row) => sum + num(row[column]), 0)
}

function ratio(part: number, whole: number) {
  return whole > 0 ? part / whole : null
}

/** The numbers the stats page shows; shares are 0–1, null when there is nothing to divide by. */
export function summarizeStats(rows: StatsRows) {
  const games = total(rows.started, 'games')
  const rematches = total(rows.started, 'games', row => row.kind === 'rematch')
  const completed = total(rows.finished, 'games', row => row.outcome === 'completed')
  const finished = total(rows.finished, 'games')

  const turns = Object.fromEntries(TURN_ENDS.map(reason =>
    [reason, total(rows.turns, 'turns', row => row.reason === reason)])) as Record<TurnEnd, number>

  const words = rows.words
    .map(row => ({
      language: String(row.language),
      word: String(row.word),
      turns: num(row.turns),
      guessedShare: ratio(num(row.correct), num(row.guessers)) ?? 0,
    }))
    .filter(w => w.turns >= MIN_WORD_TURNS)

  return {
    games,
    rematchRate: ratio(rematches, completed),
    completedShare: ratio(completed, finished),
    avgPlayers: ratio(total(rows.started, 'players'), games),
    avgMinutes: ratio(total(rows.finished, 'ms', row => row.outcome === 'completed') / 60_000, completed),
    turns,
    totalTurns: Object.values(turns).reduce((a, b) => a + b, 0),
    hardest: [...words].sort((a, b) => a.guessedShare - b.guessedShare || b.turns - a.turns).slice(0, WORDS_SHOWN),
    easiest: [...words].sort((a, b) => b.guessedShare - a.guessedShare || b.turns - a.turns).slice(0, WORDS_SHOWN),
  }
}
