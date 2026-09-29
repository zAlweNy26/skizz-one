import { useMediaQuery } from '@vueuse/core'

/** Tailwind's `lg` breakpoint. */
export function useIsDesktop() {
  return useMediaQuery('(min-width: 64rem)')
}
