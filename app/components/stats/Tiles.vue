<script setup lang="ts">
import type { summarizeStats } from '#shared/utils/stats'

const props = defineProps<{ stats: ReturnType<typeof summarizeStats> }>()

const { n } = useI18n()
const { share, amount } = useStatsFormat()

const tiles = computed(() => [
  { key: 'games', value: n(props.stats.games, 'decimal') },
  { key: 'rematchRate', value: share(props.stats.rematchRate) },
  { key: 'completedShare', value: share(props.stats.completedShare) },
  { key: 'avgPlayers', value: amount(props.stats.avgPlayers) },
  { key: 'avgMinutes', value: amount(props.stats.avgMinutes) },
].map((tile, index) => ({
  ...tile,
  fill: tile.key === 'rematchRate' ? 'var(--color-tangerine-200)' : 'var(--paper)',
  class: [index % 2 ? 'rotate-1' : '-rotate-1', index === 0 && 'col-span-2 sm:col-span-1'],
})))
</script>

<template>
  <dl class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
    <SketchFrame
      v-for="tile in tiles" :key="tile.key" :radius="16" :strokeWidth="2" :fill="tile.fill"
      class="p-4 flex flex-col-reverse gap-1" :class="tile.class">
      <dt class="text-sm font-semibold text-muted">
        {{ $t(`stats.${tile.key}`) }}
      </dt>
      <dd class="font-display font-extrabold text-4xl tabular-nums">
        {{ tile.value }}
      </dd>
    </SketchFrame>
  </dl>
</template>
