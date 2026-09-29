<script setup lang="ts">
import { MAX_NAME_LENGTH } from '#shared/utils/protocol'

const emit = defineEmits<{ submit: [] }>()
const name = defineModel<string>({ required: true })

const { t } = useI18n()
const trimmedName = computed(() => name.value.trim())
const nameError = computed(() => (trimmedName.value ? false : t('home.nameRequired')))
</script>

<template>
  <div class="flex items-center gap-4">
    <SketchFrame
      shape="circle" fill="var(--color-tangerine-200)" :strokeWidth="2.5"
      class="shrink-0 p-2 rotate-3">
      <UAvatar
        :src="`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(trimmedName)}`"
        size="3xl" :alt="trimmedName" />
    </SketchFrame>
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
