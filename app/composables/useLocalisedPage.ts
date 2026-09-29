export async function useLocalisedPage<C extends 'terms' | 'credits'>(collection: C) {
  const { locale } = useI18n()

  const { data: page } = await useAsyncData(
    () => `${collection}-${locale.value}`,
    async () => await queryCollection(collection).path(`/${collection}/${locale.value}`).first()
      ?? await queryCollection(collection).path(`/${collection}/en`).first(),
  )

  return page
}
