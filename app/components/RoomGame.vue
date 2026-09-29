<script setup lang="ts">
import { useDrauu } from '@vueuse/integrations/useDrauu'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  kickVotesNeeded,
  LANGUAGES,
  MIN_PLAYERS_TO_VOTE_KICK,
  votesNeeded,
  wordLengths,
} from '#shared/utils/protocol'

const paletteColors = [
  '#FFFFFF', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00ff91', '#00b2ff', '#231fd3', '#a300ba', '#df69a7', '#ffac8e', '#a0522d',
  '#000000', '#505050', '#740b07', '#c23800', '#e8a200', '#004619', '#00785d', '#00569e', '#0e0865', '#550069', '#873554', '#cc774d', '#63300d',
]

const toast = useToast()
const { t } = useI18n()
const route = useRoute()
const gameId = computed(() => String(route.params.code ?? ''))
const sketch = useTemplateRef<SVGSVGElement>('sketch')

const drauu = useDrauu(sketch, {
  brush: {
    mode: 'draw',
    color: '#000000',
    // SVG user units, not CSS pixels.
    size: 16,
  },
})
const { undo, redo, clear, canUndo, canRedo, brush } = drauu

const game = useGameSocket(gameId)
const {
  state, chat, word, hint, endsAt, leaderboard, isDrawer, isHost, connected, you,
  hasGuessed, paused, votedPause, customWords, choices, canReroll, kicked,
} = game

const sync = useDrawingSync(drauu, game)

const activeElement = useActiveElement()
watch(isDrawer, (drawing) => {
  if (drawing) activeElement.value?.blur()
})

watch(paused, (now, was) => {
  if (was && !now) sync.syncCanvas()
})

const now = useNow({ scheduler: cb => useIntervalFn(cb, 250) })
const secondsLeft = computed(() => {
  if (paused.value) return Math.ceil((state.value?.remainingMs ?? 0) / 1000)
  if (!endsAt.value) return null
  return Math.max(0, Math.ceil((endsAt.value - now.value.getTime()) / 1000))
})

const { muted } = useSounds({ onMessage: game.onMessage, you, state, secondsLeft })

const phase = computed(() => state.value?.phase ?? 'lobby')
const canDraw = computed(() => isDrawer.value && phase.value === 'drawing' && !paused.value)

const drawerName = computed(() => state.value?.players.find(p => p.id === state.value?.drawerId)?.name ?? '')

const activeCount = computed(() => state.value?.players.filter(p => p.connected && !p.away).length ?? 0)

const canVotePause = computed(() => phase.value === 'drawing' || phase.value === 'intermission')
const pauseTally = computed(() => ({
  votes: state.value?.pauseVotes.length ?? 0,
  needed: votesNeeded(activeCount.value, paused.value),
}))

const kickRule = computed(() => ({
  needed: kickVotesNeeded(activeCount.value),
  locked: activeCount.value < MIN_PLAYERS_TO_VOTE_KICK,
}))

function voteKick(target: string, want: boolean) {
  game.send({ t: 'kick', target, want })
}

function togglePause() {
  game.send({ t: 'pause', want: !votedPause.value })
}

const lengths = computed(() => wordLengths(word.value ?? hint.value))

const settingsSummary = computed(() => {
  const s = state.value
  if (!s) return []
  return [
    { icon: 'i-lucide-languages', label: LANGUAGES[s.language] },
    { icon: 'i-lucide-timer', label: t('settings.seconds', { n: s.drawTime }) },
    { icon: 'i-lucide-repeat', label: t('settings.roundCount', s.totalRounds) },
    { icon: 'i-lucide-lightbulb', label: t('settings.hintCount', s.hints) },
    ...(s.customWordCount
      ? [{ icon: 'i-lucide-list-plus', label: t('settings.customWordTotal', s.customWordCount) }]
      : []),
  ]
})

const { copy } = useClipboard()
const { share, isSupported: canShare } = useShare()

async function shareGame() {
  const url = window.location.href
  if (canShare.value) {
    await share({ title: 'SkizzOne', text: t('share.text'), url }).catch(() => {})
    return
  }
  await copy(url)
  toast.add({
    title: t('share.title'),
    description: t('share.description'),
    icon: 'i-lucide-link',
  })
}

const wakeLock = useWakeLock()
watch(phase, (now) => {
  if (!wakeLock.isSupported.value) return
  if (now === 'choosing' || now === 'drawing' || now === 'intermission')
    wakeLock.request('screen').catch(() => {})
  else
    wakeLock.release().catch(() => {})
}, { immediate: true })

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const menuItems = computed(() => [
  [{ type: 'label' as const, label: t('header.gameId', { id: gameId.value }) }],
  [
    ...(canVotePause.value
      ? [{
          label: `${paused.value ? t('pause.resume') : t('pause.pause')} ${pauseTally.value.votes}/${pauseTally.value.needed}`,
          icon: votedPause.value ? 'i-lucide-hand' : paused.value ? 'i-lucide-play' : 'i-lucide-pause',
          onSelect: togglePause,
        }]
      : []),
    { label: t('header.share'), icon: 'i-lucide-share-2', onSelect: shareGame },
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

function localUndo() {
  if (!canDraw.value || !canUndo.value) return
  undo()
  sync.syncCanvas()
}

function localRedo() {
  if (!canDraw.value || !canRedo.value) return
  redo()
  sync.syncCanvas()
}

function localClear() {
  if (!canDraw.value) return
  clear()
  sync.syncCanvas()
}

const modeTools = [
  { key: 'B', mode: 'draw', icon: 'i-lucide-paintbrush', label: 'canvas.tools.draw', cursor: 'cursor-pencil' },
  { key: 'F', mode: 'bucket', icon: 'i-lucide-paint-bucket', label: 'canvas.tools.bucket', cursor: 'cursor-bucket' },
  { key: 'E', mode: 'eraseLine', icon: 'i-lucide-eraser', label: 'canvas.tools.eraseLine', cursor: 'cursor-eraser' },
] as const

const canvasCursor = computed(() => modeTools.find(tool => tool.mode === brush.value.mode)?.cursor ?? 'cursor-pencil')

const actionTools = computed(() => [
  { key: 'U', icon: 'i-lucide-undo-2', label: 'canvas.tools.undo', color: 'neutral', disabled: !canUndo.value, run: localUndo },
  { key: 'R', icon: 'i-lucide-redo-2', label: 'canvas.tools.redo', color: 'neutral', disabled: !canRedo.value, run: localRedo },
  { key: 'D', icon: 'i-lucide-trash-2', label: 'canvas.tools.clear', color: 'error', disabled: false, run: localClear },
] as const)

const timerTone = computed(() => paused.value
  ? 'warning'
  : secondsLeft.value !== null && secondsLeft.value <= 10 ? 'error' : 'calm')

const timerFill = computed(() => ({
  warning: 'color-mix(in oklab, var(--ui-color-warning-300) 70%, var(--paper))',
  error: 'color-mix(in oklab, var(--ui-color-error-300) 70%, var(--paper))',
  calm: 'var(--paper)',
})[timerTone.value])

const stageChip = 'bg-(color:--chip) text-(color:--on-chip) hover:bg-(color:--chip)/85'

const roundArgs = computed(() => ({ round: state.value?.round || 0, total: state.value?.totalRounds || 3 }))

const turnKey = computed(() => `${state.value?.round ?? 0}:${state.value?.drawerId ?? ''}:${phase.value}`)

function selectMode(mode: typeof modeTools[number]['mode']) {
  brush.value.mode = mode
  if (mode === 'eraseLine') brush.value.eraseMode = 'partial'
}

useHead({
  title: computed(() => (canDraw.value ? t('title.drawing') : t('title.playing'))),
  htmlAttrs: { class: 'overscroll-y-none' },
})

defineShortcuts({
  b: () => { if (canDraw.value) brush.value.mode = 'draw' },
  f: () => { if (canDraw.value) brush.value.mode = 'bucket' },
  e: () => { if (canDraw.value) brush.value.mode = 'eraseLine' },
  u: localUndo,
  r: localRedo,
  d: localClear,
})
</script>

<template>
  <main v-if="kicked" class="min-h-dvh grid place-items-center px-4 py-8">
    <SketchFrame :radius="22" :strokeWidth="3" class="w-full max-w-md p-6 sm:p-8 flex flex-col items-center gap-4">
      <UIcon name="i-lucide-user-x" class="size-12 text-error" />
      <h1 class="font-display font-extrabold text-2xl text-center">
        {{ $t('kicked.title') }}
      </h1>
      <p class="text-muted text-center">
        {{ $t('kicked.description') }}
      </p>
      <UButton to="/" size="xl" color="secondary" icon="i-lucide-house" class="min-h-11" :label="$t('kicked.home')" />
    </SketchFrame>
  </main>

  <main
    v-else
    class="flex flex-col mx-auto w-full max-w-room gap-2 px-safe py-safe h-dvh overflow-y-auto
      overscroll-y-contain lg:gap-5 lg:h-auto lg:min-h-dvh lg:overflow-visible
      phone-landscape:grid phone-landscape:grid-cols-[auto_auto_minmax(0,1fr)]
      phone-landscape:grid-rows-[auto_auto_minmax(0,1fr)_auto]">
    <header
      class="flex items-center gap-x-3 lg:flex-wrap lg:gap-x-5 lg:gap-y-3
        phone-landscape:col-start-3 phone-landscape:row-start-1">
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
              :icon="votedPause ? 'i-lucide-hand' : paused ? 'i-lucide-play' : 'i-lucide-pause'"
              :color="votedPause ? (paused ? 'success' : 'warning') : 'neutral'" variant="solid"
              :class="{ [stageChip]: !votedPause }"
              :label="`${paused ? $t('pause.resume') : $t('pause.pause')} ${pauseTally.votes}/${pauseTally.needed}`"
              @click="togglePause()" />
          </UTooltip>
          <UTooltip :text="$t('header.share')">
            <UButton
              color="neutral" variant="solid" trailingIcon="i-lucide-share-2" class="font-mono" :class="[stageChip]"
              :label="gameId" :aria-label="`${$t('header.gameId', { id: gameId })}. ${$t('header.share')}`"
              @click="shareGame()" />
          </UTooltip>
          <UButton
            square variant="ghost" color="neutral" size="lg"
            class="text-(--on-stage) hover:bg-(--on-stage)/15"
            :icon="muted ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
            :aria-label="muted ? $t('sound.unmute') : $t('sound.mute')" :aria-pressed="muted"
            @click="muted = !muted" />
          <UColorModeButton size="lg" class="text-(--on-stage) hover:bg-(--on-stage)/15" />
        </div>

        <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
          <UButton
            color="neutral" variant="solid" square icon="i-lucide-ellipsis" class="lg:hidden size-11 justify-center"
            :class="[votedPause ? '' : stageChip]" :aria-label="$t('header.menu')" />
        </UDropdownMenu>
      </div>
    </header>

    <PlayerStrip
      :players="leaderboard" :drawerId="state?.drawerId" :you="you" :kickVotes="state?.kickVotes" :kick="kickRule"
      class="lg:hidden phone-landscape:col-start-3 phone-landscape:row-start-4"
      @kick="voteKick" />

    <SketchFrame
      v-if="phase === 'lobby' || phase === 'finished'" :radius="20" :strokeWidth="3"
      class="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 lg:gap-y-4 lg:px-6 lg:py-5"
      :class="phase === 'lobby'
        ? ['phone-landscape:canvas-landscape phone-landscape:col-start-2 phone-landscape:row-span-full',
           'phone-landscape:content-center']
        : 'phone-landscape:col-start-3 phone-landscape:row-start-2'">
      <SketchFrame
        shape="circle" fill="var(--color-tangerine-200)"
        class="max-sm:hidden size-14 grid place-content-center shrink-0 text-(--ink-fixed)">
        <UIcon name="i-lucide-users" class="size-7" />
      </SketchFrame>
      <div class="grow basis-64">
        <h2 class="font-display font-bold text-xl lg:text-2xl">
          {{ phase === 'finished' ? $t('finished.title') : $t('lobby.title') }}
        </h2>
        <p class="text-muted">
          {{ isHost ? $t('lobby.host') : $t('lobby.guest') }}
        </p>
        <ul class="mt-2 flex flex-wrap gap-1.5" :aria-label="$t('settings.title')">
          <li v-for="item in settingsSummary" :key="item.icon">
            <UBadge color="neutral" variant="soft" size="lg" :icon="item.icon" :label="item.label" />
          </li>
        </ul>
      </div>
      <div v-if="isHost && state" class="flex flex-wrap items-center gap-3">
        <GameSettings
          :state="state" :customWords="customWords" @save="game.send({ t: 'settings', settings: $event })" />
        <UButton
          color="secondary" size="xl" icon="i-lucide-rocket" class="text-lg min-h-11"
          :label="$t('lobby.start')" @click="game.send({ t: 'start' })" />
      </div>
    </SketchFrame>

    <section
      class="flex flex-col flex-1 min-h-0 w-full gap-2
        lg:grid lg:flex-none lg:gap-5 lg:items-start
        lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_22rem]
        2xl:grid-cols-[15rem_minmax(0,1fr)_24rem] phone-landscape:contents">
      <PlayerList
        :players="leaderboard" :drawerId="state?.drawerId" :you="you" :kickVotes="state?.kickVotes" :kick="kickRule"
        class="max-lg:hidden lg:order-1 lg:row-span-2 xl:row-span-1"
        @kick="voteKick" />

      <div class="flex flex-col gap-2 shrink-0 lg:gap-4 lg:order-2 phone-landscape:contents">
        <div
          v-if="phase !== 'lobby' && phase !== 'finished'"
          class="flex items-center justify-center gap-3 lg:gap-4
            phone-landscape:col-start-3 phone-landscape:row-start-2">
          <SketchFrame
            :key="turnKey" :radius="18" :strokeWidth="3"
            class="pop-in flex items-center gap-3 px-4 py-1.5 min-h-12 min-w-0 lg:px-6 lg:py-2 lg:min-h-16">
            <p
              class="font-bouncy font-bold text-2xl tracking-widest break-words min-w-0 sm:text-3xl sm:tracking-word
                phone-landscape:text-xl phone-landscape:tracking-widest">
              <span aria-hidden="true">{{ word || hint || '—' }}</span>
              <span class="sr-only">{{ word ?? $t('header.hint') }}</span>
            </p>
            <UTooltip v-if="lengths.length" :text="$t('header.wordLengths', lengths.length)">
              <SketchFrame
                fill="var(--color-tangerine-200)" stroke="var(--ink-fixed)" :strokeWidth="1.8" :radius="7"
                :roughness="1.1" class="shrink-0 rotate-6 px-2.5 py-0.5 text-(--ink-fixed)">
                <span class="font-display font-bold text-sm tabular-nums whitespace-nowrap">
                  {{ lengths.join(' · ') }}
                </span>
                <span class="sr-only">{{ $t('header.wordLengths', lengths.length) }}</span>
              </SketchFrame>
            </UTooltip>
          </SketchFrame>
          <SketchFrame
            v-if="secondsLeft !== null" shape="circle" :fill="timerFill" :strokeWidth="3"
            class="size-14 shrink-0 grid place-content-center lg:size-18 phone-landscape:size-12"
            :class="{ 'text-(--ink-fixed)': timerTone !== 'calm' }"
            role="timer" :aria-label="`${secondsLeft}s`">
            <span
              :key="timerTone === 'error' ? secondsLeft : 'steady'"
              class="font-display font-extrabold text-xl tabular-nums lg:text-2xl"
              :class="{ tick: timerTone === 'error' }">
              {{ secondsLeft }}
            </span>
          </SketchFrame>
        </div>

        <SketchFrame
          :radius="16" :strokeWidth="3.5" :roughness="1.4"
          class="p-1.5 w-full mx-auto lg:p-2.5 lg:max-w-[calc((100dvh-21rem)*4/3)]
            phone-landscape:canvas-landscape phone-landscape:col-start-2 phone-landscape:row-span-full
            phone-landscape:self-start"
          :class="{ 'phone-landscape:hidden': phase === 'lobby' }">
          <div class="relative aspect-4/3 rounded-sm overflow-hidden bg-white">
            <CanvasOverlay
              :phase="phase" :paused="paused" :isDrawer="isDrawer" :choices="choices" :canReroll="canReroll"
              :drawerName="drawerName" :players="leaderboard" :you="you"
              @choose="game.send({ t: 'choose', index: $event })" @reroll="game.send({ t: 'reroll' })" />
            <DrawingReactions
              v-if="phase === 'drawing' && state" :reactions="state.reactions" :isDrawer="isDrawer" :you="you"
              @react="game.send({ t: 'react', reaction: $event })" />
            <svg
              ref="sketch"
              class="size-full"
              :class="canDraw ? [canvasCursor, 'touch-none'] : 'pointer-events-none'"
              :viewBox="`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`"
              preserveAspectRatio="xMidYMid meet" />
          </div>
        </SketchFrame>

        <SketchFrame
          v-if="canDraw" :radius="16" :strokeWidth="2.5"
          class="flex flex-wrap items-center justify-between gap-2 p-1.5 lg:gap-4 lg:p-3
            phone-landscape:flex-col phone-landscape:flex-nowrap phone-landscape:gap-1
            phone-landscape:col-start-1 phone-landscape:row-span-full phone-landscape:self-center">
          <div class="max-lg:hidden grid grid-cols-13 gap-1">
            <UButton
              v-for="(color, index) in paletteColors" :key="index" variant="ghost"
              class="size-6 p-0 rounded-full ring-1 ring-(--ink)/30 transition-shadow"
              :class="{ 'ring-3 ring-(--ink)': brush.color === color }"
              :style="{ backgroundColor: color }" :aria-label="$t('canvas.color', { color })"
              :aria-pressed="brush.color === color" @click="brush.color = color" />
          </div>
          <div class="max-lg:hidden">
            <UPopover>
              <UButton
                variant="soft" size="xl" color="neutral" square class="size-11 grid place-content-center"
                :aria-label="$t('canvas.brushSize')">
                <div
                  class="rounded-full transition-transform size-4"
                  :style="{ backgroundColor: brush.color, transform: `scale(${brush.size * 0.04})` }" />
              </UButton>
              <template #content>
                <div class="w-48 p-3">
                  <USlider v-model="brush.size" size="sm" :min="8" :max="48" :aria-label="$t('canvas.brushSize')" />
                </div>
              </template>
            </UPopover>
          </div>

          <UDrawer :title="$t('canvas.brush')" :ui="{ body: 'pb-safe flex flex-col gap-5' }">
            <UButton
              variant="soft" size="xl" color="neutral" square class="lg:hidden size-11 grid place-content-center"
              :aria-label="$t('canvas.brush')">
              <div
                class="rounded-full ring-1 ring-(--ink)/30 transition-transform size-4"
                :style="{ backgroundColor: brush.color, transform: `scale(${brush.size * 0.04})` }" />
            </UButton>
            <template #body>
              <div class="grid grid-cols-7 gap-2 justify-items-center">
                <UButton
                  v-for="(color, index) in paletteColors" :key="index" variant="ghost"
                  class="size-11 p-0 rounded-full ring-1 ring-(--ink)/30 transition-shadow"
                  :class="{ 'ring-4 ring-(--ink)': brush.color === color }"
                  :style="{ backgroundColor: color }" :aria-label="$t('canvas.color', { color })"
                  :aria-pressed="brush.color === color" @click="brush.color = color" />
              </div>
              <USlider v-model="brush.size" size="lg" :min="8" :max="48" :aria-label="$t('canvas.brushSize')" />
            </template>
          </UDrawer>

          <div class="flex gap-1.5 lg:gap-2 phone-landscape:flex-col phone-landscape:gap-1">
            <UTooltip v-for="tool in modeTools" :key="tool.key" :text="$t(tool.label)" :kbds="[tool.key]">
              <UButton
                size="xl" :variant="brush.mode === tool.mode ? 'solid' : 'soft'"
                :color="brush.mode === tool.mode ? 'primary' : 'neutral'"
                class="relative size-11 grid place-content-center" square
                :aria-label="$t(tool.label)" :aria-pressed="brush.mode === tool.mode" @click="selectMode(tool.mode)">
                <UIcon :name="tool.icon" class="size-5" />
                <UKbd
                  :value="tool.key" size="sm" variant="soft" color="neutral"
                  class="max-lg:hidden absolute top-0.5 start-0.5 font-bold" aria-hidden="true" />
              </UButton>
            </UTooltip>
          </div>
          <div class="flex gap-1.5 lg:gap-2 phone-landscape:flex-col phone-landscape:gap-1">
            <UTooltip v-for="tool in actionTools" :key="tool.key" :text="$t(tool.label)" :kbds="[tool.key]">
              <UButton
                size="xl" variant="soft" :color="tool.color" class="relative size-11 grid place-content-center" square
                :aria-label="$t(tool.label)" :disabled="tool.disabled" @click="tool.run()">
                <UIcon :name="tool.icon" class="size-5" />
                <UKbd
                  :value="tool.key" size="sm" variant="soft" color="neutral"
                  class="max-lg:hidden absolute top-0.5 start-0.5 font-bold" aria-hidden="true" />
              </UButton>
            </UTooltip>
          </div>
        </SketchFrame>
      </div>

      <ChatPanel
        class="flex-1 min-h-36 lg:order-3 lg:flex-none lg:col-start-2 lg:h-80 lg:contain-size
          xl:col-start-3 xl:row-start-1 xl:h-auto xl:self-stretch
          phone-landscape:col-start-3 phone-landscape:row-start-3"
        :entries="chat" :isDrawer="isDrawer" :hasGuessed="hasGuessed"
        :drawing="phase === 'drawing'" :paused="paused" @guess="game.send({ t: 'guess', text: $event })" />
    </section>
  </main>
</template>

<style scoped>
.cursor-pencil {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 64 64'%3E%3Cg transform='rotate(90 32 32)'%3E%3Cpath fill='%23ffce31' d='M7.934 41.132L39.828 9.246l14.918 14.922l-31.895 31.886z'/%3E%3Cpath fill='%23ed4c5c' d='m61.3 4.6l-1.9-1.9C55.8-.9 50-.9 46.3 2.7l-6.5 6.5l15 15l6.5-6.5c3.6-3.6 3.6-9.5 0-13.1'/%3E%3Cpath fill='%2393a2aa' d='m35.782 13.31l4.1-4.102l14.92 14.92l-4.1 4.101z'/%3E%3Cpath fill='%23c7d3d8' d='m37.338 14.865l4.1-4.101l11.739 11.738l-4.102 4.1z'/%3E%3Cpath fill='%23fed0ac' d='m7.9 41.1l-6.5 17l4.5 4.5l17-6.5z'/%3E%3Cpath fill='%23333' d='M.3 61.1c-.9 2.4.3 3.5 2.7 2.6l8.2-3.1l-7.7-7.7z'/%3E%3Cpath fill='%23ffdf85' d='m7.89 41.175l27.86-27.86l4.95 4.95l-27.86 27.86z'/%3E%3Cpath fill='%23ff8736' d='m17.904 51.142l27.86-27.86l4.95 4.95l-27.86 27.86z'/%3E%3C/g%3E%3C/svg%3E"), auto;
}

.cursor-eraser {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='16 4 110 120'%3E%3Cpath fill='%23ce6394' d='m55.109 103.074l-11.601 13.678s6.936 4.278 12.141 3.3s10.76-4.176 14.984-9.431s41.028-52.512 44.321-56.861s5.695-10.266 7.497-14.422s1.642-7.69 1.411-9.482s-7.136.173-7.136.173z'/%3E%3Cpath fill='%23ed80ad' d='M25.104 71.02c-1.537 2.343-5.061 15.086-5.902 18.537s-1.389 5.893.971 8.392c2.27 2.405 7.62 7.325 11.344 10.258c5.255 4.145 12 8.555 12 8.555s4.615 2.383 12.102-2.534s14.329-15.642 14.329-15.642z'/%3E%3Cpath fill='%23ff9bb2' d='M25.104 71.02L59.4 99.305c3.684 3.038 7.589 3.052 10.549-.719c14.03-17.871 52.273-65.277 52.994-66.224c.89-1.172 2.051-2.72-1.041-5.643s-11.14-8.911-15.635-12.405c-4.204-3.259-10.44-8.575-13.052-9.614s-7.387-1.14-9.8 1.222s-58.31 65.098-58.31 65.098z'/%3E%3C/svg%3E") 2 13, auto;
}

.cursor-bucket {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 32 32'%3E%3Cg transform='translate(19 12) scale(.82) rotate(-115) translate(-16 -17)'%3E%3Cpath fill='%230074ba' d='m4.47 10l.4 3.105L4.5 15.5l.847 1.317L6.77 27.88C6.85 28.52 7.38 29 8 29h16.14c.62 0 1.15-.48 1.23-1.12L27.548 10L16 8z'/%3E%3Cpath fill='%23d3d3d3' d='m4.872 13.12l.475 3.694a20 20 0 0 0-.765 2.085c-.412 1.4-.44 2.376-.18 2.966c.2.454.7.94 2.207 1.006c1.476.064 2.66-.179 3.666-.65c1.011-.472 1.899-1.2 2.744-2.183c1.478-1.718 2.73-4.082 4.268-6.984q.395-.746.817-1.536a1 1 0 1 1 1.763.944q-.404.758-.794 1.495c-1.525 2.881-2.9 5.482-4.538 7.385c-.979 1.138-2.082 2.07-3.413 2.691c-1.335.625-2.846.912-4.6.836c-1.927-.084-3.325-.782-3.95-2.196c-.564-1.278-.346-2.854.092-4.34c.45-1.53 1.21-3.204 2.01-4.817z'/%3E%3Cpath fill='%2300a6ed' d='m3.356 9.06l-.35-2.35c-.05-.37.24-.71.62-.71h24.75c.38 0 .67.34.62.71l-.36 2.35c-.08.54-.54.94-1.08.94H4.446c-.55 0-1.01-.4-1.09-.94'/%3E%3C/g%3E%3Cpath fill='%23ed4c5c' d='M6 17c-.6 2.4-.2 3.6 0 4.8c2 2.6 3.2 4.4 3.2 5.9a3.6 3.6 0 0 1-7.2 0c0-1.5 1.2-3.3 3.2-5.9c-.6-1.6-.6-3.2.8-4.8z'/%3E%3C/svg%3E") 3 15, auto;
}
</style>
