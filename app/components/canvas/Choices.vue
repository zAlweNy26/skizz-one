<script lang="ts" setup>
defineProps<{
  isDrawer: boolean
  choices: string[]
  canReroll: boolean
  drawerName: string
}>()

defineEmits<{
  choose: [index: number]
  reroll: []
}>()
</script>

<template>
  <template v-if="isDrawer">
    <p class="font-display font-bold text-lg text-center lg:text-2xl">
      {{ $t('choose.title') }}
    </p>
    <div class="flex flex-wrap justify-center gap-2 lg:gap-4">
      <SketchFrame
        v-for="(choice, index) in choices" :key="choice" as="button" type="button"
        fill="var(--choice-fill)" stroke="var(--ink-fixed)" :strokeWidth="2.5"
        class="choice pop-in press min-h-11 px-4 py-1.5 cursor-pointer rounded-sketch text-(--ink-fixed)
          focus-visible:outline-2 focus-visible:outline-primary lg:px-6 lg:py-3"
        @click="$emit('choose', index)">
        <span class="font-bouncy font-bold text-lg lg:text-2xl">{{ choice }}</span>
      </SketchFrame>
    </div>
    <UButton
      v-if="canReroll" color="neutral" variant="soft" size="lg" icon="i-lucide-refresh-cw"
      :label="$t('choose.reroll')" @click="$emit('reroll')" />
  </template>
  <template v-else>
    <UIcon name="i-lucide-pencil" class="size-10 text-primary lg:size-12" />
    <p class="font-display font-bold text-lg text-center lg:text-2xl">
      {{ $t('choose.waiting', { name: drawerName }) }}
    </p>
  </template>
</template>

<style scoped>
.choice {
  --choice-fill: var(--color-tangerine-200);
}

@media (prefers-reduced-motion: no-preference) {
  .choice :deep(path) {
    transition: fill 150ms var(--ease-out-quart);
  }
}

@media (hover: hover) {
  .choice:hover {
    --choice-fill: var(--color-tangerine-300);
  }
}
</style>
