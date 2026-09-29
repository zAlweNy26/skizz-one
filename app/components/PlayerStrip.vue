<script lang="ts" setup>
import type { GamePlayer } from '#shared/utils/protocol'

const props = defineProps<{
  /** Already sorted, best score first. */
  players: GamePlayer[]
  drawerId?: string | null
  you: string
  kickVotes?: Record<string, string[]>
  kick?: { needed: number, locked: boolean }
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
        variant="ghost" color="neutral" block
        class="min-h-14 gap-3 px-2 py-0.5 overflow-hidden bg-(--paper)/10 text-(--on-stage) hover:bg-(--paper)/15"
        :aria-label="$t('players.showAll')">
        <span class="flex items-end gap-3 min-w-0 overflow-hidden pt-2 ps-1.5">
          <span
            v-for="player in players" :key="player.id"
            class="relative shrink-0 flex flex-col items-center gap-0.5"
            :class="{ 'opacity-55': !player.connected || player.away }">
            <UChip
              :show="player.id === drawerId || player.guessed" position="bottom-right"
              :ui="{
                base: [
                  'size-4 p-0.5 translate-x-1/4 translate-y-1/4',
                  player.id === drawerId
                    ? 'bg-(--color-tangerine-400) text-(--ink-fixed)'
                    : 'bg-success text-(--paper)',
                ],
              }">
              <UAvatar
                :src="`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.name)}`"
                :alt="player.name" size="md" class="bg-(--paper) ring-2"
                :class="player.id === drawerId
                  ? 'ring-(--color-tangerine-400)'
                  : player.guessed ? 'ring-success' : 'ring-transparent'" />
              <template #content>
                <UIcon :name="player.id === drawerId ? 'i-lucide-pencil-line' : 'i-lucide-check'" class="size-full" />
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
        <UIcon name="i-lucide-chevron-up" class="ms-auto size-5 shrink-0" />
      </UButton>

      <template #body>
        <PlayerList
          :players="players" :drawerId="drawerId" :you="you" :kickVotes="kickVotes" :kick="kick"
          @kick="(target, want) => $emit('kick', target, want)" />
      </template>
    </UDrawer>
  </div>
</template>
