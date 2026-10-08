<script setup lang="ts">
import { randomUUID } from 'uncrypto'
import { useSchemaOrg } from '#imports'
import { isRoomCode, ROOM_CODE_LENGTH } from '#shared/utils/protocol'

const { t } = useI18n()
const { rooms, ready } = useLobby()
const nickname = useNickname()
const joinedRooms = useJoinedRooms()

const invitedCode = useRouteQuery('code', '', { transform: String })

const name = ref(nickname.value || randomNickname())
const code = ref(invitedCode.value)

const trimmedName = computed(() => name.value.trim())
const nameOk = computed(() => !nameProblem(name.value))

/** Accepts a bare code or a whole pasted link, old `/?code=` style included. */
const roomCode = computed(() => {
  const raw = code.value.trim()
  try {
    const url = new URL(raw)
    return (url.searchParams.get('code') ?? url.pathname.split('/').filter(Boolean).at(-1) ?? '').toLowerCase()
  } catch {
    return raw.toLowerCase()
  }
})
const validCode = computed(() => isRoomCode(roomCode.value))
/** Set by an Enter press on a code that isn't one; cleared once the code changes. */
const triedInvalid = ref(false)
watch(code, () => triedInvalid.value = false)

/** How long quick play waits for the public room list before creating a room. */
const LOBBY_WAIT_MS = 3_000

function join() {
  if (validCode.value) return enter(roomCode.value)
  if (roomCode.value) triedInvalid.value = true
}

function enter(room: string, isPublic = false) {
  if (!nameOk.value || !room) return
  nickname.value = trimmedName.value
  if (!joinedRooms.value.includes(room)) joinedRooms.value.push(room)
  return navigateTo({ path: `/room/${encodeURIComponent(room)}`, query: isPublic ? { public: '1' } : undefined })
}

function createRoom(isPublic = false) {
  return enter(randomUUID().replaceAll('-', '').slice(0, ROOM_CODE_LENGTH), isPublic)
}

async function quickPlay() {
  await until(ready).toBe(true, { timeout: LOBBY_WAIT_MS })
  const room = pickQuickPlayRoom(rooms.value)
  return room ? enter(room.id) : createRoom(true)
}

const footerLinks = computed(() => [
  { label: t('home.terms'), to: '/terms' },
  { label: t('home.changelog'), to: '/changelog' },
  { label: t('home.stats'), to: '/stats' },
  { label: t('home.credits'), to: '/credits' },
])

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
    offers: { price: 0, priceCurrency: 'EUR' },
  }),
])
</script>

<template>
  <main class="relative min-h-dvh flex flex-col">
    <img src="/favicon.svg" alt="SkizzOne" class="absolute top-4 start-4 size-12 -rotate-6">
    <div class="absolute top-4 end-4">
      <UColorModeButton size="lg" variant="outline" />
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
          <NameField v-model="name" @submit="invitedCode ? enter(roomCode) : createRoom()" />

          <UButton
            v-if="!invitedCode" block size="xl" color="secondary" icon="i-lucide-sparkles"
            :label="$t('home.create')" :disabled="!nameOk" loadingAuto @click="createRoom()" />

          <UButton
            v-if="!invitedCode" block size="xl" color="primary" variant="soft" icon="i-lucide-zap"
            :label="$t('home.quickPlay')" :disabled="!nameOk" loadingAuto @click="quickPlay()" />

          <USeparator v-if="!invitedCode" :label="$t('home.or')" :ui="{ label: 'font-display' }" />

          <UFormField
            :label="$t('home.code')" size="xl" :ui="{ label: 'font-display' }"
            :error="triedInvalid && $t('home.codeInvalid', { n: ROOM_CODE_LENGTH })">
            <UFieldGroup size="lg" class="w-full">
              <UInput
                v-model="code" class="w-full" :placeholder="$t('home.codePlaceholder')"
                @keyup.enter="join()" />
              <UButton
                :label="$t('home.join')" icon="i-lucide-log-in"
                :color="invitedCode ? 'secondary' : 'primary'" :variant="invitedCode ? 'solid' : 'soft'"
                :disabled="!nameOk || !validCode" @click="join()" />
            </UFieldGroup>
          </UFormField>
        </SketchFrame>
      </div>
    </div>

    <UFooter
      :ui="{
        container: 'max-w-none px-4 sm:px-4 lg:px-4 py-6 lg:py-4 lg:gap-x-6 lg:items-end',
        center: 'on-stage flex-col gap-2 text-center text-muted',
      }">
      <template #left>
        <i18n-t keypath="home.copyright" tag="p" class="font-display font-semibold text-(--on-stage)">
          <template #year>
            {{ new Date().getFullYear() }}
          </template>
          <template #name>
            <ULink to="https://github.com/zAlweNy26" target="_blank" raw class="inline-block underline underline-offset-4">
              Dany
            </ULink>
          </template>
        </i18n-t>
      </template>

      <UNavigationMenu :items="footerLinks" color="neutral" variant="link" />
      <p class="max-w-xl text-xs text-balance">
        {{ $t('home.disclaimer') }}
      </p>

      <template #right>
        <UButton
          icon="i-lucide-github" size="lg" square to="https://github.com/zAlweNy26/skizz-one" target="_blank"
          color="neutral" variant="outline"
          :aria-label="$t('home.sourceCode')" />
      </template>
    </UFooter>
  </main>
</template>
