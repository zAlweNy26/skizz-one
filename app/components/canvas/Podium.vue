<script lang="ts" setup>
import type { GamePlayer } from '#shared/utils/protocol'

const props = defineProps<{
  /** Already sorted, best score first. */
  players: GamePlayer[]
  you: string
}>()

const isDesktop = useIsDesktop()

const places = computed(() => podium(props.players))

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
</template>
