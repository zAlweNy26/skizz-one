export function useStatsFormat() {
  const { n } = useI18n()

  function share(value: number | null) {
    return value === null ? '–' : n(value, 'percent')
  }

  function amount(value: number | null) {
    return value === null ? '–' : n(value, 'decimal')
  }

  return { share, amount }
}
