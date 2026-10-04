<script setup lang="ts">
import type { summarizeStats, TurnEnd } from '#shared/utils/stats'
import { TURN_ENDS } from '#shared/utils/stats'

const props = defineProps<{ stats: ReturnType<typeof summarizeStats> }>()

const { share } = useStatsFormat()

const TURN_ICONS: Record<TurnEnd, string> = {
  guessed: 'i-lucide-party-popper',
  timeUp: 'i-lucide-alarm-clock',
  drawerGone: 'i-lucide-wifi-off',
  drawerKicked: 'i-lucide-user-x',
}

const max = computed(() => Math.max(props.stats.totalTurns, 1))

const rows = computed(() => TURN_ENDS.map((reason) => {
  const turns = props.stats.turns[reason]
  const total = props.stats.totalTurns
  return { reason, turns, icon: TURN_ICONS[reason], share: share(total ? turns / total : null) }
}))
</script>

<template>
  <section class="flex flex-col gap-4" aria-labelledby="turn-ends">
    <h2 id="turn-ends" class="font-display font-bold text-xl">
      {{ $t('stats.turnsTitle', { n: stats.totalTurns }) }}
    </h2>
    <ul class="flex flex-col gap-3">
      <li
        v-for="row in rows" :key="row.reason"
        class="grid grid-cols-[1.5rem_1fr_3rem] items-center gap-x-3 gap-y-1
          sm:grid-cols-[1.5rem_minmax(0,14rem)_1fr_3rem]">
        <UIcon :name="row.icon" class="size-5" />
        <span class="font-semibold">{{ $t(`stats.turns.${row.reason}`) }}</span>
        <UProgress
          :modelValue="row.turns" :max="max"
          class="col-start-2 col-span-2 row-start-2 sm:col-start-3 sm:col-span-1 sm:row-start-1" />
        <span class="col-start-3 row-start-1 text-end tabular-nums text-muted sm:col-start-4">
          {{ row.share }}
        </span>
      </li>
    </ul>
  </section>
</template>
