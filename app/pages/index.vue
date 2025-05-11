<script setup lang="ts">
import { randomUUID } from 'uncrypto'

const gameId = useRouteQuery('code', '', { transform: String })

onMounted(() => {
  if (!gameId.value) gameId.value = randomUUID().split('-')[0]!
})
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 h-screen">
    <h1 class="font-bold text-2xl text-(--ui-primary)">
      SkizzOne
    </h1>
    {{ gameId }}
  </div>
</template>
