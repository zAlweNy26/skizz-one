import { useLocalStorage, useSessionStorage } from '@vueuse/core'
import { pascalCase } from 'scule'
import { randomUUID } from 'uncrypto'
import { adjectives, animals, colors, uniqueNamesGenerator } from 'unique-names-generator'
import { isProfane } from '#shared/utils/profanity'
import { MAX_NAME_LENGTH } from '#shared/utils/protocol'

/** A throwaway name, e.g. `BraveBlueFox`. */
export function randomNickname() {
  return pascalCase(uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: '-',
    length: 2,
  })).slice(0, MAX_NAME_LENGTH)
}

export function randomAvatarSeed() {
  return randomUUID().slice(0, 8)
}

/** Why `name` can't be played under, as an i18n key; null when it can. */
export function nameProblem(name: string) {
  if (!name.trim()) return 'home.nameRequired'
  return isProfane(name) ? 'home.nameBlocked' : null
}

/** The name this browser plays under; empty until the player picks one. */
export function useNickname() {
  return useLocalStorage('nickname', '')
}

/** The DiceBear seed this browser's avatar is drawn from. */
export function useAvatarSeed() {
  return useLocalStorage('avatar', randomAvatarSeed)
}

/** Rooms this tab has already confirmed a name for, so a refresh skips the join screen. */
export function useJoinedRooms() {
  return useSessionStorage<string[]>('joinedRooms', [])
}
