<script lang="ts" setup>
import type { GamePlayer } from '#shared/utils/protocol'

const props = defineProps<{
  /** Already sorted, best score first. */
  players: GamePlayer[]
  drawerId?: string | null
  you: string
}>()

const leaders = computed(() => leaderIds(props.players))
</script>

<template>
  <aside v-auto-animate class="flex flex-col gap-3" :aria-label="$t('players.title')">
    <SketchFrame
      v-for="(player, index) in players" :key="player.id"
      :fill="player.id === drawerId
        ? 'var(--color-tangerine-200)'
        : player.guessed ? 'color-mix(in oklab, var(--ui-color-success-300) 55%, var(--paper))' : 'var(--paper)'"
      :strokeWidth="2" :roughness="1"
      class="flex items-center gap-2 py-1.5 ps-2 pe-3 transition-opacity"
      :class="{
        'opacity-55': !player.connected || player.away,
        'text-(--ink-fixed)': player.id === drawerId || player.guessed,
      }">
      <span class="font-display font-extrabold text-lg w-5 text-center tabular-nums">
        {{ index + 1 }}
      </span>
      <span class="relative shrink-0">
        <UAvatar
          :src="`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.name)}`"
          size="lg" :alt="player.name" class="bg-transparent" />
        <UTooltip v-if="leaders.has(player.id)" :text="$t('players.leader')">
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
          <UBadge
            v-if="you === player.id" size="sm" variant="soft"
            class="font-display align-middle text-current bg-current/10" :label="$t('players.you')" />
        </p>
        <p class="text-xs font-medium tabular-nums">
          {{ $t('players.points', player.points) }}
        </p>
      </div>
      <UTooltip v-if="player.away" :text="$t('players.away')">
        <UIcon name="i-lucide-wifi-off" class="size-4 shrink-0" :aria-label="$t('players.away')" />
      </UTooltip>
      <UTooltip v-if="drawerId === player.id" :text="$t('players.drawing')">
        <UIcon name="i-lucide-pencil-line" class="size-4 shrink-0" :aria-label="$t('players.drawing')" />
      </UTooltip>
      <UTooltip v-else-if="player.guessed" :text="$t('players.guessed')">
        <UIcon name="i-lucide-badge-check" class="size-4 shrink-0" :aria-label="$t('players.guessed')" />
      </UTooltip>
    </SketchFrame>
  </aside>
</template>
