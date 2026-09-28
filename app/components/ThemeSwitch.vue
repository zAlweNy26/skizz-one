<script lang="ts" setup>
const isDark = useDark()
const toggleDark = useToggle(isDark)
</script>

<template>
  <LazyClientOnly>
    <UButton
      square variant="ghost" color="neutral" size="lg"
      class="text-(--on-stage) hover:bg-(--on-stage)/15"
      :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
      :aria-label="isDark ? $t('theme.light') : $t('theme.dark')" @click="toggleDark()" />
    <template #fallback>
      <div class="size-10" />
    </template>
  </LazyClientOnly>
</template>
