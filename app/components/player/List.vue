<script lang="ts" setup>
import type { GamePlayer } from '#shared/utils/protocol'

const props = defineProps<{
  /** Already sorted, best score first. */
  players: GamePlayer[]
  drawerId?: string | null
  you: string
  kickVotes?: Record<string, string[]>
  /** Votes a kick needs; unset while the room is too small to vote. */
  kick?: { needed: number }
}>()

const emit = defineEmits<{
  kick: [target: string, want: boolean]
}>()

const { t } = useI18n()

const leader = computed(() => leaderId(props.players))

const GUESSED_FILL = 'color-mix(in oklab, var(--ui-color-success-300) 55%, var(--paper))'

const needed = computed(() => (props.kick ? String(props.kick.needed) : '?'))

function canKick(player: GamePlayer) {
  return Boolean(props.kick) && player.id !== props.you && player.connected
}

function kickState(player: GamePlayer) {
  const votes = props.kickVotes?.[player.id] ?? []
  const voted = votes.includes(props.you)
  return {
    allowed: canKick(player),
    votes: votes.length,
    tally: `${votes.length}/${needed.value}`,
    voted,
    label: voted
      ? t('players.unkick')
      : t('players.kick', { name: player.name, votes: votes.length + 1, needed: props.kick?.needed ?? 0 }),
  }
}

function status(player: GamePlayer) {
  if (player.id === props.drawerId) return { icon: 'i-lucide-pencil-line', label: t('players.drawing') }
  return player.guessed ? { icon: 'i-lucide-badge-check', label: t('players.guessed') } : null
}

function fill(player: GamePlayer) {
  if (player.id === props.drawerId) return 'var(--color-tangerine-200)'
  return player.guessed ? GUESSED_FILL : 'var(--paper)'
}

const rows = computed(() => props.players.map(player => ({
  player,
  fill: fill(player),
  faded: !player.connected || player.away,
  status: status(player),
  isYou: player.id === props.you,
  isLeader: leader.value === player.id,
  kick: kickState(player),
})))
</script>

<template>
  <aside v-auto-animate class="flex flex-col gap-3" :aria-label="$t('players.title')">
    <div v-for="(row, index) in rows" :key="row.player.id" class="flex items-center gap-2">
      <SketchFrame
        :fill="row.fill" :strokeWidth="2" :roughness="1"
        class="flex-1 min-w-0 flex items-center gap-3 py-2.5 ps-3 pe-4 transition-opacity"
        :class="{ 'opacity-55': row.faded, 'text-(--ink-fixed)': row.status }">
        <span class="font-display font-extrabold text-lg w-5 text-center tabular-nums">
          {{ index + 1 }}
        </span>
        <span class="relative shrink-0">
          <UAvatar
            :src="avatarUrl(row.player.avatar)"
            size="lg" :alt="row.player.name" />
          <UTooltip v-if="row.isLeader" :text="$t('players.leader')">
            <span class="absolute -top-4 -start-2 -rotate-20" role="img" :aria-label="$t('players.leader')">
              <SketchFrame
                shape="crown" fill="var(--color-tangerine-400)" stroke="var(--ink-fixed)"
                :strokeWidth="2" :roughness="0.9" class="pop-in w-7 h-5" />
            </span>
          </UTooltip>
        </span>
        <div class="min-w-0 grow flex flex-col gap-0.5">
          <p class="text-sm font-semibold truncate leading-tight">
            {{ row.player.name }}
            <UBadge
              v-if="row.isYou" size="sm" class="font-display align-middle" :label="$t('players.you')" />
          </p>
          <p class="text-xs font-medium tabular-nums">
            {{ $t('players.points', row.player.points) }}
          </p>
        </div>
        <UTooltip v-if="row.player.away" :text="$t('players.away')">
          <UIcon name="i-lucide-wifi-off" class="size-4 shrink-0" :aria-label="$t('players.away')" />
        </UTooltip>
        <UBadge
          v-if="row.kick.votes" color="error" variant="soft" size="sm" icon="i-lucide-user-x"
          class="shrink-0 tabular-nums" :label="row.kick.tally"
          :aria-label="$t('players.kickVotes', row.kick.votes)" />
        <UTooltip v-if="row.status" :text="row.status.label">
          <UIcon :name="row.status.icon" class="size-4 shrink-0" :aria-label="row.status.label" />
        </UTooltip>
      </SketchFrame>
      <UTooltip v-if="row.kick.allowed" :text="row.kick.label">
        <UButton
          square size="lg" icon="i-lucide-user-x" color="neutral" variant="outline"
          :active="row.kick.voted" activeColor="error" activeVariant="solid" class="shrink-0"
          :aria-label="row.kick.label" :aria-pressed="row.kick.voted"
          @click="emit('kick', row.player.id, !row.kick.voted)" />
      </UTooltip>
    </div>
  </aside>
</template>
