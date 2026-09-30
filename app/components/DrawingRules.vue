<script lang="ts" setup>
const props = defineProps<{
  noUndo: boolean
  noEraser: boolean
  /** This turn's colours; empty when unlimited. */
  colors: string[]
}>()

const { t } = useI18n()

const banned = computed(() => [
  ...(props.noUndo ? [{ icon: 'i-lucide-undo-2', label: t('settings.noUndo') }] : []),
  ...(props.noEraser ? [{ icon: 'i-lucide-eraser', label: t('settings.noEraser') }] : []),
])

const labels = computed(() => [
  ...banned.value.map(rule => rule.label),
  ...(props.colors.length ? [t('settings.colorCount', props.colors.length)] : []),
])
</script>

<template>
  <UTooltip v-if="labels.length" :text="labels.join(' · ')">
    <SketchFrame
      :radius="12" :strokeWidth="2.5" class="pop-in flex items-center gap-2 shrink-0 px-2.5 py-1.5 lg:px-3 lg:py-2"
      tabindex="0">
      <span v-for="rule in banned" :key="rule.icon" class="relative grid place-content-center" aria-hidden="true">
        <UIcon :name="rule.icon" class="size-5" />
        <span class="absolute inset-x-0 top-1/2 h-0.5 -rotate-45 rounded-full bg-current" />
      </span>
      <span v-if="colors.length" class="flex -space-x-1" aria-hidden="true">
        <span
          v-for="color in colors" :key="color" class="size-4 rounded-full ring-2 ring-(--paper)"
          :style="{ backgroundColor: color }" />
      </span>
      <span class="sr-only">{{ labels.join(', ') }}</span>
    </SketchFrame>
  </UTooltip>
</template>
