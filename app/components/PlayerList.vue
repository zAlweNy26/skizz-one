<script lang="ts" setup>
import type { GamePlayer } from '#shared/utils/protocol'
import { MIN_PLAYERS_TO_VOTE_KICK } from '#shared/utils/protocol'

const props = defineProps<{
  /** Already sorted, best score first. */
  players: GamePlayer[]
  drawerId?: string | null
  you: string
  kickVotes?: Record<string, string[]>
  /** How kicking works for you; `locked` while the room is too small to vote. */
  kick?: { needed: number, locked: boolean }
}>()

const emit = defineEmits<{
  kick: [target: string, want: boolean]
}>()

const { t } = useI18n()

const leaders = computed(() => leaderIds(props.players))

function kickItems(player: GamePlayer) {
  const voted = props.kickVotes?.[player.id]?.includes(props.you) ?? false
  const votes = props.kickVotes?.[player.id]?.length ?? 0
  if (props.kick?.locked) {
    return [{
      label: t('players.kickLocked', { n: MIN_PLAYERS_TO_VOTE_KICK }),
      icon: 'i-lucide-user-x',
      disabled: true,
    }]
  }
  const label = voted
    ? t('players.unkick')
    : t('players.kick', { name: player.name, votes: votes + 1, needed: props.kick?.needed ?? 0 })
  return [{
    label,
    icon: voted ? 'i-lucide-undo-2' : 'i-lucide-user-x',
    color: voted ? 'neutral' as const : 'error' as const,
    onSelect: () => emit('kick', player.id, !voted),
  }]
}
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
      <UBadge
        v-if="kickVotes?.[player.id]?.length" color="error" variant="soft" size="sm" icon="i-lucide-user-x"
        class="shrink-0 tabular-nums" :label="`${kickVotes[player.id]!.length}/${kick?.needed ?? '?'}`"
        :aria-label="$t('players.kickVotes', kickVotes[player.id]!.length)" />
      <UTooltip v-if="drawerId === player.id" :text="$t('players.drawing')">
        <UIcon name="i-lucide-pencil-line" class="size-4 shrink-0" :aria-label="$t('players.drawing')" />
      </UTooltip>
      <UTooltip v-else-if="player.guessed" :text="$t('players.guessed')">
        <UIcon name="i-lucide-badge-check" class="size-4 shrink-0" :aria-label="$t('players.guessed')" />
      </UTooltip>
      <UDropdownMenu
        v-if="kick && player.id !== you && player.connected" :items="kickItems(player)" :content="{ align: 'end' }">
        <UButton
          variant="ghost" color="neutral" square icon="i-lucide-ellipsis-vertical"
          class="shrink-0 -me-2 -my-1 size-11 justify-center text-current hover:bg-current/10 lg:size-8 lg:my-0"
          :aria-label="$t('players.actions', { name: player.name })" />
      </UDropdownMenu>
    </SketchFrame>
  </aside>
</template>
