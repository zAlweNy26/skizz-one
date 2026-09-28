<script setup lang="ts">
import { useDrauu } from '@vueuse/integrations/useDrauu'
import { randomUUID } from 'uncrypto'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '#shared/utils/protocol'

const paletteColors = [
  '#FFFFFF', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00ff91', '#00b2ff', '#231fd3', '#a300ba', '#df69a7', '#ffac8e', '#a0522d',
  '#000000', '#505050', '#740b07', '#c23800', '#e8a200', '#004619', '#00785d', '#00569e', '#0e0865', '#550069', '#873554', '#cc774d', '#63300d',
]

const toast = useToast()
const gameId = useRouteQuery('code', '', { transform: String })
const sketch = useTemplateRef<SVGSVGElement>('sketch')
const currentBg = ref('#FFFFFF')

if (!gameId.value) gameId.value = randomUUID().split('-')[0]!

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
const { state, chat, word, hint, endsAt, leaderboard, isDrawer, isHost, connected, you } = game

const sync = useDrawingSync(drauu, {
  send: game.send,
  onMessage: game.onMessage,
  isDrawer,
})

const now = useNow({ interval: 250 })
const secondsLeft = computed(() => {
  if (!endsAt.value) return null
  return Math.max(0, Math.ceil((endsAt.value - now.value.getTime()) / 1000))
})

const phase = computed(() => state.value?.phase ?? 'lobby')
const canDraw = computed(() => isDrawer.value && phase.value === 'drawing')

/** What the word display shows: the answer to the drawer, blanks to guessers. */
const wordDisplay = computed(() => {
  if (word.value) return word.value
  return hint.value || '—'
})

const { copy } = useClipboard()

function shareGame() {
  copy(window.location.href)
  toast.add({
    title: 'Game link copied to clipboard',
    description: 'Share this link with your friends to join the game!',
    icon: 'i-lucide-link',
  })
}

/** Local edits still need pushing: drauu emits no event for these. */
function localUndo() {
  if (!canUndo.value) return
  undo()
  sync.syncCanvas()
}

function localRedo() {
  if (!canRedo.value) return
  redo()
  sync.syncCanvas()
}

function localClear() {
  clear()
  sync.syncCanvas()
}

function submitGuess(event: KeyboardEvent) {
  const input = event.target as HTMLInputElement
  const text = input.value.trim()
  if (!text) return
  // No optimistic echo: the server decides whether this is a guess worth
  // showing, and a correct one is deliberately never broadcast.
  game.send({ t: 'guess', text })
  input.value = ''
}

useHead({
  title: computed(() => (canDraw.value ? '✏️ Drawing' : '🎮 Playing')),
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
  <main class="flex flex-col items-center justify-center mx-auto gap-4 p-2 max-w-7xl">
    <h1 class="font-bold text-2xl text-primary">
      SkizzOne
    </h1>
    <ThemeSwitch />
    <UCard variant="soft" class="w-full" :ui="{ body: 'flex flex-wrap justify-between items-center gap-2' }">
      <p class="font-bold">
        Round {{ state?.round || 0 }} of {{ state?.totalRounds || 3 }}
      </p>
      <p class="font-mono font-bold text-lg tracking-[0.3em]">
        {{ wordDisplay }}
      </p>
      <UBadge v-if="secondsLeft !== null" :color="secondsLeft <= 10 ? 'error' : 'neutral'" variant="soft" size="lg">
        {{ secondsLeft }}s
      </UBadge>
      <UBadge :color="connected ? 'success' : 'error'" variant="soft" :label="connected ? 'Connected' : 'Offline'" />
      <p class="text-sm font-semibold">
        Game ID: {{ gameId }}
      </p>
      <UButton variant="soft" size="xl" icon="i-lucide-share-2" @click="shareGame()" />
    </UCard>

    <UAlert
      v-if="phase === 'lobby'"
      icon="i-lucide-users"
      title="Waiting to start"
      :description="isHost ? 'You are the host. Start when everyone has joined.' : 'Waiting for the host to start the game.'"
      class="w-full"
      :actions="isHost ? [{ label: 'Start game', onClick: () => game.send({ t: 'start' }) }] : []" />

    <section class="grid grid-cols-1 lg:grid-cols-[minmax(min-content,1fr)_minmax(min-content,42rem)_minmax(16rem,1fr)] w-full gap-4">
      <aside v-auto-animate class="flex flex-col gap-2">
        <div
          v-for="(player, index) in leaderboard" :key="player.id"
          class="inline-flex items-center h-fit w-full gap-2 rounded-lg p-2 bg-elevated"
          :class="{ 'opacity-50': !player.connected }">
          <p class="font-bold">
            #{{ index + 1 }}
          </p>
          <UAvatar :src="`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.name)}`" size="xl" />
          <div>
            <p class="text-sm font-semibold">
              {{ player.name }}
            </p>
            <p class="text-xs font-medium">
              {{ player.points }} points
            </p>
          </div>
          <UIcon v-if="state?.drawerId === player.id" name="i-lucide-paintbrush" class="ms-auto size-4" />
          <UIcon v-else-if="player.guessed" name="i-lucide-check" class="ms-auto size-4 text-success" />
          <UBadge v-if="you === player.id" class="ms-auto" size="sm" variant="soft" label="You" />
        </div>
      </aside>

      <div class="flex flex-col gap-2">
        <div class="aspect-video rounded-md shadow-lg overflow-hidden" :style="{ backgroundColor: currentBg }">
          <!--
            The viewBox is what keeps everyone in sync: drauu maps pointers
            through getScreenCTM().inverse(), so a phone and a desktop both
            produce coordinates in this same fixed 1600x900 space.
          -->
          <svg
            ref="sketch"
            class="size-full"
            :class="canDraw ? 'cursor-pencil' : 'pointer-events-none'"
            :viewBox="`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`"
            preserveAspectRatio="xMidYMid meet" />
        </div>

        <div v-if="canDraw" class="flex flex-wrap justify-between gap-4">
          <div
            class="size-12 rounded-md bg-linear-45 from-black from-50% to-50% to-white cursor-pointer"
            @click="currentBg = currentBg === '#FFFFFF' ? '#000000' : '#FFFFFF'" />
          <div class="grid grid-cols-13 size-fit rounded-md overflow-hidden">
            <div
              v-for="(color, index) in paletteColors" :key="index"
              class="size-6 cursor-pointer" :style="{ backgroundColor: color }" @click="brush.color = color" />
          </div>
          <UPopover>
            <UButton variant="soft" size="xl" color="neutral" square class="size-12 grid place-content-center">
              <div class="rounded-full transition-transform size-4" :style="{ backgroundColor: brush.color, transform: `scale(${brush.size * 0.04})` }" />
            </UButton>
            <template #content>
              <div class="w-48">
                <USlider v-model="brush.size" size="sm" :min="8" :max="48" />
              </div>
            </template>
          </UPopover>
          <div class="flex flex-wrap gap-2">
            <UChip inset position="top-left" size="3xl" text="B" :ui="{ base: 'bg-trasparent ring-0 top-1 left-1 text-default' }">
              <UButton size="xl" variant="soft" :color="brush.mode === 'draw' ? 'primary' : 'neutral'"
                       class="size-12 grid place-content-center" square icon="i-lucide-paintbrush" @click="brush.mode = 'draw'" />
            </UChip>
            <UChip inset position="top-left" size="3xl" text="F" :ui="{ base: 'bg-trasparent ring-0 top-1 left-1 text-default' }">
              <UButton size="xl" variant="soft" :color="brush.mode === 'bucket' ? 'primary' : 'neutral'"
                       class="size-12 grid place-content-center" square icon="i-lucide-paint-bucket" @click="brush.mode = 'bucket'" />
            </UChip>
            <UChip inset position="top-left" size="3xl" text="E" :ui="{ base: 'bg-trasparent ring-0 top-1 left-1 text-default' }">
              <UButton size="xl" variant="soft" :color="brush.mode === 'eraseLine' ? 'primary' : 'neutral'"
                       class="size-12 grid place-content-center" square icon="i-lucide-eraser"
                       @click="brush.mode = 'eraseLine'; brush.eraseMode = 'partial'" />
            </UChip>
          </div>
          <div class="flex flex-wrap gap-2">
            <UChip inset position="top-left" size="3xl" text="U" :ui="{ base: 'bg-trasparent ring-0 top-1 left-1 text-default' }">
              <UButton size="xl" variant="soft" color="neutral" class="size-12 grid place-content-center" square icon="i-lucide-undo-2"
                       :disabled="!canUndo" @click="localUndo()" />
            </UChip>
            <UChip inset position="top-left" size="3xl" text="R" :ui="{ base: 'bg-trasparent ring-0 top-1 left-1 text-default' }">
              <UButton size="xl" variant="soft" color="neutral" class="size-12 grid place-content-center" square icon="i-lucide-redo-2"
                       :disabled="!canRedo" @click="localRedo()" />
            </UChip>
            <UChip inset position="top-left" size="3xl" text="D" :ui="{ base: 'bg-trasparent ring-0 top-1 left-1 text-default' }">
              <UButton size="xl" variant="soft" color="error" class="size-12 grid place-content-center" square icon="i-lucide-trash-2"
                       @click="localClear()" />
            </UChip>
          </div>
        </div>
        <p v-else class="text-sm text-muted text-center py-2">
          {{ state?.drawerId ? 'Guess what is being drawn!' : 'Waiting for a drawer…' }}
        </p>
      </div>

      <aside class="overflow-hidden flex flex-col gap-2">
        <div class="overflow-y-auto rounded-md grow bg-elevated h-112 flex flex-col gap-1 text-sm shadow-lg">
          <div v-for="(entry, index) in chat" :key="index" class="flex items-center gap-2 p-1 odd:bg-accented">
            <UBadge
              v-if="!entry.system"
              :color="entry.private ? 'success' : 'neutral'" class="font-semibold"
              :label="entry.sender" size="sm" />
            <span :class="{ 'font-semibold': entry.system, 'text-success': entry.level === 'success', 'text-warning': entry.level === 'warning' }">
              {{ entry.text }}
            </span>
          </div>
        </div>
        <UInput
          class="w-full mt-auto sticky bottom-0"
          :placeholder="isDrawer ? 'You are drawing — no guessing!' : 'Type your guess here...'"
          :disabled="isDrawer"
          @keyup.enter="submitGuess" />
      </aside>
    </section>
  </main>
</template>

<style scoped>
.cursor-pencil {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 64 64'%3E%3Cg transform='rotate(90 32 32)'%3E%3Cpath fill='%23ffce31' d='M7.934 41.132L39.828 9.246l14.918 14.922l-31.895 31.886z'/%3E%3Cpath fill='%23ed4c5c' d='m61.3 4.6l-1.9-1.9C55.8-.9 50-.9 46.3 2.7l-6.5 6.5l15 15l6.5-6.5c3.6-3.6 3.6-9.5 0-13.1'/%3E%3Cpath fill='%2393a2aa' d='m35.782 13.31l4.1-4.102l14.92 14.92l-4.1 4.101z'/%3E%3Cpath fill='%23c7d3d8' d='m37.338 14.865l4.1-4.101l11.739 11.738l-4.102 4.1z'/%3E%3Cpath fill='%23fed0ac' d='m7.9 41.1l-6.5 17l4.5 4.5l17-6.5z'/%3E%3Cpath fill='%23333' d='M.3 61.1c-.9 2.4.3 3.5 2.7 2.6l8.2-3.1l-7.7-7.7z'/%3E%3Cpath fill='%23ffdf85' d='m7.89 41.175l27.86-27.86l4.95 4.95l-27.86 27.86z'/%3E%3Cpath fill='%23ff8736' d='m17.904 51.142l27.86-27.86l4.95 4.95l-27.86 27.86z'/%3E%3C/g%3E%3C/svg%3E"), auto;
}
</style>
