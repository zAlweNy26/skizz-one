export default defineNuxtRouteMiddleware((to) => {
  if (useNickname().value.trim()) return
  return navigateTo({ path: '/', query: { code: String(to.params.code ?? '') } })
})
