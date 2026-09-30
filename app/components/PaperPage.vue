<script setup lang="ts">
const props = defineProps<{ title?: string, description?: string, wide?: boolean }>()

useSeoMeta({
  title: () => props.title,
  description: () => props.description,
  ogTitle: () => props.title && `${props.title} | SkizzOne`,
  ogDescription: () => props.description,
})
</script>

<template>
  <main class="min-h-dvh flex justify-center px-4 py-8">
    <div class="w-full flex flex-col items-center gap-8" :class="wide ? 'max-w-5xl' : 'max-w-2xl'">
      <ULink to="/" raw class="press inline-flex -rotate-6 rounded-sketch" :aria-label="$t('kicked.home')">
        <img src="/favicon.svg" alt="SkizzOne" class="size-16">
      </ULink>

      <SketchFrame :radius="22" :strokeWidth="3" class="w-full p-6 sm:p-8 flex flex-col gap-6">
        <slot />

        <UButton
          to="/" size="xl" color="secondary" icon="i-lucide-house" class="self-center"
          :label="$t('kicked.home')" />
      </SketchFrame>
    </div>
  </main>
</template>
