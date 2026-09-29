<script lang="ts" setup>
import type { Award, AwardKey, GamePlayer, RoundPhase } from '#shared/utils/protocol'

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
const isDesktop = useIsDesktop()

const places = computed(() => podium(props.players))

const winnerTitle = computed(() => {
  const winner = props.players[0]
  if (!winner) return t('log.gameOver')
  return winner.id === props.you ? t('finished.youWin') : t('finished.winner', { name: winner.name })
})

const AWARD_ICON: Record<AwardKey, string> = {
  fastest: 'i-lucide-zap',
  mostLiked: 'i-lucide-heart',
  almostHadIt: 'i-lucide-crosshair',
  picasso: 'i-lucide-palette',
}

const awardCards = computed(() => props.awards.flatMap((award) => {
  const player = props.players.find(p => p.id === award.playerId)
  if (!player) return []
  const value = award.key === 'fastest'
    ? t('awards.fastestValue', { n: (award.value / 1000).toFixed(1) })
    : t(`awards.${award.key}Value`, award.value)
  return [{ ...award, name: player.name, value, icon: AWARD_ICON[award.key] }]
}))

const STEP_ORDER = ['order-2', 'order-1', 'order-3']
const STEP_HEIGHT: Record<number, string> = { 1: 'h-9 lg:h-24', 2: 'h-6 lg:h-16', 3: 'h-4 lg:h-10' }
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
      <UButton
        v-if="canReroll" color="neutral" variant="soft" size="lg" icon="i-lucide-refresh-cw"
        :label="$t('choose.reroll')" @click="$emit('reroll')" />
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
    class="absolute inset-0 z-10 flex flex-col items-center justify-center-safe gap-1.5 p-2 overflow-y-auto
      bg-default/90 lg:gap-5 lg:p-3">
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
            :src="avatarUrl(place.player.avatar)"
            :alt="place.player.name" :size="isDesktop ? '3xl' : 'md'" />
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
    <ul
      v-if="awardCards.length"
      class="grid grid-cols-2 gap-1.5 w-full max-w-lg lg:flex lg:flex-wrap lg:justify-center lg:w-auto lg:gap-3"
      :aria-label="$t('awards.title')">
      <li
        v-for="(award, index) in awardCards" :key="award.key"
        class="pop-in min-w-0 odd:last:col-span-2 odd:last:justify-self-center"
        :style="{ animationDelay: `${600 + index * 120}ms` }">
        <SketchFrame
          :radius="8" :strokeWidth="1.8" :roughness="1.1"
          class="flex items-center gap-1.5 px-2 py-0.5 lg:gap-2 lg:px-3 lg:py-1.5"
          :class="index % 2 ? 'rotate-2' : '-rotate-2'">
          <UIcon :name="award.icon" class="size-4 shrink-0 text-primary lg:size-5" />
          <span class="flex flex-col min-w-0 leading-tight">
            <span class="truncate font-display font-bold text-xs lg:text-sm">{{ $t(`awards.${award.key}`) }}</span>
            <span class="text-xs text-muted" :class="{ 'text-primary': award.playerId === you }">
              {{ award.name }} · {{ award.value }}
            </span>
          </span>
        </SketchFrame>
      </li>
    </ul>
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
