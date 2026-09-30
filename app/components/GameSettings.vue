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

type RuleMode = 'classic' | 'custom' | 'chaos'
type BannedTool = 'noUndo' | 'noEraser'

const { t } = useI18n()
const open = ref(false)
const tab = ref('game')
const isDesktop = useIsDesktop()

const tabs = computed(() => [
  { label: t('settings.tabs.game'), icon: 'i-lucide-gamepad-2', value: 'game', slot: 'game' as const },
  { label: t('settings.tabs.words'), icon: 'i-lucide-list-plus', value: 'words', slot: 'words' as const },
  { label: t('settings.tabs.rules'), icon: 'i-lucide-scale', value: 'rules', slot: 'rules' as const },
])

const languageItems = (Object.keys(LANGUAGES) as Language[]).map(value => ({ value, label: LANGUAGES[value] }))

const modeItems = computed(() => [
  { value: 'classic', icon: 'i-lucide-pencil', label: t('settings.modes.classic'), description: t('settings.modes.classicHelp') },
  { value: 'custom', icon: 'i-lucide-sliders-horizontal', label: t('settings.modes.custom'), description: t('settings.modes.customHelp') },
  { value: 'chaos', icon: 'i-lucide-dices', label: t('settings.modes.chaos'), description: t('settings.modes.chaosHelp') },
])

const toolItems = computed(() => [
  { value: 'noUndo', label: t('settings.noUndo'), description: t('settings.noUndoHelp') },
  { value: 'noEraser', label: t('settings.noEraser'), description: t('settings.noEraserHelp') },
])

const language = ref<Language>(props.state.language)
const drawTime = ref(props.state.drawTime)
const totalRounds = ref(props.state.totalRounds)
const hints = ref(props.state.hints)
const isPublic = ref(props.state.public)
const mode = ref<RuleMode>('classic')
const banned = ref<BannedTool[]>([])
const colorLimit = ref(0)
const wordsText = ref('')

function ruleMode(s: GameState): RuleMode {
  if (s.chaos) return 'chaos'
  return s.noUndo || s.noEraser || s.colorLimit ? 'custom' : 'classic'
}

watch(open, (now) => {
  if (!now) return
  const s = props.state
  tab.value = 'game'
  language.value = s.language
  drawTime.value = s.drawTime
  totalRounds.value = s.totalRounds
  hints.value = s.hints
  isPublic.value = s.public
  mode.value = ruleMode(s)
  banned.value = [...(s.noUndo ? ['noUndo' as const] : []), ...(s.noEraser ? ['noEraser' as const] : [])]
  colorLimit.value = s.colorLimit
  wordsText.value = props.customWords.join(', ')
})

const words = computed(() => splitCustomWords(wordsText.value))

function save() {
  const custom = mode.value !== 'classic'
  emit('save', {
    language: language.value,
    drawTime: drawTime.value,
    totalRounds: totalRounds.value,
    hints: hints.value,
    customWords: words.value,
    public: isPublic.value,
    noUndo: custom && banned.value.includes('noUndo'),
    noEraser: custom && banned.value.includes('noEraser'),
    colorLimit: custom ? colorLimit.value : 0,
    chaos: mode.value === 'chaos',
  })
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('settings.title')">
    <UButton
      color="neutral" variant="soft" :size="isDesktop ? 'xl' : 'lg'" icon="i-lucide-settings-2"
      :label="isDesktop ? $t('settings.open') : undefined" :aria-label="$t('settings.open')" />

    <template #body>
      <UTabs v-model="tab" :items="tabs" size="lg" class="w-full" :ui="{ content: 'flex flex-col gap-5 pt-4' }">
        <template #game>
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
              <span class="w-14 text-end font-semibold tabular-nums">
                {{ $t('settings.seconds', { n: drawTime }) }}
              </span>
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
        </template>

        <template #words>
          <UFormField
            :label="$t('settings.customWords')" :help="$t('settings.customWordsHelp')"
            :hint="$t('settings.customWordCount', { n: words.length, max: MAX_CUSTOM_WORDS })">
            <UTextarea
              v-model="wordsText" :rows="6" autoresize :maxrows="10" size="lg" class="w-full"
              :placeholder="$t('settings.customWordsPlaceholder')" />
          </UFormField>
        </template>

        <template #rules>
          <URadioGroup
            v-model="mode" :items="modeItems" variant="card" indicator="hidden" size="lg"
            :legend="$t('settings.modes.title')" :ui="{ fieldset: 'grid gap-2 lg:grid-cols-3' }">
            <template #label="{ item }">
              <span class="font-display font-bold">{{ item.label }}</span>
            </template>
          </URadioGroup>

          <template v-if="mode === 'custom'">
            <UCheckboxGroup
              v-model="banned" :items="toolItems" variant="card" size="lg" :legend="$t('settings.customRules')" />

            <UFormField :label="$t('settings.colorLimit')" :help="$t('settings.colorLimitHelp')">
              <UFieldGroup size="lg">
                <UButton
                  v-for="limit in COLOR_LIMITS" :key="limit" color="neutral" variant="outline"
                  :active="colorLimit === limit" activeColor="primary" activeVariant="solid"
                  :icon="limit ? undefined : 'i-lucide-palette'"
                  :label="limit ? String(limit) : $t('settings.allColors')" :aria-pressed="colorLimit === limit"
                  @click="colorLimit = limit" />
              </UFieldGroup>
            </UFormField>
          </template>
        </template>
      </UTabs>
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
