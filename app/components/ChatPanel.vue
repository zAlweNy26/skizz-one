<script lang="ts" setup>
import type { ChatEntry } from '~/composables/useGameSocket'

const props = defineProps<{
  entries: ChatEntry[]
  isDrawer: boolean
  hasGuessed: boolean
  /** A turn is running. */
  drawing: boolean
  paused: boolean
}>()

const emit = defineEmits<{
  guess: [text: string]
}>()

/** Who reads what you type right now. */
const channel = computed(() => !props.drawing
  ? 'public'
  : props.isDrawer || props.hasGuessed ? 'private' : props.paused ? 'onHold' : 'guess')

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

/** Tailwind's `lg` breakpoint. */
const isDesktop = useMediaQuery('(min-width: 64rem)')

const shown = computed(() => {
  const list = props.entries.map((entry, index) => ({ entry, index }))
  return isDesktop.value ? list : list.reverse()
})

const log = useTemplateRef<HTMLElement>('log')
watch([() => props.entries.length, isDesktop], async () => {
  await nextTick()
  const el = log.value
  if (el) el.scrollTop = isDesktop.value ? el.scrollHeight : 0
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
    <UInput
      class="w-full lg:order-last" size="lg" :ui="{ base: ['min-h-11', channel === 'private' && 'ring-2'] }"
      autocomplete="off" enterkeyhint="send"
      :placeholder="$t(placeholder)"
      :color="channel === 'private' ? 'success' : 'primary'"
      :highlight="channel === 'private'"
      :icon="channelIcon"
      @keyup.enter="submit" />
    <div
      ref="log" class="overflow-y-auto overscroll-contain grow min-h-0 flex flex-col gap-0.5 text-sm pe-1"
      role="log">
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
