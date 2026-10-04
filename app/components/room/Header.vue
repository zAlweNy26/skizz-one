<script setup lang="ts">
import type { GameState } from '#shared/utils/protocol'
import { votesNeeded } from '#shared/utils/protocol'

const props = defineProps<{
  state: GameState | null
  you: string
  connected: boolean
  gameId: string
}>()

const emit = defineEmits<{ pause: [want: boolean], openQr: [] }>()

const muted = defineModel<boolean>('muted', { required: true })

const { t } = useI18n()
const toast = useToast()

const paused = computed(() => props.state?.paused ?? false)
const votedPause = computed(() => props.state?.pauseVotes.includes(props.you) ?? false)
const canVotePause = computed(() => props.state?.phase === 'drawing' || props.state?.phase === 'intermission')
const pauseTally = computed(() => ({
  votes: props.state?.pauseVotes.length ?? 0,
  needed: votesNeeded(props.state?.players.filter(p => p.connected && !p.away).length ?? 0, paused.value),
}))
const pauseLabel = computed(() =>
  `${paused.value ? t('pause.resume') : t('pause.pause')} ${pauseTally.value.votes}/${pauseTally.value.needed}`)
const pauseIcon = computed(() => votedPause.value ? 'i-lucide-hand' : paused.value ? 'i-lucide-play' : 'i-lucide-pause')

const roundArgs = computed(() => ({ round: props.state?.round || 0, total: props.state?.totalRounds || 3 }))

function togglePause() {
  emit('pause', !votedPause.value)
}

const { copy } = useClipboard()
const { share, isSupported: canShare } = useShare()

async function shareGame() {
  const url = window.location.href
  if (canShare.value) {
    await share({ title: 'SkizzOne', text: t('share.text'), url }).catch(() => {})
    return
  }
  await copy(url)
  toast.add({ title: t('share.title'), description: t('share.description'), icon: 'i-lucide-link' })
}

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const menuItems = computed(() => [
  [{ type: 'label' as const, label: t('header.gameId', { id: props.gameId }) }],
  [
    ...(canVotePause.value ? [{ label: pauseLabel.value, icon: pauseIcon.value, onSelect: togglePause }] : []),
    { label: t('header.share'), icon: 'i-lucide-share-2', onSelect: shareGame },
    { label: t('qr.open'), icon: 'i-lucide-qr-code', onSelect: () => emit('openQr') },
    {
      label: muted.value ? t('sound.unmute') : t('sound.mute'),
      icon: muted.value ? 'i-lucide-volume-x' : 'i-lucide-volume-2',
      onSelect: () => { muted.value = !muted.value },
    },
    {
      label: isDark.value ? t('theme.light') : t('theme.dark'),
      icon: isDark.value ? 'i-lucide-sun' : 'i-lucide-moon',
      onSelect: () => { colorMode.preference = isDark.value ? 'light' : 'dark' },
    },
  ],
])
</script>

<template>
  <header class="flex items-center gap-x-3 lg:flex-wrap lg:gap-x-5 lg:gap-y-3">
    <ULink to="/" raw class="press shrink-0 inline-flex items-center min-h-11 -rotate-6 rounded-sketch">
      <img src="/favicon.svg" alt="SkizzOne" class="size-11 lg:size-12">
    </ULink>
    <p class="font-display font-bold text-lg text-(--on-stage)">
      <span class="lg:hidden">{{ $t('header.roundShort', roundArgs) }}</span>
      <span class="max-lg:hidden">{{ $t('header.round', roundArgs) }}</span>
    </p>

    <div class="ms-auto flex items-center gap-2">
      <UBadge
        v-if="!connected && state" color="error" variant="solid" size="lg" icon="i-lucide-wifi-off"
        :label="$t('header.offline')" />

      <div class="max-lg:hidden flex flex-wrap items-center gap-2">
        <UTooltip
          v-if="canVotePause"
          :text="paused ? $t('pause.resumeHint', pauseTally) : $t('pause.pauseHint', pauseTally)">
          <UButton
            :icon="pauseIcon" color="neutral" variant="outline" size="lg" :active="votedPause"
            :activeColor="paused ? 'success' : 'warning'" activeVariant="solid" :label="pauseLabel"
            @click="togglePause()" />
        </UTooltip>
        <UTooltip :text="$t('header.share')">
          <UButton
            color="neutral" variant="outline" size="lg" trailingIcon="i-lucide-share-2"
            class="font-mono" :label="gameId"
            :aria-label="`${$t('header.gameId', { id: gameId })}. ${$t('header.share')}`"
            @click="shareGame()" />
        </UTooltip>
        <UButton
          square variant="outline" color="neutral" size="lg"
          :icon="muted ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
          :aria-label="muted ? $t('sound.unmute') : $t('sound.mute')" :aria-pressed="muted"
          @click="muted = !muted" />
        <UColorModeButton size="lg" variant="outline" />
      </div>

      <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
        <UButton
          color="neutral" variant="outline" size="lg" square icon="i-lucide-ellipsis" class="lg:hidden"
          :active="votedPause" :activeColor="paused ? 'success' : 'warning'" activeVariant="solid"
          :aria-label="$t('header.menu')" />
      </UDropdownMenu>
    </div>
  </header>
</template>
