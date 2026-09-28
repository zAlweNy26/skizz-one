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
  <main class="min-h-dvh grid place-items-center p-4">
    <div class="w-full max-w-sm flex flex-col items-center gap-6">
      <div class="flex flex-col items-center gap-2">
        <h1 class="font-bold text-4xl text-primary">
          SkizzOne
        </h1>
        <p class="text-muted text-center">
          {{ $t('home.tagline') }}
        </p>
        <ThemeSwitch />
      </div>

      <UCard class="w-full" :ui="{ body: 'flex flex-col gap-5' }">
        <div class="flex items-center gap-3">
          <UAvatar
            :src="`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(trimmedName)}`"
            size="3xl" :alt="trimmedName" />
          <UFormField :label="$t('home.name')" :error="nameError" class="grow">
            <UFieldGroup class="w-full">
              <UInput
                v-model="name" class="w-full" autofocus :maxlength="MAX_NAME_LENGTH"
                @keyup.enter="invitedCode ? joinRoom() : createRoom()" />
              <UTooltip :text="$t('home.randomName')">
                <UButton
                  color="neutral" variant="subtle" icon="i-lucide-dices"
                  :aria-label="$t('home.randomName')" @click="name = randomNickname()" />
              </UTooltip>
            </UFieldGroup>
          </UFormField>
        </div>

        <UButton
          v-if="!invitedCode" block size="lg" icon="i-lucide-plus"
          :label="$t('home.create')" :disabled="!trimmedName" @click="createRoom()" />

        <USeparator v-if="!invitedCode" :label="$t('home.or')" />

        <UFormField :label="$t('home.code')">
          <UFieldGroup class="w-full">
            <UInput v-model="code" class="w-full" :placeholder="$t('home.codePlaceholder')" @keyup.enter="joinRoom()" />
            <UButton
              :label="$t('home.join')" icon="i-lucide-log-in" :variant="invitedCode ? 'solid' : 'subtle'"
              :disabled="!trimmedName || !roomCode" @click="joinRoom()" />
          </UFieldGroup>
        </UFormField>
      </UCard>
    </div>
  </main>
</template>
