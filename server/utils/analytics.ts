import type { StatsPeriod } from '#shared/utils/stats'
import { summarizeStats } from '#shared/utils/stats'

/** The stats page's numbers over the last `days`, or null when the app has no Analytics Engine credentials. */
export async function queryStats(days: StatsPeriod) {
  const { accountId, apiToken } = useRuntimeConfig().analytics
  if (!accountId || !apiToken) return null

  const since = `timestamp > NOW() - INTERVAL '${days}' DAY`

  async function rows(sql: string) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}` },
      body: sql,
    })
    if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Analytics Engine answered ${res.status}` })
    return (await res.json() as { data: Record<string, unknown>[] }).data
  }

  const [started, finished, turns, words] = await Promise.all([
    rows(`SELECT blob4 AS kind, SUM(_sample_interval) AS games, SUM(double1 * _sample_interval) AS players
      FROM skizz_games WHERE blob1 = 'game_started' AND ${since} GROUP BY kind`),
    rows(`SELECT blob3 AS outcome, SUM(_sample_interval) AS games, SUM(double3 * _sample_interval) AS ms
      FROM skizz_games WHERE blob1 = 'game_finished' AND ${since} GROUP BY outcome`),
    rows(`SELECT blob3 AS reason, SUM(_sample_interval) AS turns
      FROM skizz_games WHERE blob1 = 'turn_ended' AND ${since} GROUP BY reason`),
    rows(`SELECT blob2 AS language, blob4 AS word, SUM(_sample_interval) AS turns,
        SUM(double1 * _sample_interval) AS guessers, SUM(double2 * _sample_interval) AS correct
      FROM skizz_games WHERE blob1 = 'turn_ended' AND double1 > 0 AND ${since}
      GROUP BY language, word ORDER BY turns DESC LIMIT 500`),
  ])
  return summarizeStats({ started, finished, turns, words })
}
