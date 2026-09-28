import type { MaybeElementRef } from '@vueuse/core'
import type { CSSProperties } from 'vue'

const isIOS = /iP(?:hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** On iOS, pins `target` to the visible area above the keyboard while an input in it is focused. */
export function useKeyboardFit(target: MaybeElementRef) {
  const { focused } = useFocusWithin(target)
  const visible = shallowRef<{ top: number, height: number } | null>(null)

  function measure() {
    const view = window.visualViewport
    visible.value = isIOS && focused.value && view && window.innerHeight - view.height > 80
      ? { top: view.offsetTop, height: view.height }
      : null
  }

  useEventListener(() => window.visualViewport, ['resize', 'scroll'], measure, { passive: true })
  watch(focused, (now) => {
    measure()
    if (!now) setTimeout(measure, 350)
  })

  return computed<CSSProperties | undefined>(() => {
    if (!visible.value) return undefined
    return {
      position: 'fixed',
      insetInline: 0,
      top: `${visible.value.top}px`,
      height: `${visible.value.height}px`,
      paddingBottom: '0.5rem',
    }
  })
}
