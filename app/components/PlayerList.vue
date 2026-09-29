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

function canKick(player: GamePlayer) {
  return Boolean(props.kick) && player.id !== props.you && player.connected
}

function votedKick(player: GamePlayer) {
  return props.kickVotes?.[player.id]?.includes(props.you) ?? false
}

function kickLabel(player: GamePlayer) {
  if (votedKick(player)) return t('players.unkick')
  const votes = props.kickVotes?.[player.id]?.length ?? 0
  return t('players.kick', { name: player.name, votes: votes + 1, needed: props.kick?.needed ?? 0 })
}
</script>

<template>
  <aside v-auto-animate class="flex flex-col gap-3" :aria-label="$t('players.title')">
    <div v-for="(player, index) in players" :key="player.id" class="flex items-center gap-2">
      <SketchFrame
        :fill="player.id === drawerId
          ? 'var(--color-tangerine-200)'
          : player.guessed ? 'color-mix(in oklab, var(--ui-color-success-300) 55%, var(--paper))' : 'var(--paper)'"
        :strokeWidth="2" :roughness="1"
        class="flex-1 min-w-0 flex items-center gap-3 py-2.5 ps-3 pe-4 transition-opacity"
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
            size="lg" :alt="player.name" />
          <UTooltip v-if="leader === player.id" :text="$t('players.leader')">
            <span class="absolute -top-4 -start-2 -rotate-20" role="img" :aria-label="$t('players.leader')">
              <SketchFrame
                shape="crown" fill="var(--color-tangerine-400)" stroke="var(--ink-fixed)"
                :strokeWidth="2" :roughness="0.9" class="pop-in w-7 h-5" />
            </span>
          </UTooltip>
        </span>
        <div class="min-w-0 grow flex flex-col gap-0.5">
          <p class="text-sm font-semibold truncate leading-tight">
            {{ player.name }}
            <UBadge
              v-if="you === player.id" size="sm" class="font-display align-middle" :label="$t('players.you')" />
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
      </SketchFrame>
      <UTooltip v-if="canKick(player)" :text="kickLabel(player)">
        <UButton
          square size="lg" icon="i-lucide-user-x" color="neutral" variant="outline"
          :active="votedKick(player)" activeColor="error" activeVariant="solid" class="shrink-0"
          :aria-label="kickLabel(player)" :aria-pressed="votedKick(player)"
          @click="emit('kick', player.id, !votedKick(player))" />
      </UTooltip>
    </div>
  </aside>
</template>
