<script setup lang="ts">
const show = useTimeout(300)
</script>

<template>
  <main class="fixed inset-0 z-10 grid place-items-center px-4" role="status" :aria-label="$t('join.loading')">
    <SketchFrame
      v-if="show" :radius="22" :strokeWidth="3"
      class="pop-in w-full max-w-xs p-6 flex flex-col items-center gap-4">
      <img src="/favicon.svg" alt="" class="size-14 -rotate-6 motion-safe:animate-bounce">
      <p class="font-display font-bold text-lg text-center">
        {{ $t('join.loading') }}
      </p>
    </SketchFrame>
  </main>
</template>
