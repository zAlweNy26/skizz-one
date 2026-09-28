<script lang="ts" setup>
import type { GamePlayer } from '#shared/utils/protocol'

const props = defineProps<{
  /** Already sorted, best score first. */
  players: GamePlayer[]
  drawerId?: string | null
  you: string
}>()

/**
 * The row's fill carries its state at a glance; the icon beside the score
 * says the same thing for anyone who can't tell the colours apart.
 */
const leaders = computed(() => leaderIds(props.players))

function fillOf(player: GamePlayer) {
  if (player.id === props.drawerId) return 'var(--color-tangerine-200)'
  if (player.guessed) return 'color-mix(in oklab, var(--ui-color-success-300) 55%, var(--paper))'
  return 'var(--paper)'
}
</script>

<template>
  <aside v-auto-animate class="flex flex-col gap-3" :aria-label="$t('players.title')">
    <SketchFrame
      v-for="(player, index) in players" :key="player.id"
      :fill="fillOf(player)" :strokeWidth="2" :roughness="1"
      class="flex items-center gap-2 py-1.5 ps-2 pe-3 transition-opacity"
      :class="{
        'opacity-55': !player.connected,
        'text-(--ink-fixed)': player.id === drawerId || player.guessed,
      }">
      <span class="font-display font-extrabold text-lg w-5 text-center tabular-nums">
        {{ index + 1 }}
      </span>
      <span class="relative shrink-0">
        <UAvatar
          :src="`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.name)}`"
          size="lg" :alt="player.name" class="bg-transparent" />
        <!-- Perched on the avatar, tilted like it was drawn on in a hurry. -->
        <UTooltip v-if="leaders.has(player.id)" :text="$t('players.leader')">
          <!-- The frame's own root is `relative`, so the wrapper does the positioning. -->
          <span class="absolute -top-4 -start-2 -rotate-20" role="img" :aria-label="$t('players.leader')">
            <SketchFrame
              shape="crown" fill="var(--color-tangerine-400)" stroke="var(--ink-fixed)"
              :strokeWidth="2" :roughness="0.9" class="pop-in w-7 h-5" />
          </span>
        </UTooltip>
      </span>
      <div class="min-w-0 grow">
        <p class="text-sm font-semibold truncate leading-tight">
          {{ player.name }}
          <span v-if="you === player.id" class="font-display text-xs text-primary">({{ $t('players.you') }})</span>
        </p>
        <p class="text-xs font-medium tabular-nums">
          {{ $t('players.points', player.points) }}
        </p>
      </div>
      <UTooltip v-if="drawerId === player.id" :text="$t('players.drawing')">
        <UIcon name="i-lucide-pencil-line" class="size-4 shrink-0" :aria-label="$t('players.drawing')" />
      </UTooltip>
      <UTooltip v-else-if="player.guessed" :text="$t('players.guessed')">
        <UIcon name="i-lucide-badge-check" class="size-4 shrink-0" :aria-label="$t('players.guessed')" />
      </UTooltip>
    </SketchFrame>
  </aside>
</template>
