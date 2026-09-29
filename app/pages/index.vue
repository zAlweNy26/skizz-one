<script setup lang="ts">
import { randomUUID } from 'uncrypto'
import { useSchemaOrg } from '#imports'
import { MAX_NAME_LENGTH } from '#shared/utils/protocol'

const { t } = useI18n()
const nickname = useNickname()

const invitedCode = useRouteQuery('code', '', { transform: String })

const name = ref(nickname.value || randomNickname())
const code = ref(invitedCode.value)

const trimmedName = computed(() => name.value.trim())
const nameError = computed(() => (trimmedName.value ? false : t('home.nameRequired')))

/** Accepts a bare code or a whole pasted link, old `/?code=` style included. */
const roomCode = computed(() => {
  const raw = code.value.trim()
  try {
    const url = new URL(raw)
    return url.searchParams.get('code') ?? url.pathname.split('/').filter(Boolean).at(-1) ?? ''
  } catch {
    return raw
  }
})

function enter(room: string) {
  if (!trimmedName.value || !room) return
  nickname.value = trimmedName.value
  return navigateTo(`/room/${encodeURIComponent(room)}`)
}

function createRoom() {
  return enter(randomUUID().split('-')[0]!)
}

function joinRoom() {
  return enter(roomCode.value)
}

const footerUi = {
  container: 'max-w-none px-4 sm:px-4 lg:px-4 py-4 flex items-center justify-between gap-3',
  left: 'mt-0 order-1 justify-start',
  center: 'hidden',
  right: 'flex-none order-3',
}

useHead({ title: () => t('seo.title'), titleTemplate: null })
useSeoMeta({
  description: () => t('seo.description'),
  ogTitle: () => t('seo.title'),
  ogDescription: () => t('seo.description'),
  ogImage: { url: 'https://skizz.app/og-image.png', width: 1200, height: 630, alt: 'SkizzOne' },
  twitterCard: 'summary_large_image',
})

useSchemaOrg([
  defineSoftwareApp({
    name: 'SkizzOne',
    description: () => t('seo.description'),
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    image: 'https://skizz.app/og-image.png',
    offers: { price: 0 },
  }),
])
</script>

<template>
  <main class="relative min-h-dvh flex flex-col">
    <img src="/favicon.svg" alt="SkizzOne" class="absolute top-4 start-4 size-12 -rotate-6">
    <div class="absolute top-4 end-4">
      <UColorModeButton size="lg" class="text-(--on-stage) hover:bg-(--on-stage)/15" />
    </div>

    <div class="grow grid place-items-center px-4 pt-20 pb-8">
      <div class="w-full max-w-md flex flex-col items-center gap-10">
        <header class="flex flex-col items-center gap-4 text-center">
          <SketchFrame
            shape="underline" fill="none" stroke="var(--color-tangerine-400)" :strokeWidth="6" :roughness="1.6"
            class="px-3 pb-5 -rotate-3">
            <h1 class="font-display font-extrabold text-6xl sm:text-7xl text-(--on-stage)">
              SkizzOne
            </h1>
          </SketchFrame>
          <p class="font-display font-semibold text-xl text-(--on-stage) text-balance">
            {{ $t('home.tagline') }}
          </p>
        </header>

        <SketchFrame :radius="22" :strokeWidth="3" class="w-full p-6 sm:p-8 flex flex-col gap-6">
          <div class="flex items-center gap-4">
            <SketchFrame
              shape="circle" fill="var(--color-tangerine-200)" :strokeWidth="2.5"
              class="shrink-0 p-2 rotate-3">
              <UAvatar
                :src="`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(trimmedName)}`"
                size="3xl" :alt="trimmedName" class="bg-transparent" />
            </SketchFrame>
            <UFormField
              :label="$t('home.name')" :error="nameError" class="grow"
              :ui="{ label: 'font-display text-base' }">
              <UFieldGroup class="w-full">
                <UInput
                  v-model="name" size="lg" class="w-full" autofocus :maxlength="MAX_NAME_LENGTH"
                  @keyup.enter="invitedCode ? joinRoom() : createRoom()" />
                <UTooltip :text="$t('home.randomName')">
                  <UButton
                    color="neutral" variant="soft" size="lg" icon="i-lucide-dices"
                    :aria-label="$t('home.randomName')" @click="name = randomNickname()" />
                </UTooltip>
              </UFieldGroup>
            </UFormField>
          </div>

          <UButton
            v-if="!invitedCode" block size="xl" color="secondary" icon="i-lucide-sparkles"
            class="text-lg py-3" :label="$t('home.create')" :disabled="!trimmedName" @click="createRoom()" />

          <USeparator v-if="!invitedCode" :label="$t('home.or')" :ui="{ label: 'font-display text-muted' }" />

          <UFormField :label="$t('home.code')" :ui="{ label: 'font-display text-base' }">
            <UFieldGroup class="w-full">
              <UInput
                v-model="code" size="lg" class="w-full" :placeholder="$t('home.codePlaceholder')"
                @keyup.enter="joinRoom()" />
              <UButton
                :label="$t('home.join')" size="lg" icon="i-lucide-log-in"
                :color="invitedCode ? 'secondary' : 'primary'" :variant="invitedCode ? 'solid' : 'soft'"
                :disabled="!trimmedName || !roomCode" @click="joinRoom()" />
            </UFieldGroup>
          </UFormField>
        </SketchFrame>
      </div>
    </div>

    <UFooter :ui="footerUi">
      <template #left>
        <i18n-t keypath="home.madeBy" tag="p" class="font-display font-semibold text-lg text-(--on-stage)">
          <template #name>
            <ULink to="https://github.com/zAlweNy26" target="_blank" class="text-(--on-stage) underline underline-offset-4">
              Dany
            </ULink>
          </template>
        </i18n-t>
      </template>

      <template #right>
        <UButton
          icon="i-lucide-github" size="lg" square to="https://github.com/zAlweNy26/skizz-one" target="_blank"
          class="size-11 justify-center bg-(--chip) text-(--on-chip) hover:bg-(--chip)/85"
          :aria-label="$t('home.sourceCode')" />
      </template>
    </UFooter>
  </main>
</template>
