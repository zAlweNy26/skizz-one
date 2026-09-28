<script lang="ts" setup>
import type { GamePlayer, RoundPhase } from '#shared/utils/protocol'

const props = defineProps<{
  phase: RoundPhase
  paused: boolean
  isDrawer: boolean
  choices: string[]
  drawerName: string
  winner?: GamePlayer
  you: string
}>()

defineEmits<{
  choose: [index: number]
}>()

const { t } = useI18n()

const winnerTitle = computed(() => {
  if (!props.winner) return t('log.gameOver')
  return props.winner.id === props.you ? t('finished.youWin') : t('finished.winner', { name: props.winner.name })
})
</script>

<template>
  <div
    v-if="paused"
    class="absolute inset-0 z-10 grid place-content-center justify-items-center gap-2
      bg-default/80 backdrop-blur-sm">
    <UIcon name="i-lucide-pause" class="size-12 text-warning" />
    <p class="font-display font-bold text-2xl">
      {{ $t('pause.overlay') }}
    </p>
  </div>
  <div
    v-else-if="phase === 'choosing'"
    class="absolute inset-0 z-10 grid place-content-center justify-items-center gap-3 p-3 bg-default/90 lg:gap-5">
    <template v-if="isDrawer">
      <p class="font-display font-bold text-lg text-center lg:text-2xl">
        {{ $t('choose.title') }}
      </p>
      <div class="flex flex-wrap justify-center gap-2 lg:gap-4">
        <SketchFrame
          v-for="(choice, index) in choices" :key="choice" as="button" type="button"
          fill="var(--choice-fill)" stroke="var(--ink-fixed)" :strokeWidth="2.5"
          class="choice pop-in press min-h-11 px-4 py-1.5 cursor-pointer rounded-sketch text-(--ink-fixed)
            focus-visible:outline-2 focus-visible:outline-primary lg:px-6 lg:py-3"
          @click="$emit('choose', index)">
          <span class="font-bouncy font-bold text-lg lg:text-2xl">{{ choice }}</span>
        </SketchFrame>
      </div>
    </template>
    <template v-else>
      <UIcon name="i-lucide-pencil" class="size-10 text-primary lg:size-12" />
      <p class="font-display font-bold text-lg text-center lg:text-2xl">
        {{ $t('choose.waiting', { name: drawerName }) }}
      </p>
    </template>
  </div>
  <div
    v-else-if="phase === 'finished'"
    class="absolute inset-0 z-10 grid place-content-center justify-items-center gap-1 p-3 bg-default/90 lg:gap-3">
    <UIcon name="i-lucide-trophy" class="pop-in size-10 text-warning lg:size-16" />
    <p class="pop-in font-bouncy font-bold text-2xl text-center lg:text-4xl">
      {{ winnerTitle }}
    </p>
    <p v-if="winner" class="font-display font-semibold text-muted">
      {{ $t('players.points', winner.points) }}
    </p>
  </div>
</template>

<style scoped>
.choice {
  --choice-fill: var(--color-tangerine-200);
}

@media (prefers-reduced-motion: no-preference) {
  .choice :deep(path) {
    transition: fill 150ms var(--ease-out-quart);
  }
}

@media (hover: hover) {
  .choice:hover {
    --choice-fill: var(--color-tangerine-300);
  }
}
</style>
