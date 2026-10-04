<script lang="ts" setup>
import type { Award, GamePlayer, RoundPhase } from '#shared/utils/protocol'

const props = defineProps<{
  phase: RoundPhase
  paused: boolean
  isDrawer: boolean
  choices: string[]
  canReroll: boolean
  drawerName: string
  /** Already sorted, best score first. */
  players: GamePlayer[]
  you: string
  awards: Award[]
}>()

defineEmits<{
  choose: [index: number]
  reroll: []
}>()

const { t } = useI18n()

const winnerTitle = computed(() => {
  const winner = props.players[0]
  if (!winner) return t('log.gameOver')
  return winner.id === props.you ? t('finished.youWin') : t('finished.winner', { name: winner.name })
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
    <CanvasChoices
      :isDrawer="isDrawer" :choices="choices" :canReroll="canReroll" :drawerName="drawerName"
      @choose="$emit('choose', $event)" @reroll="$emit('reroll')" />
  </div>
  <div
    v-else-if="phase === 'finished'"
    class="absolute inset-0 z-10 flex flex-col items-center justify-center-safe gap-1.5 p-2 overflow-y-auto
      bg-default/90 lg:gap-5 lg:p-3">
    <p class="pop-in font-bouncy font-bold text-xl text-center lg:text-4xl">
      {{ winnerTitle }}
    </p>
    <CanvasPodium :players="players" :you="you" />
    <CanvasAwards :awards="awards" :players="players" :you="you" />
  </div>
</template>
