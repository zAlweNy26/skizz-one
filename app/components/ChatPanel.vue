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

const placeholder = computed(() => ({
  public: 'chat.publicPlaceholder',
  private: 'chat.privatePlaceholder',
  onHold: 'chat.pausedPlaceholder',
  guess: 'chat.guessPlaceholder',
})[channel.value])

function submit(event: KeyboardEvent) {
  const input = event.target as HTMLInputElement
  const text = input.value.trim()
  if (!text) return
  emit('guess', text)
  input.value = ''
}
</script>

<template>
  <aside class="overflow-hidden flex flex-col gap-2">
    <div class="overflow-y-auto rounded-md grow bg-elevated h-112 flex flex-col gap-1 text-sm shadow-lg">
      <div
        v-for="(entry, index) in entries" :key="index" class="flex items-center gap-2 p-1"
        :class="!entry.system && entry.private ? 'bg-success/10' : 'odd:bg-accented'">
        <span v-if="entry.system" class="font-semibold" :class="{ 'text-success': entry.level === 'success', 'text-warning': entry.level === 'warning' }">
          {{ $t(`log.${entry.key}`, entry.params ?? {}) }}
        </span>
        <template v-else>
          <UIcon v-if="entry.private" name="i-lucide-lock" class="size-3 shrink-0 text-success" :aria-label="$t('chat.private')" />
          <UBadge :color="entry.private ? 'success' : 'neutral'" class="font-semibold" :label="entry.sender" size="sm" />
          <span>{{ entry.text }}</span>
        </template>
      </div>
    </div>
    <UInput
      class="w-full mt-auto sticky bottom-0"
      :placeholder="$t(placeholder)"
      :disabled="channel === 'onHold'"
      :color="channel === 'private' ? 'success' : 'primary'"
      :highlight="channel === 'private'"
      :icon="channel === 'private' ? 'i-lucide-lock' : undefined"
      @keyup.enter="submit" />
  </aside>
</template>
