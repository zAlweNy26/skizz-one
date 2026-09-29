<script setup lang="ts">
const { locale } = useI18n()

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
</script>

<template>
  <PaperPage wide :title="$t('changelog.title')" :description="$t('changelog.description')">
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
  </PaperPage>
</template>
