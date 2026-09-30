<script setup lang="ts">
import type { GameState, Language, RoomSettings } from '#shared/utils/protocol'
import {
  COLOR_LIMITS,
  DRAW_TIME,
  HINTS,
  LANGUAGES,
  MAX_CUSTOM_WORDS,
  ROUNDS,
  splitCustomWords,
} from '#shared/utils/protocol'

const props = defineProps<{
  state: GameState
  /** The room's custom words, which only the host is sent. */
  customWords: string[]
}>()

const emit = defineEmits<{ save: [settings: RoomSettings] }>()

const { t } = useI18n()
const open = ref(false)
const isDesktop = useIsDesktop()

const languageItems = (Object.keys(LANGUAGES) as Language[]).map(value => ({ value, label: LANGUAGES[value] }))
const colorLimitItems = computed(() => COLOR_LIMITS.map((value: number) => ({
  value,
  label: value ? t('settings.colorCount', value) : t('settings.allColors'),
})))

const language = ref<Language>(props.state.language)
const drawTime = ref(props.state.drawTime)
const totalRounds = ref(props.state.totalRounds)
const hints = ref(props.state.hints)
const isPublic = ref(props.state.public)
const noUndo = ref(props.state.noUndo)
const noEraser = ref(props.state.noEraser)
const colorLimit = ref(props.state.colorLimit)
const wordsText = ref('')

watch(open, (now) => {
  if (!now) return
  language.value = props.state.language
  drawTime.value = props.state.drawTime
  totalRounds.value = props.state.totalRounds
  hints.value = props.state.hints
  isPublic.value = props.state.public
  noUndo.value = props.state.noUndo
  noEraser.value = props.state.noEraser
  colorLimit.value = props.state.colorLimit
  wordsText.value = props.customWords.join(', ')
})

const words = computed(() => splitCustomWords(wordsText.value))

function save() {
  emit('save', {
    language: language.value,
    drawTime: drawTime.value,
    totalRounds: totalRounds.value,
    hints: hints.value,
    customWords: words.value,
    public: isPublic.value,
    noUndo: noUndo.value,
    noEraser: noEraser.value,
    colorLimit: colorLimit.value,
  })
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('settings.title')" :ui="{ body: 'flex flex-col gap-5' }">
    <UButton
      color="neutral" variant="soft" :size="isDesktop ? 'xl' : 'lg'" icon="i-lucide-settings-2"
      :label="isDesktop ? $t('settings.open') : undefined" :aria-label="$t('settings.open')" />

    <template #body>
      <USwitch
        v-model="isPublic" size="xl" :label="$t('settings.public')" :description="$t('settings.publicHelp')" />

      <UFormField :label="$t('lobby.wordLanguage')">
        <USelect
          v-model="language" :items="languageItems" icon="i-lucide-languages" size="lg" class="w-full" />
      </UFormField>

      <UFormField :label="$t('settings.drawTime')">
        <div class="flex items-center gap-4">
          <USlider
            v-model="drawTime" :min="DRAW_TIME.min" :max="DRAW_TIME.max" :step="10" class="grow"
            :aria-label="$t('settings.drawTime')" />
          <span class="w-14 text-end font-semibold tabular-nums">{{ $t('settings.seconds', { n: drawTime }) }}</span>
        </div>
      </UFormField>

      <div class="grid grid-cols-2 gap-4">
        <UFormField :label="$t('settings.rounds')">
          <UInputNumber v-model="totalRounds" :min="ROUNDS.min" :max="ROUNDS.max" size="lg" class="w-full" />
        </UFormField>
        <UFormField :label="$t('settings.hints')">
          <UInputNumber v-model="hints" :min="HINTS.min" :max="HINTS.max" size="lg" class="w-full" />
        </UFormField>
      </div>

      <UFormField
        :label="$t('settings.customWords')" :help="$t('settings.customWordsHelp')"
        :hint="$t('settings.customWordCount', { n: words.length, max: MAX_CUSTOM_WORDS })">
        <UTextarea
          v-model="wordsText" :rows="4" autoresize :maxrows="8" size="lg" class="w-full"
          :placeholder="$t('settings.customWordsPlaceholder')" />
      </UFormField>

      <fieldset class="flex flex-col gap-4">
        <legend class="mb-3 font-display font-bold text-lg">
          {{ $t('settings.rules') }}
        </legend>
        <USwitch
          v-model="noUndo" size="xl" :label="$t('settings.noUndo')" :description="$t('settings.noUndoHelp')" />
        <USwitch
          v-model="noEraser" size="xl" :label="$t('settings.noEraser')" :description="$t('settings.noEraserHelp')" />
        <UFormField :label="$t('settings.colorLimit')" :help="$t('settings.colorLimitHelp')">
          <USelect
            v-model="colorLimit" :items="colorLimitItems" icon="i-lucide-palette" size="lg" class="w-full" />
        </UFormField>
      </fieldset>
    </template>

    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral" variant="ghost" size="lg" :label="$t('settings.cancel')"
          @click="close()" />
        <UButton
          color="primary" size="lg" icon="i-lucide-check" :label="$t('settings.save')"
          @click="save()" />
      </div>
    </template>
  </UModal>
</template>
