<script setup lang="ts">
const { locale } = useI18n()
const page = await useLocalisedPage('terms')

const updated = computed(() => page.value
  && new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(page.value.updated)))
</script>

<template>
  <PaperPage :title="page?.title" :description="page?.description">
    <article v-if="page" class="flex flex-col gap-6">
      <header class="flex flex-col gap-1">
        <h1 class="font-display font-extrabold text-3xl">
          {{ page.title }}
        </h1>
        <p class="text-sm text-muted">
          {{ $t('terms.updated', { date: updated }) }}
        </p>
      </header>

      <ContentRenderer :value="page" />
    </article>
  </PaperPage>
</template>
