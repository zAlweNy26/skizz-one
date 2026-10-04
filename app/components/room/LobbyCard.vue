<script setup lang="ts">
import type { GameState, RoomSettings } from '#shared/utils/protocol'
import { LANGUAGES } from '#shared/utils/protocol'

const props = defineProps<{
  state: GameState
  isHost: boolean
  /** The room's custom words, which only the host is sent. */
  customWords: string[]
}>()

defineEmits<{ settings: [settings: RoomSettings], start: [], openQr: [] }>()

const { t } = useI18n()
const isDesktop = useIsDesktop()

const ruleBadges = computed(() => {
  const s = props.state
  if (s.chaos) return [{ icon: 'i-lucide-dices', label: t('settings.chaos') }]
  return [
    ...(s.noUndo ? [{ icon: 'i-lucide-undo-2', label: t('settings.noUndo') }] : []),
    ...(s.noEraser ? [{ icon: 'i-lucide-eraser', label: t('settings.noEraser') }] : []),
    ...(s.colorLimit ? [{ icon: 'i-lucide-palette', label: t('settings.colorCount', s.colorLimit) }] : []),
  ]
})

const summary = computed(() => {
  const s = props.state
  return [
    ...(s.public ? [{ icon: 'i-lucide-globe', label: t('settings.publicBadge') }] : []),
    { icon: 'i-lucide-languages', label: LANGUAGES[s.language] },
    { icon: 'i-lucide-timer', label: t('settings.seconds', { n: s.drawTime }) },
    { icon: 'i-lucide-repeat', label: t('settings.roundCount', s.totalRounds) },
    { icon: 'i-lucide-lightbulb', label: t('settings.hintCount', s.hints) },
    ...(s.customWordCount
      ? [{ icon: 'i-lucide-list-plus', label: t('settings.customWordTotal', s.customWordCount) }]
      : []),
    ...ruleBadges.value,
  ]
})
</script>

<template>
  <SketchFrame
    :radius="20" :strokeWidth="3"
    class="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 lg:gap-y-4 lg:px-6 lg:py-5">
    <SketchFrame
      shape="circle" fill="var(--color-tangerine-200)"
      class="max-sm:hidden size-14 grid place-content-center shrink-0 text-(--ink-fixed)">
      <UIcon name="i-lucide-users" class="size-7" />
    </SketchFrame>
    <div class="grow basis-64">
      <h2 class="font-display font-bold text-xl lg:text-2xl">
        {{ state.phase === 'finished' ? $t('finished.title') : $t('lobby.title') }}
      </h2>
      <p class="text-muted">
        {{ isHost ? $t('lobby.host') : $t('lobby.guest') }}
      </p>
      <ul class="mt-2 flex flex-wrap gap-1.5" :aria-label="$t('settings.title')">
        <li v-for="item in summary" :key="item.icon">
          <UBadge color="neutral" variant="soft" size="lg" :icon="item.icon" :label="item.label" />
        </li>
      </ul>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <UButton
        color="neutral" variant="soft" :size="isDesktop ? 'xl' : 'lg'" icon="i-lucide-qr-code"
        :label="isDesktop ? $t('qr.open') : undefined" :aria-label="$t('qr.open')" @click="$emit('openQr')" />
      <template v-if="isHost">
        <GameSettings :state="state" :customWords="customWords" @save="$emit('settings', $event)" />
        <UButton
          color="secondary" :size="isDesktop ? 'xl' : 'lg'" icon="i-lucide-rocket"
          :label="$t('lobby.start')" @click="$emit('start')" />
      </template>
    </div>
  </SketchFrame>
</template>
