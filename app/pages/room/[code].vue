<script setup lang="ts">
import type { RoomSettings } from '#shared/utils/protocol'
import { useDrauu } from '@vueuse/integrations/useDrauu'
import { CANVAS_HEIGHT, CANVAS_WIDTH, LANGUAGES, votesNeeded, wordLengths } from '#shared/utils/protocol'

definePageMeta({ middleware: 'nickname' })

const paletteColors = [
  '#FFFFFF', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00ff91', '#00b2ff', '#231fd3', '#a300ba', '#df69a7', '#ffac8e', '#a0522d',
  '#000000', '#505050', '#740b07', '#c23800', '#e8a200', '#004619', '#00785d', '#00569e', '#0e0865', '#550069', '#873554', '#cc774d', '#63300d',
]

const toast = useToast()
const { t } = useI18n()
const route = useRoute()
const gameId = computed(() => String(route.params.code ?? ''))
const sketch = useTemplateRef<SVGSVGElement>('sketch')
const currentBg = ref('#FFFFFF')

const drauu = useDrauu(sketch, {
  brush: {
    // drauu defaults to `stylus`, whose perfect-freehand outline is rebuilt
    // from every point on every move and has no incremental form.
    mode: 'draw',
    color: '#000000',
    // Brush size is in SVG user space, which the viewBox fixes at 1600 wide
    // for every client. These are roughly 2.4x the old CSS-pixel values.
    size: 16,
  },
})
const { undo, redo, clear, canUndo, canRedo, brush } = drauu

const game = useGameSocket(gameId)
const {
  state, chat, word, hint, endsAt, leaderboard, isDrawer, isHost, connected, you,
  hasGuessed, paused, votedPause, customWords,
} = game

const sync = useDrawingSync(drauu, {
  send: game.send,
  onMessage: game.onMessage,
  isDrawer,
})

// The room drops every stroke sent while frozen, so a line cut off by the
// pause never reached the others: republish the whole canvas on resume.
watch(paused, (now, was) => {
  if (was && !now) sync.syncCanvas()
})

const now = useNow({ interval: 250 })
const secondsLeft = computed(() => {
  // Frozen: the room reports what is left instead of when it ends.
  if (paused.value) return Math.ceil((state.value?.remainingMs ?? 0) / 1000)
  if (!endsAt.value) return null
  return Math.max(0, Math.ceil((endsAt.value - now.value.getTime()) / 1000))
})

const phase = computed(() => state.value?.phase ?? 'lobby')
const canDraw = computed(() => isDrawer.value && phase.value === 'drawing' && !paused.value)

/** Voting only makes sense while a countdown runs, or is frozen. */
const canVotePause = computed(() => phase.value === 'drawing' || phase.value === 'intermission')
const pauseTally = computed(() => {
  const connectedCount = state.value?.players.filter(p => p.connected).length ?? 0
  return {
    votes: state.value?.pauseVotes.length ?? 0,
    needed: votesNeeded(connectedCount, paused.value),
  }
})

function togglePause() {
  game.send({ t: 'pause', want: !votedPause.value })
}

/** What the word display shows: the answer to the drawer, blanks to guessers. */
const wordDisplay = computed(() => {
  if (word.value) return word.value
  return hint.value || '—'
})

/** Letters per word, so a long run of blanks doesn't have to be counted. */
const lengths = computed(() => wordLengths(word.value ?? hint.value))

/** How the next game plays, shown to everyone in the lobby. */
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

function saveSettings(settings: RoomSettings) {
  game.send({ t: 'settings', settings })
}

const { copy } = useClipboard()
const { share, isSupported: canShare } = useShare()

/**
 * On a phone, hand the link to the system share sheet so it goes straight to
 * WhatsApp or Messages; elsewhere, copy it. Dismissing the sheet rejects,
 * which is not an error worth reporting.
 */
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

/**
 * Keep the screen awake while a round runs: a phone that locks mid-turn drops
 * its socket, and the drawer's turn with it. Released in the lobby and after
 * the game. VueUse re-acquires it when the page becomes visible again.
 */
const wakeLock = useWakeLock()
watch(phase, (now) => {
  if (!wakeLock.isSupported.value) return
  if (now === 'drawing' || now === 'intermission')
    wakeLock.request('screen').catch(() => {})
  else
    wakeLock.release().catch(() => {})
}, { immediate: true })

const isDark = useDark()
const toggleDark = useToggle(isDark)

/** On a phone the header's controls fold into one menu. */
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
      label: isDark.value ? t('theme.light') : t('theme.dark'),
      icon: isDark.value ? 'i-lucide-sun' : 'i-lucide-moon',
      onSelect: () => toggleDark(),
    },
  ],
])

/**
 * Local edits still need pushing: drauu emits no event for these. Gated on
 * `canDraw` because the room would drop them while paused, and a watcher's
 * shortcut should never wipe their own copy of the drawing.
 */
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
  { key: 'B', mode: 'draw', icon: 'i-lucide-paintbrush', label: 'canvas.tools.draw' },
  { key: 'F', mode: 'bucket', icon: 'i-lucide-paint-bucket', label: 'canvas.tools.bucket' },
  { key: 'E', mode: 'eraseLine', icon: 'i-lucide-eraser', label: 'canvas.tools.eraseLine' },
] as const

const actionTools = computed(() => [
  { key: 'U', icon: 'i-lucide-undo-2', label: 'canvas.tools.undo', color: 'neutral', disabled: !canUndo.value, run: localUndo },
  { key: 'R', icon: 'i-lucide-redo-2', label: 'canvas.tools.redo', color: 'neutral', disabled: !canRedo.value, run: localRedo },
  { key: 'D', icon: 'i-lucide-trash-2', label: 'canvas.tools.clear', color: 'error', disabled: false, run: localClear },
] as const)

/** The last ten seconds turn the timer red; a pause turns it amber. */
const timerTone = computed(() => {
  if (paused.value) return 'warning'
  if (secondsLeft.value !== null && secondsLeft.value <= 10) return 'error'
  return 'calm'
})

const timerFill = computed(() => ({
  warning: 'color-mix(in oklab, var(--ui-color-warning-300) 70%, var(--paper))',
  error: 'color-mix(in oklab, var(--ui-color-error-300) 70%, var(--paper))',
  calm: 'var(--paper)',
})[timerTone.value])

/** Controls sitting on the stage: paper chips, since dark ink would vanish on bordeaux. */
const stageChip = 'bg-(color:--chip) text-(color:--on-chip) hover:bg-(color:--chip)/85'

const roundArgs = computed(() => ({ round: state.value?.round || 0, total: state.value?.totalRounds || 3 }))

/** A new turn re-keys the word card, so it pops in fresh. */
const turnKey = computed(() => `${state.value?.round ?? 0}:${state.value?.drawerId ?? ''}:${phase.value}`)

function selectMode(mode: typeof modeTools[number]['mode']) {
  brush.value.mode = mode
  if (mode === 'eraseLine') brush.value.eraseMode = 'partial'
}

function submitGuess(text: string) {
  // No optimistic echo: the server decides whether this is a guess worth
  // showing, and a correct one is deliberately never broadcast.
  game.send({ t: 'guess', text })
}

useHead({
  title: computed(() => (canDraw.value ? t('title.drawing') : t('title.playing'))),
  // A pull-to-refresh while drawing would drop the socket mid-turn.
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
  <!--
    Phones get a single screen that never scrolls in play: top bar, players,
    word, canvas, then the tools and chat share whatever height is left. From
    `lg` up it's the three-column desktop layout instead.
  -->
  <main
    class="group/room flex flex-col mx-auto w-full max-w-room gap-2 px-safe py-safe h-dvh overflow-y-auto
      overscroll-y-contain lg:gap-5 lg:h-auto lg:min-h-dvh lg:overflow-visible">
    <header class="flex items-center gap-x-3 lg:flex-wrap lg:gap-x-5 lg:gap-y-3">
      <NuxtLink to="/" class="press inline-flex items-center min-h-11 -rotate-3 rounded-sketch">
        <h1 class="font-display font-extrabold text-2xl lg:text-3xl text-(--on-stage)">
          SkizzOne
        </h1>
      </NuxtLink>
      <p class="font-display font-bold text-lg text-(--on-stage)">
        <span class="lg:hidden">{{ $t('header.roundShort', roundArgs) }}</span>
        <span class="max-lg:hidden">{{ $t('header.round', roundArgs) }}</span>
      </p>

      <div class="ms-auto flex items-center gap-2">
        <!-- Only news when it breaks. `state` stays null until the first welcome,
             so the moment before the socket opens doesn't flash as offline. -->
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
          <ThemeSwitch />
        </div>

        <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
          <UButton
            color="neutral" variant="solid" square icon="i-lucide-ellipsis" class="lg:hidden size-11 justify-center"
            :class="[votedPause ? '' : stageChip]" :aria-label="$t('header.menu')" />
        </UDropdownMenu>
      </div>
    </header>

    <!-- Hidden while typing, so the keyboard doesn't push the canvas off screen. -->
    <PlayerStrip
      :players="leaderboard" :drawerId="state?.drawerId" :you="you"
      class="lg:hidden group-has-[input:focus]/room:hidden" />

    <SketchFrame
      v-if="phase === 'lobby'" :radius="20" :strokeWidth="3"
      class="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 lg:gap-y-4 lg:px-6 lg:py-5">
      <SketchFrame
        shape="circle" fill="var(--color-tangerine-200)"
        class="max-sm:hidden size-14 grid place-content-center shrink-0 text-(--ink-fixed)">
        <UIcon name="i-lucide-users" class="size-7" />
      </SketchFrame>
      <div class="grow basis-64">
        <h2 class="font-display font-bold text-xl lg:text-2xl">
          {{ $t('lobby.title') }}
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
        <GameSettings :state="state" :customWords="customWords" @save="saveSettings" />
        <UButton
          color="secondary" size="xl" icon="i-lucide-rocket" class="text-lg min-h-11"
          :label="$t('lobby.start')" @click="game.send({ t: 'start' })" />
      </div>
    </SketchFrame>

    <section
      class="flex flex-col flex-1 min-h-0 w-full gap-2
        lg:grid lg:flex-none lg:gap-5 lg:items-start
        lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_22rem]
        2xl:grid-cols-[15rem_minmax(0,1fr)_24rem]">
      <PlayerList
        :players="leaderboard" :drawerId="state?.drawerId" :you="you"
        class="max-lg:hidden lg:order-1 lg:row-span-2 xl:row-span-1" />

      <div class="flex flex-col gap-2 shrink-0 lg:gap-4 lg:order-2">
        <div v-if="phase !== 'lobby'" class="flex items-center justify-center gap-3 lg:gap-4">
          <SketchFrame
            :key="turnKey" :radius="18" :strokeWidth="3"
            class="pop-in flex items-center gap-3 px-4 py-1.5 min-h-12 min-w-0 lg:px-6 lg:py-2 lg:min-h-16">
            <p class="font-bouncy font-bold text-2xl tracking-widest break-words min-w-0 sm:text-3xl sm:tracking-word">
              <!-- Blanks read aloud are just "underscore" over and over. -->
              <span aria-hidden="true">{{ wordDisplay }}</span>
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
            class="size-14 shrink-0 grid place-content-center lg:size-18"
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

        <!-- As wide as the column allows, but short enough to keep the toolbar on screen. -->
        <SketchFrame
          :radius="16" :strokeWidth="3.5" :roughness="1.4"
          class="p-1.5 w-full mx-auto lg:p-2.5 lg:max-w-[calc((100dvh-21rem)*16/9)]">
          <div class="relative aspect-video rounded-sm overflow-hidden" :style="{ backgroundColor: currentBg }">
            <div
              v-if="paused"
              class="absolute inset-0 z-10 grid place-content-center justify-items-center gap-2
                bg-default/80 backdrop-blur-sm">
              <UIcon name="i-lucide-pause" class="size-12 text-warning" />
              <p class="font-display font-bold text-2xl">
                {{ $t('pause.overlay') }}
              </p>
            </div>
            <!--
              The viewBox is what keeps everyone in sync: drauu maps pointers
              through getScreenCTM().inverse(), so a phone and a desktop both
              produce coordinates in this same fixed 1600x900 space.
              `touch-none` keeps a finger drawing instead of scrolling the page.
            -->
            <svg
              ref="sketch"
              class="size-full"
              :class="canDraw ? 'cursor-pencil touch-none' : 'pointer-events-none'"
              :viewBox="`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`"
              preserveAspectRatio="xMidYMid meet" />
          </div>
        </SketchFrame>

        <SketchFrame
          v-if="canDraw" :radius="16" :strokeWidth="2.5"
          class="flex flex-wrap items-center justify-between gap-2 p-1.5 lg:gap-4 lg:p-3">
          <button
            type="button"
            class="max-lg:hidden press size-11 shrink-0 rounded-full ring-2 ring-(--ink) cursor-pointer
              bg-linear-45 from-black from-50% to-50% to-white"
            :aria-label="$t('canvas.background')"
            @click="currentBg = currentBg === '#FFFFFF' ? '#000000' : '#FFFFFF'" />
          <div class="max-lg:hidden grid grid-cols-13 gap-1">
            <button
              v-for="(color, index) in paletteColors" :key="index" type="button"
              class="press size-6 rounded-full cursor-pointer ring-1 ring-(--ink)/30 transition-shadow"
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
                <button
                  v-for="(color, index) in paletteColors" :key="index" type="button"
                  class="press size-11 rounded-full cursor-pointer ring-1 ring-(--ink)/30 transition-shadow"
                  :class="{ 'ring-4 ring-(--ink)': brush.color === color }"
                  :style="{ backgroundColor: color }" :aria-label="$t('canvas.color', { color })"
                  :aria-pressed="brush.color === color" @click="brush.color = color" />
              </div>
              <div class="flex items-center gap-4">
                <USlider
                  v-model="brush.size" size="lg" :min="8" :max="48" class="grow"
                  :aria-label="$t('canvas.brushSize')" />
                <button
                  type="button"
                  class="press size-11 shrink-0 rounded-full ring-2 ring-(--ink) cursor-pointer
                    bg-linear-45 from-black from-50% to-50% to-white"
                  :aria-label="$t('canvas.background')"
                  @click="currentBg = currentBg === '#FFFFFF' ? '#000000' : '#FFFFFF'" />
              </div>
            </template>
          </UDrawer>

          <div class="flex gap-1.5 lg:gap-2">
            <UTooltip v-for="tool in modeTools" :key="tool.key" :text="$t(tool.label)" :kbds="[tool.key]">
              <UButton
                size="xl" :variant="brush.mode === tool.mode ? 'solid' : 'soft'"
                :color="brush.mode === tool.mode ? 'primary' : 'neutral'"
                class="relative size-11 grid place-content-center" square
                :aria-label="$t(tool.label)" :aria-pressed="brush.mode === tool.mode" @click="selectMode(tool.mode)">
                <UIcon :name="tool.icon" class="size-5" />
                <span
                  class="max-lg:hidden absolute top-0.5 start-1.5 text-2xs font-bold opacity-70"
                  aria-hidden="true">
                  {{ tool.key }}
                </span>
              </UButton>
            </UTooltip>
          </div>
          <div class="flex gap-1.5 lg:gap-2">
            <UTooltip v-for="tool in actionTools" :key="tool.key" :text="$t(tool.label)" :kbds="[tool.key]">
              <UButton
                size="xl" variant="soft" :color="tool.color" class="relative size-11 grid place-content-center" square
                :aria-label="$t(tool.label)" :disabled="tool.disabled" @click="tool.run()">
                <UIcon :name="tool.icon" class="size-5" />
                <span
                  class="max-lg:hidden absolute top-0.5 start-1.5 text-2xs font-bold opacity-70"
                  aria-hidden="true">
                  {{ tool.key }}
                </span>
              </UButton>
            </UTooltip>
          </div>
        </SketchFrame>
      </div>

      <!-- Phones: the chat fills what's left. lg: a fixed-height panel under the canvas.
           xl: a third column stretched to the canvas' height. Never sized by its own
           messages (`contain: size`). -->
      <ChatPanel
        class="flex-1 min-h-24 lg:order-3 lg:flex-none lg:col-start-2 lg:h-80 lg:contain-size
          xl:col-start-3 xl:row-start-1 xl:h-auto xl:self-stretch"
        :entries="chat" :isDrawer="isDrawer" :hasGuessed="hasGuessed"
        :drawing="phase === 'drawing'" :paused="paused" @guess="submitGuess" />
    </section>
  </main>
</template>

<style scoped>
.cursor-pencil {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 64 64'%3E%3Cg transform='rotate(90 32 32)'%3E%3Cpath fill='%23ffce31' d='M7.934 41.132L39.828 9.246l14.918 14.922l-31.895 31.886z'/%3E%3Cpath fill='%23ed4c5c' d='m61.3 4.6l-1.9-1.9C55.8-.9 50-.9 46.3 2.7l-6.5 6.5l15 15l6.5-6.5c3.6-3.6 3.6-9.5 0-13.1'/%3E%3Cpath fill='%2393a2aa' d='m35.782 13.31l4.1-4.102l14.92 14.92l-4.1 4.101z'/%3E%3Cpath fill='%23c7d3d8' d='m37.338 14.865l4.1-4.101l11.739 11.738l-4.102 4.1z'/%3E%3Cpath fill='%23fed0ac' d='m7.9 41.1l-6.5 17l4.5 4.5l17-6.5z'/%3E%3Cpath fill='%23333' d='M.3 61.1c-.9 2.4.3 3.5 2.7 2.6l8.2-3.1l-7.7-7.7z'/%3E%3Cpath fill='%23ffdf85' d='m7.89 41.175l27.86-27.86l4.95 4.95l-27.86 27.86z'/%3E%3Cpath fill='%23ff8736' d='m17.904 51.142l27.86-27.86l4.95 4.95l-27.86 27.86z'/%3E%3C/g%3E%3C/svg%3E"), auto;
}
</style>
