import { useLocalStorage, useSessionStorage } from '@vueuse/core'
import { pascalCase } from 'scule'
import { adjectives, animals, colors, uniqueNamesGenerator } from 'unique-names-generator'
import { MAX_NAME_LENGTH } from '#shared/utils/protocol'

/** A throwaway name, e.g. `BraveBlueFox`. */
export function randomNickname() {
  return pascalCase(uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: '-',
    length: 2,
  })).slice(0, MAX_NAME_LENGTH)
}

/** The name this browser plays under; empty until the player picks one. */
export function useNickname() {
  return useLocalStorage('nickname', '')
}

/** Rooms this tab has already confirmed a name for, so a refresh skips the join screen. */
export function useJoinedRooms() {
  return useSessionStorage<string[]>('joinedRooms', [])
}
