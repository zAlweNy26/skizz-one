<script setup lang="ts">
import type { StatsPeriod, TurnEnd } from '#shared/utils/stats'
import { LANGUAGES } from '#shared/utils/protocol'
import { STATS_PERIODS, TURN_ENDS } from '#shared/utils/stats'

const { t, n } = useI18n()

const days = ref<StatsPeriod>(30)
const periods = computed(() => STATS_PERIODS.map(value => ({ label: t('stats.days', { n: value }), value })))

const { data, error, status } = await useFetch('/api/stats', { query: { days }, lazy: true })
const stats = computed(() => data.value?.stats ?? null)

function share(value: number | null) {
  return value === null ? '–' : n(value, 'percent')
}

function amount(value: number | null) {
  return value === null ? '–' : n(value, 'decimal')
}

const tiles = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { key: 'games', value: n(s.games, 'decimal') },
    { key: 'rematchRate', value: share(s.rematchRate) },
    { key: 'completedShare', value: share(s.completedShare) },
    { key: 'avgPlayers', value: amount(s.avgPlayers) },
    { key: 'avgMinutes', value: amount(s.avgMinutes) },
  ]
})

const TURN_ICONS: Record<TurnEnd, string> = {
  guessed: 'i-lucide-party-popper',
  timeUp: 'i-lucide-alarm-clock',
  drawerGone: 'i-lucide-wifi-off',
  drawerKicked: 'i-lucide-user-x',
}

const wordLists = computed(() => stats.value
  ? [
      { key: 'hardest', icon: 'i-lucide-brain', words: stats.value.hardest },
      { key: 'easiest', icon: 'i-lucide-smile', words: stats.value.easiest },
    ]
  : [])

function languageName(code: string) {
  return LANGUAGES[code as keyof typeof LANGUAGES] ?? code
}
</script>

<template>
  <PaperPage wide :title="$t('stats.title')" :description="$t('stats.description')">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <h1 class="font-display font-extrabold text-3xl">
          {{ $t('stats.title') }}
        </h1>
        <p class="text-muted">
          {{ $t('stats.description') }}
        </p>
      </div>
      <UTabs v-model="days" :items="periods" :content="false" size="lg" />
    </header>

    <p v-if="error" class="text-muted">
      {{ $t('stats.error') }}
    </p>
    <p v-else-if="status === 'pending' && !data" class="text-muted">
      {{ $t('stats.loading') }}
    </p>
    <p v-else-if="!stats?.games" class="text-muted">
      {{ $t('stats.empty') }}
    </p>

    <template v-else>
      <dl class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <SketchFrame
          v-for="(tile, index) in tiles" :key="tile.key" :radius="16" :strokeWidth="2"
          :fill="tile.key === 'rematchRate' ? 'var(--color-tangerine-200)' : 'var(--paper)'"
          class="p-4 flex flex-col-reverse gap-1"
          :class="[index % 2 ? 'rotate-1' : '-rotate-1', index === 0 && 'col-span-2 sm:col-span-1']">
          <dt class="text-sm font-semibold text-muted">
            {{ $t(`stats.${tile.key}`) }}
          </dt>
          <dd class="font-display font-extrabold text-4xl tabular-nums">
            {{ tile.value }}
          </dd>
        </SketchFrame>
      </dl>

      <section class="flex flex-col gap-4" aria-labelledby="turn-ends">
        <h2 id="turn-ends" class="font-display font-bold text-xl">
          {{ $t('stats.turnsTitle', { n: stats.totalTurns }) }}
        </h2>
        <ul class="flex flex-col gap-3">
          <li
            v-for="reason in TURN_ENDS" :key="reason"
            class="grid grid-cols-[1.5rem_1fr_3rem] items-center gap-x-3 gap-y-1
              sm:grid-cols-[1.5rem_minmax(0,14rem)_1fr_3rem]">
            <UIcon :name="TURN_ICONS[reason]" class="size-5" />
            <span class="font-semibold">{{ $t(`stats.turns.${reason}`) }}</span>
            <UProgress
              :modelValue="stats.turns[reason]" :max="Math.max(stats.totalTurns, 1)"
              class="col-start-2 col-span-2 row-start-2 sm:col-start-3 sm:col-span-1 sm:row-start-1" />
            <span class="col-start-3 row-start-1 text-end tabular-nums text-muted sm:col-start-4">
              {{ share(stats.totalTurns ? stats.turns[reason] / stats.totalTurns : null) }}
            </span>
          </li>
        </ul>
      </section>

      <div class="grid gap-6 sm:grid-cols-2">
        <section
          v-for="list in wordLists" :key="list.key" class="flex flex-col gap-3"
          :aria-labelledby="`words-${list.key}`">
          <div class="flex flex-col">
            <h2 :id="`words-${list.key}`" class="font-display font-bold text-xl flex items-center gap-2">
              <UIcon :name="list.icon" class="size-5" />
              {{ $t(`stats.${list.key}`) }}
            </h2>
            <p class="text-sm text-muted">
              {{ $t('stats.guessedHint') }}
            </p>
          </div>
          <p v-if="!list.words.length" class="text-muted">
            {{ $t('stats.noWords') }}
          </p>
          <ol v-else class="flex flex-col gap-2">
            <li v-for="word in list.words" :key="`${word.language}-${word.word}`" class="flex items-center gap-3">
              <span class="font-display font-bold text-lg grow truncate">{{ word.word }}</span>
              <UBadge color="neutral" variant="soft" :label="languageName(word.language)" />
              <span class="w-12 text-end font-semibold tabular-nums">{{ share(word.guessedShare) }}</span>
            </li>
          </ol>
        </section>
      </div>

      <p class="text-sm text-muted">
        {{ $t('stats.footnote') }}
      </p>
    </template>
  </PaperPage>
</template>
