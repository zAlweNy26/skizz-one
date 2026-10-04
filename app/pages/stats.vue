<script setup lang="ts">
import type { StatsPeriod } from '#shared/utils/stats'
import { STATS_PERIODS } from '#shared/utils/stats'

const { t } = useI18n()

const days = ref<StatsPeriod>(30)
const periods = computed(() => STATS_PERIODS.map(value => ({ label: t('stats.days', { n: value }), value })))

const { data, error, status } = await useFetch('/api/stats', { query: { days }, lazy: true })
const stats = computed(() => data.value?.stats ?? null)

/** The i18n key shown in place of the numbers, if any. */
const notice = computed(() => {
  if (error.value) return 'stats.error'
  if (status.value === 'pending' && !data.value) return 'stats.loading'
  return stats.value?.games ? null : 'stats.empty'
})
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

    <p v-if="notice || !stats" class="text-muted">
      {{ $t(notice ?? 'stats.empty') }}
    </p>

    <template v-else>
      <StatsTiles :stats="stats" />
      <StatsTurns :stats="stats" />
      <StatsWords :stats="stats" />
      <p class="text-sm text-muted">
        {{ $t('stats.footnote') }}
      </p>
    </template>
  </PaperPage>
</template>
