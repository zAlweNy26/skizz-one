const numberFormats = {
  percent: { style: 'percent', maximumFractionDigits: 0 },
  decimal: { maximumFractionDigits: 1 },
} as const

const datetimeFormats = {
  long: { dateStyle: 'long' },
} as const

export default defineI18nConfig(() => ({
  numberFormats: {
    en: numberFormats,
    it: numberFormats,
  },
  datetimeFormats: {
    en: datetimeFormats,
    it: datetimeFormats,
  },
}))
