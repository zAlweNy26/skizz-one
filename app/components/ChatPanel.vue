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
    <!-- First on a phone, right under the canvas; last on desktop. -->
    <!-- Autocorrect off: a phone "fixing" moose into mouse would cost the guess. -->
    <UInput
      class="w-full lg:order-last" size="lg" :ui="{ base: 'min-h-11' }"
      autocomplete="off" autocorrect="off" autocapitalize="off" :spellcheck="false" enterkeyhint="send"
      :placeholder="$t(placeholder)"
      :disabled="channel === 'onHold'"
      :color="channel === 'private' ? 'success' : 'primary'"
      :highlight="channel === 'private'"
      :icon="channelIcon"
      @keyup.enter="submit" />
    <div ref="log" class="overflow-y-auto grow min-h-0 flex flex-col gap-1.5 text-sm pe-1" role="log">
      <div
        v-for="{ entry, index } in shown" :key="index" class="flex items-start gap-2 px-2 py-1 rounded-sketch"
        :class="!entry.system && entry.private ? 'bg-success/12' : ''">
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
