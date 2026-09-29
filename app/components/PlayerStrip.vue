<script lang="ts" setup>
import type { GamePlayer } from '#shared/utils/protocol'

const props = defineProps<{
  /** Already sorted, best score first. */
  players: GamePlayer[]
  drawerId?: string | null
  you: string
  kickVotes?: Record<string, string[]>
  kick?: { needed: number }
}>()

defineEmits<{
  kick: [target: string, want: boolean]
}>()

const leader = computed(() => leaderId(props.players))
</script>

<template>
  <div>
    <UDrawer :title="$t('players.title')" :ui="{ body: 'pb-safe' }">
      <UButton
        variant="outline" color="neutral" size="xs" block trailingIcon="i-lucide-chevron-up"
        class="overflow-hidden"
        :aria-label="$t('players.showAll')">
        <span class="flex items-end gap-3 min-w-0 overflow-hidden pt-2 ps-1.5">
          <span
            v-for="player in players" :key="player.id"
            class="relative shrink-0 flex flex-col items-center gap-0.5"
            :class="{ 'opacity-55': !player.connected || player.away }">
            <UChip
              :show="player.id === drawerId || player.guessed" position="bottom-right" size="3xl"
              :color="player.id === drawerId ? 'secondary' : 'success'"
              :ui="{ base: 'translate-x-1/4 translate-y-1/4' }">
              <UAvatar
                :src="`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.name)}`"
                :alt="player.name" size="md" />
              <template #content>
                <UIcon :name="player.id === drawerId ? 'i-lucide-pencil-line' : 'i-lucide-check'" class="size-3" />
              </template>
            </UChip>
            <span class="absolute -top-2 -start-1.5 -rotate-20">
              <SketchFrame
                v-if="leader === player.id" shape="crown" fill="var(--color-tangerine-400)"
                stroke="var(--ink-fixed)" :strokeWidth="1.6" :roughness="0.9" class="pop-in w-5 h-4" />
            </span>
            <span class="font-display font-bold text-xs tabular-nums leading-none">
              {{ player.points }}
            </span>
          </span>
        </span>
      </UButton>

      <template #body>
        <PlayerList
          :players="players" :drawerId="drawerId" :you="you" :kickVotes="kickVotes" :kick="kick"
          @kick="(target, want) => $emit('kick', target, want)" />
      </template>
    </UDrawer>
  </div>
</template>
