import { expect, test } from '@nuxt/test-utils/playwright'

test('loads the game page', async ({ page, goto }) => {
  await goto('/', { waitUntil: 'hydration' })
  await expect(page).toHaveTitle(/SkizzOne/)
  await expect(page.getByRole('heading', { name: 'SkizzOne' })).toBeVisible()
})
