import type { Browser, Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'

/** A player in their own browser context, with every console error and CSP violation collected. */
async function join(browser: Browser, baseURL: string, room: string, name: string) {
  const context = await browser.newContext({ baseURL, locale: 'en-US' })
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e =>
      console.error(`CSP blocked ${e.blockedURI} (${e.violatedDirective})`))
  })
  const page = await context.newPage()
  const problems: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text())
  })
  page.on('pageerror', e => problems.push(e.message))

  await page.goto(`/room/${room}`)
  await page.getByRole('textbox').first().fill(name)
  await page.getByRole('button', { name: 'Join' }).click()
  return { page, problems }
}

function chat(page: Page) {
  return page.getByPlaceholder(/Type your guess here|Say something/)
}

test('two players play a turn', async ({ browser, baseURL }) => {
  const room = randomBytes(4).toString('hex')
  const alice = await join(browser, baseURL!, room, 'Alice')
  const bob = await join(browser, baseURL!, room, 'Bob')

  await expect(alice.page.getByText('Bob joined the game')).toBeVisible()

  await alice.page.getByRole('button', { name: 'Start game' }).first().click()
  const choice = alice.page.locator('.choice').first()
  const word = (await choice.textContent())?.trim() ?? ''
  await choice.click()
  await expect(bob.page.getByText('Alice is drawing!')).toBeVisible()

  const canvas = alice.page.locator(`svg[viewBox="0 0 1600 1200"]`).first()
  const box = (await canvas.boundingBox())!
  await alice.page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await alice.page.mouse.down()
  for (let i = 1; i <= 10; i++)
    await alice.page.mouse.move(box.x + box.width * (0.3 + i * 0.04), box.y + box.height * (0.3 + i * 0.03))
  await alice.page.mouse.up()
  await expect(bob.page.locator(`svg[viewBox="0 0 1600 1200"] path`).first()).toBeAttached()

  await chat(bob.page).fill('definitely not it')
  await chat(bob.page).press('Enter')
  await expect(alice.page.getByText('definitely not it')).toBeVisible()

  await chat(bob.page).fill(word)
  await chat(bob.page).press('Enter')
  await expect(alice.page.getByText('Bob guessed the word!')).toBeVisible()
  await expect(bob.page.getByText(`The word was "${word}"`)).toBeVisible()

  expect(alice.problems).toEqual([])
  expect(bob.problems).toEqual([])
})
