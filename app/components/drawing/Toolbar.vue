<script setup lang="ts">
import type { Brush } from 'drauu'

type Tools = ReturnType<typeof useDrawingTools>

defineProps<{
  colors: Tools['colors']['value']
  modes: Tools['modes']['value']
  actions: Tools['actions']['value']
  /** The turn limits the palette, so the swatches line up in one row. */
  limited: boolean
}>()

defineEmits<{ selectMode: [mode: ToolMode] }>()

const brush = defineModel<Brush>('brush', { required: true })
</script>

<template>
  <SketchFrame
    :radius="16" :strokeWidth="2.5"
    class="flex flex-wrap items-center justify-between gap-2 p-1.5 lg:gap-4 lg:p-3
      phone-landscape:flex-col phone-landscape:flex-nowrap phone-landscape:gap-1">
    <div class="max-lg:hidden grid gap-1" :class="limited ? 'grid-flow-col' : 'grid-cols-13'">
      <UButton
        v-for="(color, index) in colors" :key="index" color="neutral" variant="outline"
        :active="brush.color === color" activeVariant="solid" size="xs" square icon="i-lucide-check"
        class="rounded-full"
        :ui="{ leadingIcon: brush.color === color ? 'text-white mix-blend-difference' : 'invisible' }"
        :style="{ backgroundColor: color }" :aria-label="$t('canvas.color', { color })"
        :aria-pressed="brush.color === color" @click="brush.color = color" />
    </div>
    <div class="max-lg:hidden">
      <UPopover>
        <UButton variant="soft" size="lg" color="neutral" square :aria-label="$t('canvas.brushSize')">
          <div
            class="rounded-full transition-transform size-5"
            :style="{ backgroundColor: brush.color, transform: `scale(${brush.size * 0.032})` }" />
        </UButton>
        <template #content>
          <div class="w-48 p-3">
            <USlider v-model="brush.size" size="sm" :min="8" :max="48" :aria-label="$t('canvas.brushSize')" />
          </div>
        </template>
      </UPopover>
    </div>

    <UDrawer :title="$t('canvas.brush')" :ui="{ body: 'pb-safe flex flex-col gap-5' }">
      <UButton variant="soft" size="lg" color="neutral" square class="lg:hidden" :aria-label="$t('canvas.brush')">
        <div
          class="rounded-full ring-1 ring-(--ink)/30 transition-transform size-5"
          :style="{ backgroundColor: brush.color, transform: `scale(${brush.size * 0.032})` }" />
      </UButton>
      <template #body>
        <div class="grid grid-cols-7 gap-2 justify-items-center">
          <UButton
            v-for="(color, index) in colors" :key="index" color="neutral" variant="outline"
            :active="brush.color === color" activeVariant="solid" size="lg" square icon="i-lucide-check"
            class="rounded-full"
            :ui="{ leadingIcon: brush.color === color ? 'text-white mix-blend-difference' : 'invisible' }"
            :style="{ backgroundColor: color }" :aria-label="$t('canvas.color', { color })"
            :aria-pressed="brush.color === color" @click="brush.color = color" />
        </div>
        <USlider v-model="brush.size" size="lg" :min="8" :max="48" :aria-label="$t('canvas.brushSize')" />
      </template>
    </UDrawer>

    <div class="flex gap-1.5 lg:gap-2 phone-landscape:flex-col phone-landscape:gap-1">
      <UTooltip v-for="tool in modes" :key="tool.key" :text="$t(tool.label)" :kbds="[tool.key]">
        <UButton
          size="lg" color="neutral" variant="soft" :active="brush.mode === tool.mode"
          activeColor="primary" activeVariant="solid" class="relative" square :icon="tool.icon"
          :aria-label="$t(tool.label)" :aria-pressed="brush.mode === tool.mode"
          @click="$emit('selectMode', tool.mode)">
          <UKbd
            :value="tool.key" size="sm" variant="soft" color="neutral"
            class="max-lg:hidden absolute top-0.5 start-0.5 font-bold" aria-hidden="true" />
        </UButton>
      </UTooltip>
    </div>
    <div v-if="actions.length" class="flex gap-1.5 lg:gap-2 phone-landscape:flex-col phone-landscape:gap-1">
      <UTooltip v-for="tool in actions" :key="tool.key" :text="$t(tool.label)" :kbds="[tool.key]">
        <UButton
          size="lg" variant="soft" :color="tool.color" class="relative" square :icon="tool.icon"
          :aria-label="$t(tool.label)" :disabled="tool.disabled" @click="tool.run()">
          <UKbd
            :value="tool.key" size="sm" variant="soft" color="neutral"
            class="max-lg:hidden absolute top-0.5 start-0.5 font-bold" aria-hidden="true" />
        </UButton>
      </UTooltip>
    </div>
  </SketchFrame>
</template>
