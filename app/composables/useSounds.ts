import type { GameState } from '#shared/utils/protocol'
import type { Sound } from '~/utils/soundCues'
import { useEventListener, useLocalStorage } from '@vueuse/core'

const VOLUME = 0.5
const TICK_VOLUME = 0.3
const TICK_FROM_SECONDS = 5

export function useSounds({ onMessage, you, state, secondsLeft }: Pick<
  ReturnType<typeof useGameSocket>,
  'onMessage' | 'you' | 'state'
> & { secondsLeft: Ref<number | null> }) {
  const muted = useLocalStorage('muted', false)

  let context: AudioContext | undefined
  const buffers = new Map<Sound, Promise<AudioBuffer | undefined>>()

  function unlock() {
    context ??= new AudioContext()
    if (context.state === 'suspended') context.resume().catch(() => {})
  }
  useEventListener(document, ['pointerdown', 'keydown'], unlock, { passive: true })
  onMounted(() => {
    if (navigator.userActivation?.hasBeenActive) unlock()
  })

  function load(ctx: AudioContext, sound: Sound) {
    let buffer = buffers.get(sound)
    if (!buffer) {
      buffer = fetch(`/sounds/${sound}.mp3`)
        .then(res => res.arrayBuffer())
        .then(data => ctx.decodeAudioData(data))
        .catch(() => undefined)
      buffers.set(sound, buffer)
    }
    return buffer
  }

  async function play(sound: Sound) {
    const ctx = context
    if (muted.value || !ctx || ctx.state !== 'running') return
    const buffer = await load(ctx, sound)
    if (!buffer) return
    const gain = ctx.createGain()
    gain.gain.value = sound === 'tick' ? TICK_VOLUME : VOLUME
    gain.connect(ctx.destination)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gain)
    source.start()
  }

  let last: GameState | null = null
  onMessage((msg) => {
    if (msg.t === 'welcome') {
      last = msg.state
      return
    }
    if (msg.t !== 'state' && msg.t !== 'roundEnd') return
    if (last) for (const sound of soundCues(last, msg.state, you.value)) play(sound)
    last = msg.state
  })

  watch(secondsLeft, (now, was) => {
    const s = state.value
    if (!s || s.phase !== 'drawing' || s.paused || now === null || now === was) return
    if (now > 0 && now <= TICK_FROM_SECONDS) play('tick')
  })

  onScopeDispose(() => {
    context?.close().catch(() => {})
  })

  return { muted }
}
