<script setup lang="ts">
const page = await useLocalisedPage('credits')
</script>

<template>
  <PaperPage :title="page?.title" :description="page?.description">
    <article v-if="page" class="flex flex-col gap-6">
      <h1 class="font-display font-extrabold text-3xl">
        {{ page.title }}
      </h1>

      <ContentRenderer :value="page" />
    </article>
  </PaperPage>
</template>
