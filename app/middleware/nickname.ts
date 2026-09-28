/**
 * Nobody joins a room nameless.
 *
 * A first-time visitor following a shared link is sent to the home page with
 * the code filled in, picks a name, and comes straight back.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (useNickname().value.trim()) return
  return navigateTo({ path: '/', query: { code: String(to.params.code ?? '') } })
})
