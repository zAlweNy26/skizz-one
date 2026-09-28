import { useLocalStorage } from '@vueuse/core'
import { pascalCase } from 'scule'
import { adjectives, animals, colors, uniqueNamesGenerator } from 'unique-names-generator'
import { MAX_NAME_LENGTH } from '#shared/utils/protocol'

/** A throwaway name, e.g. `BraveBlueFox`, for anyone who can't be bothered. */
export function randomNickname() {
  return pascalCase(uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: '-',
    length: 2,
  })).slice(0, MAX_NAME_LENGTH)
}

/**
 * The name this browser plays under.
 *
 * Empty until the player picks one on the home page, which is how the room
 * page knows to send a first-time visitor there before connecting.
 */
export function useNickname() {
  return useLocalStorage('nickname', '')
}
