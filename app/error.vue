<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()
const key = computed(() => props.error.statusCode === 404 ? 'notFound' : 'generic')

useHead({ titleTemplate: '%s | SkizzOne' })
useSeoMeta({ robots: 'noindex, nofollow' })
</script>

<template>
  <UApp>
    <PaperPage :title="t(`error.${key}.title`)" :description="t(`error.${key}.description`)">
      <header class="flex flex-col gap-2 text-center">
        <h1 class="font-display font-extrabold text-3xl">
          {{ t(`error.${key}.title`) }}
        </h1>
        <p class="text-muted">
          {{ t(`error.${key}.description`) }}
        </p>
      </header>
    </PaperPage>
  </UApp>
</template>
