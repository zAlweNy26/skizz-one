<script setup lang="ts">
import type { GameLog, GameState } from '#shared/utils/interfaces'
import { useDrauu } from '@vueuse/integrations/useDrauu'
import { pascalCase } from 'scule'
import { randomUUID } from 'uncrypto'
import { adjectives, animals, colors, uniqueNamesGenerator } from 'unique-names-generator'

const paletteColors = [
  '#FFFFFF', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00ff91', '#00b2ff', '#231fd3', '#a300ba', '#df69a7', '#ffac8e', '#a0522d',
  '#000000', '#505050', '#740b07', '#c23800', '#e8a200', '#004619', '#00785d', '#00569e', '#0e0865', '#550069', '#873554', '#cc774d', '#63300d',
]

const nickname = useLocalStorage('nickname', pascalCase(uniqueNamesGenerator({
  dictionaries: [adjectives, colors, animals],
  separator: '-',
  length: 2,
})))

const toast = useToast()
const gameId = useRouteQuery('code', '', { transform: String })
const sketch = useTemplateRef<SVGSVGElement>('sketch')
const currentBg = ref('#FFFFFF'), gameState = ref<GameState | null>(null)
const logs = ref<GameLog[]>([])

const { undo, redo, clear, canUndo, canRedo, brush } = useDrauu(sketch)

const { copy } = useClipboard()

function shareGame() {
  copy(window.location.href)
  toast.add({
    title: 'Game link copied to clipboard',
    description: 'Share this link with your friends to join the game!',
    icon: 'i-lucide-link',
  })
}

const protocol = computed(() => location.protocol.includes('s') ? 's' : '')

const wsUrl = computed(() => `ws${protocol.value}://${location.host}/ws?id=${gameId.value}&name=${nickname.value}`)

const { status, data: wsData, send, open, close } = useWebSocket(wsUrl, {
  heartbeat: {
    interval: 5000,
    pongTimeout: 5000,
    message: 'ping',
    responseMessage: 'pong',
  },
  onConnected() {
    console.warn('WebSocket connected')
  },
  onDisconnected(ws, e) {
    console.warn('WebSocket disconnected:', e)
    // navigateTo({ path: '/', query: {} }, { redirectCode: 302 })
  },
  onError(_ws, event) {
    console.error('WebSocket error:', event)
  },
})

function assertLog(data: Record<string, any>): data is GameLog {
  return 'type' in data && 'message' in data && 'sender' in data
    && typeof data.type === 'string' && typeof data.message === 'string' && typeof data.sender === 'string'
}

function readBlobAsJson<T>(blob: Blob) {
  return new Promise<T>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        if (!reader.result) {
          reject(new Error('No result from FileReader'))
          return
        }
        if (typeof reader.result !== 'string') {
          reject(new Error('FileReader result is not a string'))
          return
        }
        const json = JSON.parse(reader.result)
        resolve(json)
      }
      catch (e) {
        reject(e)
      }
    }
    reader.onerror = reject
    reader.readAsText(blob)
  })
}

watch(wsData, async (data) => {
  if (!data) return
  let content: GameState | GameLog

  try {
    if (data instanceof Blob) content = await readBlobAsJson<GameState | GameLog>(data)
    else if (data instanceof ArrayBuffer) {
      const decoder = new TextDecoder('utf-8')
      content = JSON.parse(decoder.decode(data))
    }
    else content = JSON.parse(data)
  }
  catch (error) {
    console.error('Error parsing WebSocket data:', error)
    return
  }

  if (assertLog(content)) {
    logs.value.push(content)
    return
  }

  gameState.value = content
})

const leaderboard = computed(() => gameState.value?.clients.toSorted((a, b) => b.points - a.points) ?? [])

onMounted(() => {
  if (!gameId.value) gameId.value = randomUUID().split('-')[0]!
})

useHead({
  title: computed(() => `🎮 Playing`),
})

defineShortcuts({
  b: () => {
    brush.value.mode = 'draw'
  },
  e: () => {
    brush.value.mode = 'eraseLine'
  },
  f: () => {
    brush.value.mode = 'rectangle'
  },
  u: () => {
    if (canUndo.value) undo()
  },
  r: () => {
    if (canRedo.value) redo()
  },
  d: () => {
    clear()
  },
})
</script>

<template>
  <main class="flex flex-col items-center justify-center mx-auto gap-4 p-2 max-w-7xl">
    <h1 class="font-bold text-2xl text-(--ui-primary)">
      SkizzOne
    </h1>
    <ThemeSwitch />
    <UCard variant="soft" class="w-full" :ui="{ body: 'flex justify-between items-center gap-2' }">
      <p class="font-bold">
        Round {{ gameState?.round || 1 }} of {{ gameState?.totalRounds || 1 }}
      </p>
      <p class="text-sm font-semibold">
        Game ID: {{ gameId }}
      </p>
      <UButton variant="soft" size="xl" icon="i-lucide-share-2" @click="shareGame()" />
    </UCard>
    <section class="grid grid-cols-1 lg:grid-cols-[minmax(min-content,1fr)_minmax(min-content,42rem)_minmax(16rem,1fr)] w-full gap-4">
      <aside v-auto-animate class="flex flex-col gap-2">
        <div v-for="(player, index) in leaderboard" :key="index" class="inline-flex items-center h-fit w-full gap-2 rounded-lg p-2 bg-elevated">
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
          <UBadge v-if="nickname === player.name" class="ms-auto" size="sm" variant="soft" label="You" />
        </div>
      </aside>
      <div class="flex flex-col gap-2">
        <div class="aspect-video rounded-md shadow-lg" :style="{ backgroundColor: currentBg }">
          <!-- eslint-disable-next-line vue/html-self-closing -->
          <svg ref="sketch" class="size-full"></svg>
        </div>
        <div class="flex flex-wrap justify-between gap-4">
          <div
            class="size-12 rounded-md bg-linear-45 from-black from-50% to-50% to-white"
            @click="currentBg = currentBg === '#FFFFFF' ? '#000000' : '#FFFFFF'" />
          <div class="grid grid-cols-13 size-fit rounded-md overflow-hidden">
            <div
              v-for="(color, index) in paletteColors" :key="index"
              class="size-6" :style="{ backgroundColor: color }" @click="brush.color = color" />
          </div>
          <UPopover>
            <UButton variant="soft" size="xl" color="neutral" square class="size-12 grid place-content-center">
              <div class="rounded-full transition-transform size-4" :style="{ backgroundColor: brush.color, transform: `scale(${brush.size * 0.2})` }" />
            </UButton>
            <template #content>
              <div class="w-48">
                <USlider v-model="brush.size" size="sm" :min="1" :max="10" />
              </div>
            </template>
          </UPopover>
          <div class="flex flex-wrap gap-2">
            <UChip inset position="top-left" size="3xl" text="B" :ui="{ base: 'bg-trasparent ring-0 top-1 left-1 text-(--ui-text)' }">
              <UButton size="xl" variant="soft" :color="brush.mode === 'draw' ? 'primary' : 'neutral'"
                       class="size-12 grid place-content-center" square icon="i-lucide-paintbrush" @click="brush.mode = 'draw'" />
            </UChip>
            <UChip inset position="top-left" size="3xl" text="F" :ui="{ base: 'bg-trasparent ring-0 top-1 left-1 text-(--ui-text)' }">
              <UButton size="xl" variant="soft" disabled :color="brush.mode === 'rectangle' ? 'primary' : 'neutral'"
                       class="size-12 grid place-content-center" square icon="i-lucide-paint-bucket" @click="brush.mode = 'rectangle'" />
            </UChip>
            <UChip inset position="top-left" size="3xl" text="E" :ui="{ base: 'bg-trasparent ring-0 top-1 left-1 text-(--ui-text)' }">
              <UButton size="xl" variant="soft" :color="brush.mode === 'eraseLine' ? 'primary' : 'neutral'"
                       class="size-12 grid place-content-center" square icon="i-lucide-eraser" @click="brush.mode = 'eraseLine'" />
            </UChip>
          </div>
          <div class="flex flex-wrap gap-2">
            <UChip inset position="top-left" size="3xl" text="U" :ui="{ base: 'bg-trasparent ring-0 top-1 left-1 text-(--ui-text)' }">
              <UButton size="xl" variant="soft" color="neutral" class="size-12 grid place-content-center" square icon="i-lucide-undo-2"
                       :disabled="!canUndo" @click="undo()" />
            </UChip>
            <UChip inset position="top-left" size="3xl" text="R" :ui="{ base: 'bg-trasparent ring-0 top-1 left-1 text-(--ui-text)' }">
              <UButton size="xl" variant="soft" color="neutral" class="size-12 grid place-content-center" square icon="i-lucide-redo-2"
                       :disabled="!canRedo" @click="redo()" />
            </UChip>
            <UChip inset position="top-left" size="3xl" text="D" :ui="{ base: 'bg-trasparent ring-0 top-1 left-1 text-(--ui-text)' }">
              <UButton size="xl" variant="soft" color="error" class="size-12 grid place-content-center" square icon="i-lucide-trash-2"
                       @click="clear()" />
            </UChip>
          </div>
        </div>
      </div>
      <aside class="overflow-hidden flex flex-col gap-2">
        <div class="overflow-y-auto rounded-md grow bg-elevated h-[28rem] flex flex-col gap-1 text-sm shadow-lg">
          <div v-for="(log, index) in logs" :key="index" class="flex items-center gap-2 p-1 odd:bg-accented">
            <UBadge :color="log.sender === nickname ? 'primary' : 'neutral'" class="font-semibold" :class="{ hidden: log.sender === 'system' }"
                    :label="log.sender === nickname ? 'You' : log.sender" size="sm" />
            <span :class="{ 'font-semibold': log.sender === 'system' }">{{ log.message }}</span>
          </div>
        </div>
        <UInput class="w-full mt-auto sticky bottom-0" placeholder="Type your guess here..." @keyup.enter="(e: KeyboardEvent) => {
          const input = e.target as HTMLInputElement
          if (!input.value) return
          logs.push({ sender: nickname, type: 'guess', message: input.value })
          send(JSON.stringify({ sender: nickname, type: 'guess', message: input.value } satisfies GameLog))
          input.value = ''
        }" />
      </aside>
    </section>
  </main>
</template>
