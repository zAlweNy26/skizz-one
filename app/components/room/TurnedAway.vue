<script setup lang="ts">
import { PUBLIC_ROOM_CAP } from '#shared/utils/protocol'

defineProps<{ reason: 'kicked' | 'roomFull' | 'outdated' }>()

/** Fetch the new build past the service worker's cache, then load it. */
async function reloadApp() {
  const registration = await navigator.serviceWorker?.getRegistration()
  await registration?.update().catch(() => {})
  location.reload()
}
</script>

<template>
  <main class="min-h-dvh grid place-items-center px-4 py-8">
    <SketchFrame :radius="22" :strokeWidth="3" class="w-full max-w-md p-6 sm:p-8 flex flex-col items-center gap-4">
      <UIcon v-if="reason === 'kicked'" name="i-lucide-user-x" class="size-12 text-error" />
      <UIcon v-else-if="reason === 'outdated'" name="i-lucide-sparkles" class="size-12 text-secondary" />
      <UIcon v-else name="i-lucide-users" class="size-12 text-warning" />
      <h1 class="font-display font-extrabold text-2xl text-center">
        {{ $t(`${reason}.title`) }}
      </h1>
      <p class="text-muted text-center">
        {{ $t(`${reason}.description`, { n: PUBLIC_ROOM_CAP }) }}
      </p>
      <UButton
        v-if="reason === 'outdated'" size="xl" color="secondary" icon="i-lucide-refresh-cw"
        :label="$t('outdated.reload')" @click="reloadApp()" />
      <UButton
        v-else to="/" size="xl" color="secondary" icon="i-lucide-house"
        :label="$t(`${reason}.home`)" />
    </SketchFrame>
  </main>
</template>
