<script lang="ts" setup>
import type { ChatEntry } from '~/composables/useGameSocket'

defineProps<{
  entries: ChatEntry[]
  isDrawer: boolean
}>()

const emit = defineEmits<{
  guess: [text: string]
}>()

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
      <div v-for="(entry, index) in entries" :key="index" class="flex items-center gap-2 p-1 odd:bg-accented">
        <UBadge
          v-if="!entry.system"
          :color="entry.private ? 'success' : 'neutral'" class="font-semibold"
          :label="entry.sender" size="sm" />
        <span :class="{ 'font-semibold': entry.system, 'text-success': entry.level === 'success', 'text-warning': entry.level === 'warning' }">
          {{ entry.text }}
        </span>
      </div>
    </div>
    <UInput
      class="w-full mt-auto sticky bottom-0"
      :placeholder="isDrawer ? 'You are drawing — no guessing!' : 'Type your guess here...'"
      :disabled="isDrawer"
      @keyup.enter="submit" />
  </aside>
</template>
