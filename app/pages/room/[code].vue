<script setup lang="ts">
const route = useRoute()
const roomCode = computed(() => String(route.params.code ?? ''))

const nickname = useNickname()
const joinedRooms = useJoinedRooms()
const joined = computed(() => Boolean(nickname.value.trim()) && joinedRooms.value.includes(roomCode.value))

const name = ref(nickname.value || randomNickname())
const trimmedName = computed(() => name.value.trim())

function join() {
  if (!trimmedName.value) return
  nickname.value = trimmedName.value
  if (!joinedRooms.value.includes(roomCode.value)) joinedRooms.value.push(roomCode.value)
}
</script>

<template>
  <RoomGame v-if="joined" />

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
          block size="xl" color="secondary" icon="i-lucide-log-in" class="text-lg py-3"
          :label="$t('home.join')" :disabled="!trimmedName" @click="join()" />
      </SketchFrame>
    </div>
  </main>
</template>
