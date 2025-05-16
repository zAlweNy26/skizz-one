<script lang="ts" setup>
const isDark = useDark()
const toggleDark = useToggle(isDark)
</script>

<template>
  <LazyClientOnly>
    <UButton square variant="soft" color="neutral" @click="toggleDark()">
      <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-5" />
    </UButton>
    <template #fallback>
      <div class="size-8" />
    </template>
  </LazyClientOnly>
</template>
