<script setup lang="ts">
import { randomUUID } from 'uncrypto'
import { MAX_NAME_LENGTH } from '#shared/utils/protocol'

const { t } = useI18n()
const nickname = useNickname()

/** Set when a shared link sent a nameless visitor here first. */
const invitedCode = useRouteQuery('code', '', { transform: String })

const name = ref(nickname.value || randomNickname())
const code = ref(invitedCode.value)

const trimmedName = computed(() => name.value.trim())
const nameError = computed(() => (trimmedName.value ? false : t('home.nameRequired')))

/**
 * Accept a bare code or a whole pasted link, old `/?code=` style included.
 */
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

useHead({ title: computed(() => t('home.title')) })
</script>

<template>
  <main class="relative min-h-dvh grid place-items-center px-4 py-16">
    <div class="absolute top-4 end-4">
      <ThemeSwitch />
    </div>

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
  </main>
</template>
