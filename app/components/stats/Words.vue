<script setup lang="ts">
import type { summarizeStats } from '#shared/utils/stats'
import { LANGUAGES } from '#shared/utils/protocol'

const props = defineProps<{ stats: ReturnType<typeof summarizeStats> }>()

const { share } = useStatsFormat()

function languageName(code: string) {
  return LANGUAGES[code as keyof typeof LANGUAGES] ?? code
}

const lists = computed(() => [
  { key: 'hardest', icon: 'i-lucide-brain', words: props.stats.hardest },
  { key: 'easiest', icon: 'i-lucide-smile', words: props.stats.easiest },
].map(list => ({
  ...list,
  words: list.words.map(word => ({
    id: `${word.language}-${word.word}`,
    word: word.word,
    language: languageName(word.language),
    share: share(word.guessedShare),
  })),
})))
</script>

<template>
  <div class="grid gap-6 sm:grid-cols-2">
    <section
      v-for="list in lists" :key="list.key" class="flex flex-col gap-3"
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
        <li v-for="word in list.words" :key="word.id" class="flex items-center gap-3">
          <span class="font-display font-bold text-lg grow truncate">{{ word.word }}</span>
          <UBadge color="neutral" variant="soft" :label="word.language" />
          <span class="w-12 text-end font-semibold tabular-nums">{{ word.share }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>
