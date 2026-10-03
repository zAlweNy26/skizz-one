<script setup lang="ts">
import { isRoomCode, ROOM_CODE_LENGTH } from '#shared/utils/protocol'

const route = useRoute()
const roomCode = computed(() => String(route.params.code ?? ''))
const validCode = computed(() => isRoomCode(roomCode.value))

const nickname = useNickname()
const joinedRooms = useJoinedRooms()
const joined = computed(() => validCode.value && Boolean(nickname.value.trim())
  && joinedRooms.value.includes(roomCode.value))

const name = ref(nickname.value || randomNickname())
const trimmedName = computed(() => name.value.trim())
const nameOk = computed(() => !nameProblem(name.value))

function join() {
  if (!nameOk.value || !validCode.value) return
  nickname.value = trimmedName.value
  if (!joinedRooms.value.includes(roomCode.value)) joinedRooms.value.push(roomCode.value)
}
</script>

<template>
  <RoomGame v-if="joined" />

  <main v-else-if="!validCode" class="min-h-dvh grid place-items-center px-4 py-8">
    <SketchFrame :radius="22" :strokeWidth="3" class="w-full max-w-md p-6 sm:p-8 flex flex-col items-center gap-4">
      <UIcon name="i-lucide-search-x" class="size-12 text-warning" />
      <h1 class="font-display font-extrabold text-2xl text-center">
        {{ $t('join.invalidTitle') }}
      </h1>
      <p class="text-muted text-center">
        {{ $t('home.codeInvalid', { n: ROOM_CODE_LENGTH }) }}
      </p>
      <UButton to="/" size="xl" color="secondary" icon="i-lucide-house" :label="$t('kicked.home')" />
    </SketchFrame>
  </main>

  <main v-else class="min-h-dvh grid place-items-center px-4 py-8">
    <div class="w-full max-w-md flex flex-col items-center gap-8">
      <ULink to="/" raw class="press inline-flex -rotate-6 rounded-sketch">
        <img src="/favicon.svg" alt="SkizzOne" class="size-16">
      </ULink>

      <SketchFrame :radius="22" :strokeWidth="3" class="w-full p-6 sm:p-8 flex flex-col gap-6">
        <div class="flex flex-col gap-1">
          <h1 class="font-display font-extrabold text-3xl">
            {{ $t('join.title') }}
          </h1>
          <i18n-t keypath="join.room" tag="p" class="text-muted">
            <template #code>
              <UBadge color="neutral" variant="soft" size="lg" :label="roomCode" class="font-mono" />
            </template>
          </i18n-t>
        </div>

        <NameField v-model="name" @submit="join()" />

        <UButton
          block size="xl" color="secondary" icon="i-lucide-log-in"
          :label="$t('home.join')" :disabled="!nameOk" @click="join()" />
      </SketchFrame>
    </div>
  </main>
</template>
