<script lang="ts" setup>
import type { Award, AwardKey, GamePlayer } from '#shared/utils/protocol'

const props = defineProps<{
  awards: Award[]
  players: GamePlayer[]
  you: string
}>()

const { t } = useI18n()

const AWARD_ICON: Record<AwardKey, string> = {
  fastest: 'i-lucide-zap',
  mostLiked: 'i-lucide-heart',
  almostHadIt: 'i-lucide-crosshair',
  picasso: 'i-lucide-palette',
}

const awardCards = computed(() => props.awards.flatMap((award) => {
  const player = props.players.find(p => p.id === award.playerId)
  if (!player) return []
  const value = award.key === 'fastest'
    ? t('awards.fastestValue', { n: (award.value / 1000).toFixed(1) })
    : t(`awards.${award.key}Value`, award.value)
  return [{ ...award, name: player.name, value, icon: AWARD_ICON[award.key] }]
}))
</script>

<template>
  <ul
    v-if="awardCards.length"
    class="grid grid-cols-2 gap-1.5 w-full max-w-lg lg:flex lg:flex-wrap lg:justify-center lg:w-auto lg:gap-3"
    :aria-label="$t('awards.title')">
    <li
      v-for="(award, index) in awardCards" :key="award.key"
      class="pop-in min-w-0 odd:last:col-span-2 odd:last:justify-self-center"
      :style="{ animationDelay: `${600 + index * 120}ms` }">
      <SketchFrame
        :radius="8" :strokeWidth="1.8" :roughness="1.1"
        class="flex items-center gap-1.5 px-2 py-0.5 lg:gap-2 lg:px-3 lg:py-1.5"
        :class="index % 2 ? 'rotate-2' : '-rotate-2'">
        <UIcon :name="award.icon" class="size-4 shrink-0 text-primary lg:size-5" />
        <span class="flex flex-col min-w-0 leading-tight">
          <span class="truncate font-display font-bold text-xs lg:text-sm">{{ $t(`awards.${award.key}`) }}</span>
          <span class="text-xs text-muted" :class="{ 'text-primary': award.playerId === you }">
            {{ award.name }} · {{ award.value }}
          </span>
        </span>
      </SketchFrame>
    </li>
  </ul>
</template>
