<script lang="ts" setup>
import rough from 'roughjs'

const props = withDefaults(defineProps<{
  as?: string
  /**
   * `box` frames the content; `circle` rings it; `underline` scribbles below
   * it; `crown` fills the element with a three-pointed doodled crown.
   */
  shape?: 'box' | 'circle' | 'underline' | 'crown'
  /** CSS colour of the pen; `var()` works. */
  stroke?: string
  /** CSS colour of the fill, or `none`. */
  fill?: string
  strokeWidth?: number
  /** Corner radius of a `box`, in px. */
  radius?: number
  /** How shaky the hand is. 0 is a ruler. */
  roughness?: number
  /** Fixes the wobble. Defaults to one derived from the component's id. */
  seed?: number
}>(), {
  as: 'div',
  shape: 'box',
  stroke: 'var(--ink)',
  fill: 'var(--paper)',
  strokeWidth: 2.5,
  radius: 14,
  roughness: 1.2,
})

const generator = rough.generator()

const id = useId()
const idSeed = ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 2 ** 31) || 1
const seed = computed(() => props.seed ?? idSeed)

const root = useTemplateRef<HTMLElement>('root')
const { width, height } = useElementSize(root, undefined, { box: 'border-box' })

function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  return `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} `
    + `Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} `
    + `V${y + r} Q${x},${y} ${x + r},${y} Z`
}

function draw(w: number, h: number) {
  const inset = props.strokeWidth
  const filled = props.fill !== 'none' && props.shape !== 'underline'
  const options = {
    seed: seed.value,
    roughness: props.roughness,
    bowing: 0.8,
    strokeWidth: props.strokeWidth,
    // Placeholders, replaced by styles below.
    stroke: 'ink',
    fill: filled ? 'paper' : undefined,
    fillStyle: 'solid',
    disableMultiStroke: props.shape === 'underline',
  }

  if (props.shape === 'circle')
    return generator.ellipse(w / 2, h / 2, w - inset * 2, h - inset * 2, options)

  if (props.shape === 'crown') {
    const [l, r, t, b] = [inset, w - inset, inset, h - inset]
    return generator.polygon([
      [l, b],
      [l, t + (b - t) * 0.35],
      [l + (r - l) * 0.27, t + (b - t) * 0.62],
      [l + (r - l) * 0.5, t],
      [l + (r - l) * 0.73, t + (b - t) * 0.62],
      [r, t + (b - t) * 0.35],
      [r, b],
    ], options)
  }

  if (props.shape === 'underline') {
    return generator.curve([
      [inset, h - inset * 1.6],
      [w * 0.35, h - inset],
      [w * 0.7, h - inset * 1.8],
      [w - inset, h - inset * 1.2],
    ], options)
  }

  return generator.path(roundedRect(inset, inset, w - inset * 2, h - inset * 2, props.radius), options)
}

const paths = computed(() => {
  const w = width.value
  const h = height.value
  if (!w || !h) return []

  return generator.toPaths(draw(w, h)).map(p => ({
    d: p.d,
    style: p.fill && p.fill !== 'none'
      ? { fill: props.fill, stroke: 'none' }
      : { fill: 'none', stroke: props.stroke, strokeWidth: p.strokeWidth, strokeLinecap: 'round' as const },
  }))
})
</script>

<template>
  <component :is="as" ref="root" class="relative isolate">
    <svg
      class="absolute inset-0 -z-10 size-full overflow-visible pointer-events-none"
      :viewBox="`0 0 ${width || 1} ${height || 1}`" aria-hidden="true">
      <path v-for="(path, index) in paths" :key="index" :d="path.d" :style="path.style" />
    </svg>
    <slot />
  </component>
</template>
