<script lang="ts" setup>
import type { GamePlayer } from '#shared/utils/protocol'

const props = defineProps<{
  /** Already sorted, best score first. */
  players: GamePlayer[]
  drawerId?: string | null
  you: string
}>()

const leaders = computed(() => leaderIds(props.players))

function ringOf(player: GamePlayer) {
  if (player.id === props.drawerId) return 'ring-(--color-tangerine-400)'
  if (player.guessed) return 'ring-success'
  return 'ring-transparent'
}
</script>

<template>
  <div>
    <UDrawer :title="$t('players.title')" :ui="{ body: 'pb-safe' }">
      <button
        type="button"
        class="press w-full min-h-14 rounded-sketch flex items-center gap-3 px-2 py-0.5 overflow-hidden
        bg-(--paper)/10 text-(--on-stage) cursor-pointer"
        :aria-label="$t('players.showAll')">
        <span class="flex items-end gap-3 min-w-0 overflow-hidden pt-2 ps-1.5">
          <span
            v-for="player in players" :key="player.id"
            class="relative shrink-0 flex flex-col items-center gap-0.5"
            :class="{ 'opacity-55': !player.connected }">
            <UAvatar
              :src="`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.name)}`"
              :alt="player.name" size="md" class="bg-(--paper) ring-2" :class="ringOf(player)" />
            <span class="absolute -top-2 -start-1.5 -rotate-20">
              <SketchFrame
                v-if="leaders.has(player.id)" shape="crown" fill="var(--color-tangerine-400)"
                stroke="var(--ink-fixed)" :strokeWidth="1.6" :roughness="0.9" class="pop-in w-5 h-4" />
            </span>
            <UIcon
              v-if="player.id === drawerId" name="i-lucide-pencil-line"
              class="absolute top-4 -end-1 size-4 rounded-full bg-(--color-tangerine-400) text-(--ink-fixed) p-0.5" />
            <UIcon
              v-else-if="player.guessed" name="i-lucide-check"
              class="absolute top-4 -end-1 size-4 rounded-full bg-success text-(--paper) p-0.5" />
            <span class="font-display font-bold text-xs tabular-nums leading-none">
              {{ player.points }}
            </span>
          </span>
        </span>
        <UIcon name="i-lucide-chevron-up" class="ms-auto size-5 shrink-0" />
      </button>

      <template #body>
        <PlayerList :players="players" :drawerId="drawerId" :you="you" />
      </template>
    </UDrawer>
  </div>
</template>
