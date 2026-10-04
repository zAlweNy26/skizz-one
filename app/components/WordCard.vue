<script setup lang="ts">
import type { GameState } from '#shared/utils/protocol'
import { NO_RULES, wordLengths } from '#shared/utils/protocol'

const props = defineProps<{
  state: GameState | null
  /** The secret word, set only for the drawer. */
  word: string | null
  hint: string
  /** Null while untimed. */
  secondsLeft: number | null
}>()

const lengths = computed(() => wordLengths(props.word ?? props.hint))
const rules = computed(() => props.state?.rules ?? NO_RULES)
const turnKey = computed(() => `${props.state?.round ?? 0}:${props.state?.drawerId ?? ''}:${props.state?.phase}`)

const timerTone = computed(() => props.state?.paused
  ? 'warning'
  : props.secondsLeft !== null && props.secondsLeft <= 10 ? 'error' : 'calm')

const timerFill = computed(() => ({
  warning: 'color-mix(in oklab, var(--ui-color-warning-300) 70%, var(--paper))',
  error: 'color-mix(in oklab, var(--ui-color-error-300) 70%, var(--paper))',
  calm: 'var(--paper)',
})[timerTone.value])
</script>

<template>
  <div class="flex items-center justify-center gap-3 lg:gap-4">
    <SketchFrame
      :key="turnKey" :radius="18" :strokeWidth="3"
      class="pop-in flex items-center gap-3 px-4 py-1.5 min-h-12 min-w-0 lg:px-6 lg:py-2 lg:min-h-16">
      <p
        class="font-bouncy font-bold text-2xl tracking-widest break-words min-w-0 sm:text-3xl sm:tracking-word
          phone-landscape:text-xl phone-landscape:tracking-widest">
        <span aria-hidden="true">{{ word || hint || '—' }}</span>
        <span class="sr-only">{{ word ?? $t('header.hint') }}</span>
      </p>
      <UTooltip v-if="lengths.length" :text="$t('header.wordLengths', lengths.length)">
        <SketchFrame
          fill="var(--color-tangerine-200)" stroke="var(--ink-fixed)" :strokeWidth="1.8" :radius="7"
          :roughness="1.1" class="shrink-0 rotate-6 px-2.5 py-0.5 text-(--ink-fixed)">
          <span class="font-display font-bold text-sm tabular-nums whitespace-nowrap">
            {{ lengths.join(' · ') }}
          </span>
          <span class="sr-only">{{ $t('header.wordLengths', lengths.length) }}</span>
        </SketchFrame>
      </UTooltip>
    </SketchFrame>
    <SketchFrame
      v-if="secondsLeft !== null" shape="circle" :fill="timerFill" :strokeWidth="3"
      class="size-14 shrink-0 grid place-content-center lg:size-18 phone-landscape:size-12"
      :class="{ 'text-(--ink-fixed)': timerTone !== 'calm' }"
      role="timer" :aria-label="`${secondsLeft}s`">
      <span
        :key="timerTone === 'error' ? secondsLeft : 'steady'"
        class="font-display font-extrabold text-xl tabular-nums lg:text-2xl"
        :class="{ tick: timerTone === 'error' }">
        {{ secondsLeft }}
      </span>
    </SketchFrame>
    <DrawingRules
      v-if="state?.phase === 'drawing'" :noUndo="rules.noUndo" :noEraser="rules.noEraser" :colors="rules.colors" />
  </div>
</template>
