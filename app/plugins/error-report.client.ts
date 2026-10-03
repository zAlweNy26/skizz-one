import { useEventListener } from '@vueuse/core'
import { reportPath } from '#shared/utils/reports'

/** Distinct errors one page load reports before it goes quiet. */
const MAX_REPORTS = 10

export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.dev) return

  const version = useRuntimeConfig().public.version as string
  const seen = new Set<string>()

  function report(source: string, error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error))
    const key = `${err.name}: ${err.message}`
    if (seen.has(key) || seen.size >= MAX_REPORTS) return
    seen.add(key)
    navigator.sendBeacon('/api/errors', JSON.stringify({
      source,
      name: err.name,
      message: err.message.slice(0, 500),
      stack: err.stack?.slice(0, 2_000),
      path: reportPath(location.pathname),
      version,
    }))
  }

  nuxtApp.hook('vue:error', error => report('vue', error))
  nuxtApp.hook('app:error', error => report('app', error))
  useEventListener(window, 'error', event => report('window', event.error ?? event.message))
  useEventListener(window, 'unhandledrejection', event => report('promise', event.reason))
})
