<script setup lang="ts">
useHead({
  titleTemplate: title => title ? `${title} | SkizzOne` : 'SkizzOne',
})
</script>

<template>
  <UApp :tooltip="{ delayDuration: 300 }" :toaster="{ duration: 2000, position: 'bottom-right' }">
    <NuxtPage />
  </UApp>
</template>
