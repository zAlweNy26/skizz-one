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

const isDesktop = useIsDesktop()

const mine = computed(() => props.reactions[props.you] ?? null)

const options = computed(() => {
  const all = Object.values(props.reactions)
  return ([
    { reaction: 'like', icon: 'i-lucide-thumbs-up', color: 'success' },
    { reaction: 'dislike', icon: 'i-lucide-thumbs-down', color: 'error' },
  ] as const).map((option) => {
    const count = all.filter(r => r === option.reaction).length
    const picked = mine.value === option.reaction
    return {
      ...option,
      count,
      picked,
      badgeColor: count ? option.color : 'neutral' as const,
      buttonColor: picked ? option.color : 'neutral' as const,
      variant: picked ? 'solid' as const : 'ghost' as const,
      next: picked ? null : option.reaction,
    }
  })
})
</script>

<template>
  <div class="absolute bottom-1 end-1 z-5 lg:bottom-2 lg:end-2" :class="{ 'pointer-events-none': isDrawer }">
    <SketchFrame
      :radius="10" :strokeWidth="1.8" :roughness="1" class="flex items-center gap-0.5 p-0.5 lg:gap-1 lg:p-1"
      role="group" :aria-label="$t('reactions.label')">
      <template v-for="option in options" :key="option.reaction">
        <UBadge
          v-if="isDrawer" variant="soft" :color="option.badgeColor" :icon="option.icon"
          :size="isDesktop ? 'xl' : 'lg'" class="font-display font-bold tabular-nums"
          :aria-label="$t(`reactions.${option.reaction}Count`, option.count)">
          <span :key="option.count" class="pop-in">{{ option.count }}</span>
        </UBadge>
        <UButton
          v-else
          :size="isDesktop ? 'md' : 'sm'" :color="option.buttonColor" :variant="option.variant"
          class="justify-center font-display font-bold tabular-nums"
          :icon="option.icon" :label="String(option.count)"
          :aria-label="$t(`reactions.${option.reaction}`)" :aria-pressed="option.picked"
          @click="$emit('react', option.next)" />
      </template>
    </SketchFrame>
  </div>
</template>
