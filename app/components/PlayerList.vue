<script lang="ts" setup>
import type { GamePlayer } from '#shared/utils/protocol'

defineProps<{
  /** Already sorted, best score first. */
  players: GamePlayer[]
  drawerId?: string | null
  you: string
}>()
</script>

<template>
  <aside v-auto-animate class="flex flex-col gap-2">
    <div
      v-for="(player, index) in players" :key="player.id"
      class="inline-flex items-center h-fit w-full gap-2 rounded-lg p-2 bg-elevated"
      :class="{ 'opacity-50': !player.connected }">
      <p class="font-bold">
        #{{ index + 1 }}
      </p>
      <UAvatar :src="`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.name)}`" size="xl" />
      <div>
        <p class="text-sm font-semibold">
          {{ player.name }}
        </p>
        <p class="text-xs font-medium">
          {{ player.points }} points
        </p>
      </div>
      <UIcon v-if="drawerId === player.id" name="i-lucide-paintbrush" class="ms-auto size-4" />
      <UIcon v-else-if="player.guessed" name="i-lucide-check" class="ms-auto size-4 text-success" />
      <UBadge v-if="you === player.id" class="ms-auto" size="sm" variant="soft" label="You" />
    </div>
  </aside>
</template>
