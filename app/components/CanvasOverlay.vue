<script lang="ts" setup>
import type { GamePlayer, RoundPhase } from '#shared/utils/protocol'

const props = defineProps<{
  phase: RoundPhase
  paused: boolean
  isDrawer: boolean
  choices: string[]
  drawerName: string
  /** Already sorted, best score first. */
  players: GamePlayer[]
  you: string
}>()

defineEmits<{
  choose: [index: number]
}>()

const { t } = useI18n()

const places = computed(() => podium(props.players))

const winnerTitle = computed(() => {
  const winner = props.players[0]
  if (!winner) return t('log.gameOver')
  return winner.id === props.you ? t('finished.youWin') : t('finished.winner', { name: winner.name })
})

const STEP_ORDER = ['order-2', 'order-1', 'order-3']
const STEP_HEIGHT: Record<number, string> = { 1: 'h-12 lg:h-24', 2: 'h-8 lg:h-16', 3: 'h-5 lg:h-10' }
const STEP_FILL: Record<number, string> = {
  1: 'var(--color-tangerine-300)',
  2: 'var(--color-tangerine-200)',
  3: 'var(--color-tangerine-100)',
}
/** ms; the podium fills from third place up. */
const STEP_DELAY = [360, 180, 0]
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
    class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 p-3 bg-default/90 lg:gap-5">
    <p class="pop-in font-bouncy font-bold text-xl text-center lg:text-4xl">
      {{ winnerTitle }}
    </p>
    <ol class="flex items-end justify-center gap-1.5 lg:gap-4">
      <li
        v-for="(place, index) in places" :key="place.player.id"
        class="pop-in flex flex-col items-center w-20 lg:w-36" :class="STEP_ORDER[index]"
        :style="{ animationDelay: `${STEP_DELAY[index]}ms` }">
        <span class="relative">
          <UAvatar
            :src="`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(place.player.name)}`"
            :alt="place.player.name" class="size-9 bg-transparent lg:size-16" />
          <span v-if="place.rank === 1" class="absolute -top-3 -start-2 -rotate-20 lg:-top-5 lg:-start-3">
            <SketchFrame
              shape="crown" fill="var(--color-tangerine-400)" stroke="var(--ink-fixed)"
              :strokeWidth="2" :roughness="0.9" class="w-6 h-4 lg:w-9 lg:h-6" />
          </span>
        </span>
        <p
          class="max-w-full truncate text-xs font-semibold leading-tight lg:text-base"
          :class="{ 'text-primary': place.player.id === you }">
          {{ place.player.name }}
        </p>
        <p class="text-xs font-medium text-muted tabular-nums lg:text-sm">
          {{ $t('players.points', place.player.points) }}
        </p>
        <SketchFrame
          :fill="STEP_FILL[place.rank]" stroke="var(--ink-fixed)" :strokeWidth="2" :radius="6"
          class="grid place-content-center w-full mt-1 text-(--ink-fixed)" :class="STEP_HEIGHT[place.rank]">
          <span class="font-display font-extrabold text-sm lg:text-2xl">{{ place.rank }}</span>
        </SketchFrame>
      </li>
    </ol>
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
