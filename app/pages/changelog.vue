<script setup lang="ts">
const { t, locale } = useI18n()

function queryVersions(lang: string) {
  return queryCollection('changelog').where('path', 'LIKE', `/changelog/${lang}/%`).order('date', 'DESC').all()
}

const { data: versions } = await useAsyncData(
  () => `changelog-${locale.value}`,
  async () => {
    const localised = await queryVersions(locale.value)
    return localised.length ? localised : await queryVersions('en')
  },
)

useSeoMeta({
  title: () => t('changelog.title'),
  description: () => t('changelog.description'),
  ogTitle: () => t('changelog.title'),
  ogDescription: () => t('changelog.description'),
})
</script>

<template>
  <main class="min-h-dvh flex justify-center px-4 py-8">
    <div class="w-full max-w-5xl flex flex-col items-center gap-8">
      <ULink to="/" raw class="press inline-flex -rotate-6 rounded-sketch" :aria-label="$t('kicked.home')">
        <img src="/favicon.svg" alt="SkizzOne" class="size-16">
      </ULink>

      <SketchFrame :radius="22" :strokeWidth="3" class="w-full p-6 sm:p-8 flex flex-col gap-8">
        <header class="w-full max-w-2xl mx-auto flex flex-col gap-1">
          <h1 class="font-display font-extrabold text-3xl">
            {{ $t('changelog.title') }}
          </h1>
          <p class="text-muted">
            {{ $t('changelog.description') }}
          </p>
        </header>

        <UChangelogVersions>
          <UChangelogVersion
            v-for="version in versions" :key="version.path" :title="version.title"
            :description="version.description" :date="version.date" :badge="`v${version.version}`">
            <template #body>
              <ContentRenderer :value="version" />
            </template>
          </UChangelogVersion>
        </UChangelogVersions>

        <UButton
          to="/" size="xl" color="secondary" icon="i-lucide-house" class="self-center"
          :label="$t('kicked.home')" />
      </SketchFrame>
    </div>
  </main>
</template>
