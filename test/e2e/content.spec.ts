import { expect, test } from '@nuxt/test-utils/playwright'

test('content pages render without console errors', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e =>
      console.error(`CSP blocked ${e.blockedURI} (${e.violatedDirective})`))
  })
  const problems: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text())
  })
  page.on('pageerror', e => problems.push(e.message))

  for (const path of ['/changelog', '/terms', '/credits']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
  expect(problems).toEqual([])
})
