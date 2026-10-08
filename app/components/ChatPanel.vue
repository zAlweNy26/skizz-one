<script lang="ts" setup>
import type { LogLevel } from '#shared/utils/protocol'
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

const isDesktop = useIsDesktop()

const LEVEL_CLASS: Record<LogLevel, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-muted',
}

function rowClass(entry: ChatEntry, index: number) {
  if (!entry.system && entry.private) return 'bg-success/12'
  return index % 2 ? 'bg-elevated' : ''
}

const shown = computed(() => {
  const list = props.entries.map((entry, index) => ({ entry, index, class: rowClass(entry, index) }))
  return isDesktop.value ? list : list.reverse()
})

const log = useTemplateRef<HTMLElement>('log')
watch([() => props.entries.length, isDesktop], async () => {
  await nextTick()
  const el = log.value
  if (el) el.scrollTop = isDesktop.value ? el.scrollHeight : 0
})

const draft = ref('')

function submit() {
  const text = draft.value.trim()
  if (!text) return
  emit('guess', text)
  draft.value = ''
}
</script>

<template>
  <SketchFrame
    as="aside" :strokeWidth="2.5" :radius="18" class="flex flex-col gap-3 p-3"
    :aria-label="$t('chat.title')">
    <UInput
      v-model="draft" class="w-full lg:order-last" size="lg"
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
        v-for="row in shown" :key="row.index" class="flex items-start gap-2 px-2 py-1 rounded-sketch"
        :class="row.class">
        <p v-if="row.entry.system" class="font-display font-semibold" :class="LEVEL_CLASS[row.entry.level]">
          {{ $t(`log.${row.entry.key}`, row.entry.params ?? {}) }}
        </p>
        <p v-else class="min-w-0 break-words">
          <UIcon
            v-if="row.entry.private" name="i-lucide-lock" class="size-3.5 me-1 align-middle text-success"
            :aria-label="$t('chat.private')" />
          <span class="font-bold" :class="row.entry.private ? 'text-success' : 'text-primary'">
            {{ row.entry.sender }}
          </span>
          <span class="text-muted">: </span>
          <span>{{ row.entry.text }}</span>
        </p>
      </div>
    </div>
  </SketchFrame>
</template>
