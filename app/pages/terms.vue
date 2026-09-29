<script setup lang="ts">
const { locale } = useI18n()

const { data: page } = await useAsyncData(
  () => `terms-${locale.value}`,
  async () => await queryCollection('terms').path(`/terms/${locale.value}`).first()
    ?? await queryCollection('terms').path('/terms/en').first(),
)

const updated = computed(() => page.value
  && new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(page.value.updated)))

useSeoMeta({
  title: () => page.value?.title,
  description: () => page.value?.description,
  ogTitle: () => page.value?.title,
  ogDescription: () => page.value?.description,
})
</script>

<template>
  <main class="min-h-dvh flex justify-center px-4 py-8">
    <div class="w-full max-w-2xl flex flex-col items-center gap-8">
      <ULink to="/" raw class="press inline-flex -rotate-6 rounded-sketch" :aria-label="$t('kicked.home')">
        <img src="/favicon.svg" alt="SkizzOne" class="size-16">
      </ULink>

      <SketchFrame as="article" :radius="22" :strokeWidth="3" class="w-full p-6 sm:p-8 flex flex-col gap-6">
        <template v-if="page">
          <header class="flex flex-col gap-1">
            <h1 class="font-display font-extrabold text-3xl">
              {{ page.title }}
            </h1>
            <p class="text-sm text-muted">
              {{ $t('terms.updated', { date: updated }) }}
            </p>
          </header>

          <ContentRenderer :value="page" />
        </template>

        <UButton
          to="/" size="xl" color="secondary" icon="i-lucide-house" class="self-center"
          :label="$t('kicked.home')" />
      </SketchFrame>
    </div>
  </main>
</template>
