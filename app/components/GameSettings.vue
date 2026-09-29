<script setup lang="ts">
import type { GameState, Language, RoomSettings } from '#shared/utils/protocol'
import { DRAW_TIME, HINTS, LANGUAGES, MAX_CUSTOM_WORDS, ROUNDS, splitCustomWords } from '#shared/utils/protocol'

const props = defineProps<{
  state: GameState
  /** The room's custom words, which only the host is sent. */
  customWords: string[]
}>()

const emit = defineEmits<{ save: [settings: RoomSettings] }>()

const open = ref(false)

const languageItems = (Object.keys(LANGUAGES) as Language[]).map(value => ({ value, label: LANGUAGES[value] }))

const language = ref<Language>(props.state.language)
const drawTime = ref(props.state.drawTime)
const totalRounds = ref(props.state.totalRounds)
const hints = ref(props.state.hints)
const isPublic = ref(props.state.public)
const wordsText = ref('')

watch(open, (now) => {
  if (!now) return
  language.value = props.state.language
  drawTime.value = props.state.drawTime
  totalRounds.value = props.state.totalRounds
  hints.value = props.state.hints
  isPublic.value = props.state.public
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
  })
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('settings.title')" :ui="{ body: 'flex flex-col gap-5' }">
    <UButton
      color="neutral" variant="soft" size="xl" icon="i-lucide-settings-2"
      :label="$t('settings.open')" />

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
