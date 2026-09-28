<script setup lang="ts">
import * as uiLocales from '@nuxt/ui/locale'

const { locale } = useI18n()

/** Nuxt UI's own strings (close buttons, empty states…) follow the app locale. */
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
  </UApp>
</template>
