<script lang="ts" setup>
import type { ChatEntry } from '~/composables/useGameSocket'

const props = defineProps<{
  entries: ChatEntry[]
  isDrawer: boolean
  /** Got the word this turn, so anything typed is private chat. */
  hasGuessed: boolean
  /** A turn is running: the chat splits into guessers and everyone else. */
  drawing: boolean
  paused: boolean
}>()

const emit = defineEmits<{
  guess: [text: string]
}>()

/**
 * Who reads what you type right now.
 *
 * The room enforces all of this; the panel only says it out loud so nobody
 * is surprised by who can (or can't) see their message.
 */
const channel = computed(() => {
  if (!props.drawing) return 'public'
  if (props.isDrawer || props.hasGuessed) return 'private'
  return props.paused ? 'onHold' : 'guess'
})

const channelIcon = computed(() => ({
  public: 'i-lucide-message-circle',
  private: 'i-lucide-lock',
  onHold: 'i-lucide-pause',
  guess: 'i-lucide-lightbulb',
})[channel.value])

const placeholder = computed(() => ({
  public: 'chat.publicPlaceholder',
  private: 'chat.privatePlaceholder',
  onHold: 'chat.pausedPlaceholder',
  guess: 'chat.guessPlaceholder',
})[channel.value])

/**
 * On a phone the input sits above the log, right under the canvas, so the
 * newest message goes first, next to where you type. Desktop keeps the usual
 * chat order with the input at the bottom. Same breakpoint as Tailwind's `lg`.
 */
const isDesktop = useMediaQuery('(min-width: 64rem)')

/** Each entry keeps its arrival index as its key, so reversing re-renders nothing. */
const shown = computed(() => {
  const list = props.entries.map((entry, index) => ({ entry, index }))
  return isDesktop.value ? list : list.reverse()
})

/**
 * Follow new messages, but only when already at the newest end (the bottom on
 * desktop, the top on a phone): someone scrolling back through the chat
 * shouldn't be yanked away by every guess. The watcher runs before the DOM
 * update, so it measures the old scroll position.
 */
const log = useTemplateRef<HTMLElement>('log')
watch(() => props.entries.length, async () => {
  const el = log.value
  if (!el) return
  const atNewest = isDesktop.value
    ? el.scrollHeight - el.scrollTop - el.clientHeight < 48
    : el.scrollTop < 48
  await nextTick()
  if (atNewest) el.scrollTop = isDesktop.value ? el.scrollHeight : 0
})

/**
 * iPhone Safari lays the keyboard over the page instead of resizing it, and
 * focusing an input shifts the whole visual viewport up to reveal it. A page
 * that doesn't overflow can't be scrolled back (`scrollTo` is a no-op there),
 * so the canvas slides off the top. Following React Aria's `usePreventScroll`:
 *
 * 1. Stop the shift: the first tap focuses the input with `preventScroll`, so
 *    Safari opens the keyboard without moving the page.
 * 2. Lock the page while the keyboard is up: only the chat log may scroll, or
 *    the covered page would.
 * 3. Float just the input bar above the keyboard, by the height it covers.
 *
 * iOS only: Android and desktop resize the layout with the keyboard, which
 * already puts it right under the input. Once Safari ships
 * `interactive-widget=resizes-content` (nuxt.config.ts), the covered height
 * drops to zero there too and none of this kicks in.
 */
const isIOS = /iP(?:hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** First tap only: once focused, taps must reach the input to move the caret. */
function focusWithoutShift(event: TouchEvent) {
  const input = event.target
  if (!isIOS || !(input instanceof HTMLInputElement) || input.disabled || input === document.activeElement) return
  event.preventDefault()
  input.focus({ preventScroll: true })
}

const focused = ref(false)
const keyboardInset = ref(0)

function measureKeyboard() {
  const view = window.visualViewport
  keyboardInset.value = isIOS && focused.value && view
    ? Math.max(0, Math.round(window.innerHeight - view.height - view.offsetTop))
    : 0
}

// `resize` only: tracking `scroll` too reflows on every frame of the keyboard animation.
useEventListener(() => window.visualViewport, 'resize', measureKeyboard)
watch(focused, (now) => {
  nextTick(measureKeyboard)
  // iOS 26 sometimes reports a stale viewport right after the keyboard closes.
  if (!now) setTimeout(measureKeyboard, 350)
})

/** A real on-screen keyboard is far taller than a rounding error or a toolbar. */
const floating = computed(() => keyboardInset.value > 80)

watch(floating, (on) => {
  document.documentElement.style.overflow = on ? 'hidden' : ''
})
useEventListener(document, 'touchmove', (event: TouchEvent) => {
  // Pinch-zoom stays allowed; so does scrolling a chat log that has something to scroll.
  if (!floating.value || event.touches.length > 1) return
  const el = log.value
  const inLog = el && event.target instanceof Node && el.contains(event.target) && el.scrollHeight > el.clientHeight
  if (!inLog) event.preventDefault()
}, { passive: false, capture: true })

function submit(event: KeyboardEvent) {
  const input = event.target as HTMLInputElement
  const text = input.value.trim()
  if (!text) return
  emit('guess', text)
  input.value = ''
}
</script>

<template>
  <SketchFrame
    as="aside" :strokeWidth="2.5" :radius="18" class="flex flex-col gap-3 p-3"
    :aria-label="$t('chat.title')">
    <!--
      First on a phone, right under the canvas; last on desktop. The outer box
      keeps the input's slot while the inner bar floats above an iPhone's
      keyboard, so nothing else in the room moves.
    -->
    <div class="w-full min-h-11 lg:order-last" @touchend="focusWithoutShift">
      <div
        :class="floating
          ? `fixed inset-x-0 bottom-0 z-40 px-safe py-2 bg-(--stage) translate-y-(--keyboard-lift)
            motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out-quart`
          : ''"
        :style="floating ? { '--keyboard-lift': `-${keyboardInset}px` } : undefined">
        <UInput
          class="w-full" size="lg" :ui="{ base: 'min-h-11' }"
          autocomplete="off" enterkeyhint="send"
          :placeholder="$t(placeholder)"
          :color="channel === 'private' ? 'success' : 'primary'"
          :highlight="channel === 'private'"
          :icon="channelIcon"
          @keyup.enter="submit" @focus="focused = true" @blur="focused = false" />
      </div>
    </div>
    <div
      ref="log" class="overflow-y-auto overscroll-contain grow min-h-0 flex flex-col gap-0.5 text-sm pe-1"
      role="log">
      <!-- Striped by arrival index, not position, so rows keep their shade as new messages push in. -->
      <div
        v-for="{ entry, index } in shown" :key="index" class="flex items-start gap-2 px-2 py-1 rounded-sketch"
        :class="!entry.system && entry.private ? 'bg-success/12' : index % 2 ? 'bg-elevated' : ''">
        <p
          v-if="entry.system" class="font-display font-semibold"
          :class="{
            'text-success': entry.level === 'success',
            'text-warning': entry.level === 'warning',
            'text-error': entry.level === 'error',
            'text-muted': entry.level === 'info',
          }">
          {{ $t(`log.${entry.key}`, entry.params ?? {}) }}
        </p>
        <p v-else class="min-w-0 break-words">
          <UIcon
            v-if="entry.private" name="i-lucide-lock" class="size-3.5 me-1 align-middle text-success"
            :aria-label="$t('chat.private')" />
          <span class="font-bold" :class="entry.private ? 'text-success' : 'text-primary'">{{ entry.sender }}</span>
          <span class="text-muted">: </span>
          <span>{{ entry.text }}</span>
        </p>
      </div>
    </div>
  </SketchFrame>
</template>
