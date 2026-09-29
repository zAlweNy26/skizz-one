<script setup lang="ts">
import { MAX_NAME_LENGTH } from '#shared/utils/protocol'

const emit = defineEmits<{ submit: [] }>()
const name = defineModel<string>({ required: true })

const { t } = useI18n()
const avatar = useAvatarSeed()
const trimmedName = computed(() => name.value.trim())
const nameError = computed(() => (trimmedName.value ? false : t('home.nameRequired')))
</script>

<template>
  <div class="flex items-center gap-4">
    <div class="relative shrink-0">
      <SketchFrame shape="circle" fill="var(--color-tangerine-200)" :strokeWidth="2.5" class="p-2 rotate-3">
        <UAvatar :src="avatarUrl(avatar)" size="4xl" :alt="trimmedName" />
      </SketchFrame>
      <UTooltip :text="$t('home.randomAvatar')">
        <UButton
          color="neutral" variant="soft" size="sm" icon="i-lucide-refresh-cw" square
          class="absolute end-0 bottom-0" :aria-label="$t('home.randomAvatar')"
          @click="avatar = randomAvatarSeed()" />
      </UTooltip>
    </div>
    <UFormField
      :label="$t('home.name')" :error="nameError" size="xl" class="grow"
      :ui="{ label: 'font-display' }">
      <UFieldGroup size="lg" class="w-full">
        <UInput
          v-model="name" class="w-full" autofocus :maxlength="MAX_NAME_LENGTH"
          @keyup.enter="emit('submit')" />
        <UTooltip :text="$t('home.randomName')">
          <UButton
            color="neutral" variant="soft" icon="i-lucide-dices"
            :aria-label="$t('home.randomName')" @click="name = randomNickname()" />
        </UTooltip>
      </UFieldGroup>
    </UFormField>
  </div>
</template>
