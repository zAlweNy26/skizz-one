<script setup lang="ts">
import { useDrauu } from '@vueuse/integrations/useDrauu'
import { CANVAS_HEIGHT, CANVAS_WIDTH, kickVotesNeeded, MIN_PLAYERS_TO_VOTE_KICK, NO_RULES } from '#shared/utils/protocol'

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

const game = useGameSocket(gameId)
const {
  state, chat, word, hint, endsAt, leaderboard, isDrawer, isHost, connected, you,
  hasGuessed, paused, customWords, choices, canReroll, kicked, full, outdated,
} = game

/** Why this tab can't be in the room, as the i18n group that explains it. */
const turnedAway = computed(() => {
  if (kicked.value) return 'kicked'
  if (outdated.value) return 'outdated'
  return full.value ? 'roomFull' : null
})

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
const betweenGames = computed(() => phase.value === 'lobby' || phase.value === 'finished')
const drawerId = computed(() => state.value?.drawerId)
const kickVotes = computed(() => state.value?.kickVotes)
const reactions = computed(() => (phase.value === 'drawing' ? state.value?.reactions : undefined))
const lobbyCardClass = computed(() => (phase.value === 'lobby'
  ? ['phone-landscape:canvas-landscape phone-landscape:col-start-2 phone-landscape:row-span-full',
      'phone-landscape:content-center']
  : 'phone-landscape:col-start-3 phone-landscape:row-start-2'))
const canDraw = computed(() => isDrawer.value && phase.value === 'drawing' && !paused.value)
const rules = computed(() => state.value?.rules ?? NO_RULES)
const tools = useDrawingTools(drauu, sync, canDraw, rules)
const { brush } = tools
const sketchClass = computed(() => (canDraw.value ? [tools.cursor.value, 'touch-none'] : 'pointer-events-none'))

useEventListener(sketch, 'touchmove', (event: TouchEvent) => {
  if (canDraw.value) event.preventDefault()
}, { passive: false })

const hasDrawing = ref(false)
watch(phase, (now) => {
  hasDrawing.value = now === 'intermission' && Boolean(sketch.value?.childElementCount)
})

function downloadDrawing() {
  const blob = new Blob([drawingSvg(sketch.value?.innerHTML ?? '')], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = drawingFileName(hint.value)
  link.click()
  URL.revokeObjectURL(url)
}

const drawerName = computed(() => state.value?.players.find(p => p.id === state.value?.drawerId)?.name ?? '')

const activeCount = computed(() => state.value?.players.filter(p => p.connected && !p.away).length ?? 0)

/** Unset while the room is too small to vote, which hides the player menu. */
const kickRule = computed(() => (activeCount.value < MIN_PLAYERS_TO_VOTE_KICK
  ? undefined
  : { needed: kickVotesNeeded(activeCount.value) }))

function voteKick(target: string, want: boolean) {
  game.send({ t: 'kick', target, want })
}

const qrOpen = ref(false)

const wakeLock = useWakeLock()
watch(phase, (now) => {
  if (!wakeLock.isSupported.value) return
  if (now === 'choosing' || now === 'drawing' || now === 'intermission')
    wakeLock.request('screen').catch(() => {})
  else
    wakeLock.release().catch(() => {})
}, { immediate: true })

useHead({
  title: computed(() => (canDraw.value ? t('title.drawing') : t('title.playing'))),
  htmlAttrs: { class: 'overscroll-y-none' },
})
</script>

<template>
  <RoomTurnedAway v-if="turnedAway" :reason="turnedAway" />

  <RoomLoading v-else-if="!state" />

  <main
    v-if="!turnedAway"
    :inert="!state"
    :class="{ invisible: !state }"
    class="flex flex-col mx-auto w-full max-w-room gap-2 px-safe py-safe h-dvh overflow-y-auto
      overscroll-y-contain lg:gap-5 lg:h-auto lg:min-h-dvh lg:overflow-visible
      phone-landscape:grid phone-landscape:grid-cols-[auto_auto_minmax(0,1fr)]
      phone-landscape:grid-rows-[auto_auto_minmax(0,1fr)_auto]">
    <RoomHeader
      v-model:muted="muted" :state="state" :you="you" :connected="connected" :gameId="gameId"
      class="phone-landscape:col-start-3 phone-landscape:row-start-1"
      @pause="game.send({ t: 'pause', want: $event })" @openQr="qrOpen = true" />

    <PlayerStrip
      :players="leaderboard" :drawerId="drawerId" :you="you" :kickVotes="kickVotes" :kick="kickRule"
      class="lg:hidden phone-landscape:col-start-3 phone-landscape:row-start-4"
      @kick="voteKick" />

    <RoomLobbyCard
      v-if="state && betweenGames"
      :state="state" :isHost="isHost" :customWords="customWords" :class="lobbyCardClass"
      @settings="game.send({ t: 'settings', settings: $event })" @start="game.send({ t: 'start' })"
      @openQr="qrOpen = true" />

    <section
      class="flex flex-col flex-1 min-h-0 w-full gap-2
        lg:grid lg:flex-none lg:gap-5 lg:items-start
        lg:grid-cols-[minmax(min-content,1fr)_minmax(0,calc((100dvh-21rem)*4/3))]
        xl:grid-cols-[minmax(min-content,1fr)_minmax(0,calc((100dvh-21rem)*4/3))_22rem]
        2xl:grid-cols-[minmax(min-content,1fr)_minmax(0,calc((100dvh-21rem)*4/3))_24rem] phone-landscape:contents">
      <PlayerList
        :players="leaderboard" :drawerId="drawerId" :you="you" :kickVotes="kickVotes" :kick="kickRule"
        class="max-lg:hidden lg:order-1 lg:row-span-2 xl:row-span-1"
        @kick="voteKick" />

      <div class="flex flex-col gap-2 shrink-0 lg:gap-4 lg:order-2 phone-landscape:contents">
        <WordCard
          v-if="!betweenGames"
          :state="state" :word="word" :hint="hint" :secondsLeft="secondsLeft"
          class="phone-landscape:col-start-3 phone-landscape:row-start-2" />

        <SketchFrame
          :radius="16" :strokeWidth="3.5" :roughness="1.4"
          class="p-1.5 w-full mx-auto lg:p-2.5 lg:max-w-[calc((100dvh-21rem)*4/3)]
            phone-landscape:canvas-landscape phone-landscape:col-start-2 phone-landscape:row-span-full
            phone-landscape:self-start"
          :class="{ 'phone-landscape:hidden': phase === 'lobby' }">
          <div class="relative aspect-4/3 rounded-sm overflow-hidden bg-white">
            <CanvasOverlay
              :phase="phase" :paused="paused" :isDrawer="isDrawer" :choices="choices" :canReroll="canReroll"
              :drawerName="drawerName" :players="leaderboard" :you="you" :awards="state?.awards ?? []"
              @choose="game.send({ t: 'choose', index: $event })" @reroll="game.send({ t: 'reroll' })" />
            <DrawingReactions
              v-if="reactions" :reactions="reactions" :isDrawer="isDrawer" :you="you"
              @react="game.send({ t: 'react', reaction: $event })" />
            <UButton
              v-if="hasDrawing" color="neutral" variant="outline" size="lg" icon="i-lucide-download"
              class="pop-in absolute bottom-1 end-1 z-5 lg:bottom-2 lg:end-2"
              :label="$t('canvas.download')" @click="downloadDrawing()" />
            <svg
              ref="sketch"
              class="size-full"
              :class="sketchClass"
              :viewBox="`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`"
              preserveAspectRatio="xMidYMid meet" />
          </div>
        </SketchFrame>

        <DrawingToolbar
          v-if="canDraw" v-model:brush="brush" :colors="tools.colors.value" :modes="tools.modes.value"
          :actions="tools.actions.value" :limited="rules.colors.length > 0"
          class="phone-landscape:col-start-1 phone-landscape:row-span-full phone-landscape:self-center"
          @selectMode="tools.selectMode" />
      </div>

      <ChatPanel
        class="flex-1 min-h-36 lg:order-3 lg:flex-none lg:col-start-2 lg:h-80 lg:contain-size
          xl:col-start-3 xl:row-start-1 xl:h-auto xl:self-stretch
          phone-landscape:col-start-3 phone-landscape:row-start-3"
        :entries="chat" :isDrawer="isDrawer" :hasGuessed="hasGuessed"
        :drawing="phase === 'drawing'" :paused="paused" @guess="game.send({ t: 'guess', text: $event })" />
    </section>
    <RoomQrCode v-model:open="qrOpen" :code="gameId" />
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
