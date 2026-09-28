<script setup lang="ts">
import * as uiLocales from '@nuxt/ui/locale'

const { locale } = useI18n()
const { version } = useRuntimeConfig().public

const uiLocale = computed(() => uiLocales[locale.value])

useHead({
  titleTemplate: title => title ? `${title} | SkizzOne` : 'SkizzOne',
  htmlAttrs: {
    lang: () => uiLocale.value.code,
    dir: () => uiLocale.value.dir,
  },
})
</script>

<template>
  <UApp :locale="uiLocale" :tooltip="{ delayDuration: 300 }" :toaster="{ duration: 2000, position: 'bottom-right' }">
    <NuxtPage />
    <span
      class="fixed right-[max(0.5rem,env(safe-area-inset-right))] bottom-[max(0.25rem,env(safe-area-inset-bottom))]
        z-10 pointer-events-none select-none font-display text-xs text-(--on-stage)/60"
    >
      v{{ version }}
    </span>
  </UApp>
</template>
