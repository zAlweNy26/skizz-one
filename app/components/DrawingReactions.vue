<script lang="ts" setup>
import type { Reaction } from '#shared/utils/protocol'

const props = defineProps<{
  reactions: Record<string, Reaction>
  isDrawer: boolean
  you: string
}>()

defineEmits<{
  react: [reaction: Reaction | null]
}>()

const mine = computed(() => props.reactions[props.you] ?? null)

const options = computed(() => {
  const all = Object.values(props.reactions)
  return ([
    { reaction: 'like', icon: 'i-lucide-thumbs-up', color: 'success', text: 'text-success' },
    { reaction: 'dislike', icon: 'i-lucide-thumbs-down', color: 'error', text: 'text-error' },
  ] as const).map(option => ({ ...option, count: all.filter(r => r === option.reaction).length }))
})
</script>

<template>
  <div class="absolute bottom-1 end-1 z-5 lg:bottom-2 lg:end-2" :class="{ 'pointer-events-none': isDrawer }">
    <SketchFrame
      :radius="10" :strokeWidth="1.8" :roughness="1" class="flex items-center gap-0.5 p-0.5 lg:gap-1 lg:p-1"
      role="group" :aria-label="$t('reactions.label')">
      <template v-for="option in options" :key="option.reaction">
        <p
          v-if="isDrawer" class="flex items-center gap-1 px-1.5 min-h-7 font-display font-bold text-sm tabular-nums
            lg:px-2 lg:min-h-8 lg:text-base"
          :class="option.count ? option.text : 'text-muted'"
          :aria-label="$t(`reactions.${option.reaction}Count`, option.count)">
          <UIcon :name="option.icon" class="size-4 lg:size-5" />
          <span :key="option.count" class="pop-in">{{ option.count }}</span>
        </p>
        <UButton
          v-else
          size="sm" :color="mine === option.reaction ? option.color : 'neutral'"
          :variant="mine === option.reaction ? 'solid' : 'ghost'"
          class="justify-center font-display font-bold tabular-nums lg:min-h-11 lg:min-w-11 lg:text-base"
          :ui="{ leadingIcon: 'size-4 lg:size-5' }"
          :icon="option.icon" :label="String(option.count)"
          :aria-label="$t(`reactions.${option.reaction}`)" :aria-pressed="mine === option.reaction"
          @click="$emit('react', mine === option.reaction ? null : option.reaction)" />
      </template>
    </SketchFrame>
  </div>
</template>
