import type { StatsPeriod } from '#shared/utils/stats'
import { STATS_PERIODS } from '#shared/utils/stats'

function period(days: unknown): StatsPeriod {
  return STATS_PERIODS.find(p => String(p) === days) ?? 30
}

export default defineCachedEventHandler(async (event) => {
  const days = period(getQuery(event).days)
  return { days, stats: await queryStats(days) }
}, {
  maxAge: 600,
  swr: true,
  getKey: event => `stats-${period(getQuery(event).days)}`,
})
