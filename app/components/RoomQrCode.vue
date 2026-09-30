<script setup lang="ts">
import { renderSVG } from 'uqr'

const props = defineProps<{ code: string }>()

const open = defineModel<boolean>('open', { default: false })

const url = computed(() => `${window.location.origin}/room/${props.code}`)
const qr = computed(() =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSVG(url.value, { ecc: 'M', border: 2 }))}`)
</script>

<template>
  <UModal v-model:open="open" :title="$t('qr.title')" :description="$t('qr.description')">
    <template #body>
      <figure class="flex flex-col items-center gap-3">
        <img
          :src="qr" :alt="$t('qr.alt', { code })" width="512" height="512"
          class="w-full max-w-3xs aspect-square rounded-lg">
        <figcaption class="flex flex-col items-center gap-1 text-center">
          <span class="font-display font-bold text-3xl tracking-widest">{{ code }}</span>
          <span class="text-muted break-all">{{ url }}</span>
        </figcaption>
      </figure>
    </template>
  </UModal>
</template>
