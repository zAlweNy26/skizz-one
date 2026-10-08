import { describe, expect, it } from 'vitest'
import {
  defaultNameColor,
  DRAW_TIME,
  MAX_NAME_LENGTH,
  OUTDATED_CLOSE_CODE,
  PROTOCOL_VERSION,
} from '#shared/utils/protocol'
import { createWorld, ROOM, seat } from '#test/realtime/harness'

describe('joining', () => {
  it('welcomes each player with a public id derived from their token', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')

    expect(alice.id).toMatch(/^[0-9a-f]{32}$/)
    expect(bob.id).toMatch(/^[0-9a-f]{32}$/)
    expect(alice.id).not.toBe(bob.id)
    expect(JSON.stringify(bob.history)).not.toContain(alice.token)
    expect(JSON.stringify(alice.history)).not.toContain(bob.token)
  })

  it('gives the same token a different id in another room', async () => {
    const world = createWorld()
    const here = await world.join('Alice')
    const there = await world.join('Alice', { room: 'ffff0000' })
    expect(here.id).not.toBe(there.id)
  })

  it('makes the first player host and starts on the defaults', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    const welcome = alice.last('welcome')!.state

    expect(welcome.hostId).toBe(alice.id)
    expect(welcome.phase).toBe('lobby')
    expect(welcome.language).toBe('en')
    expect(welcome.drawTime).toBe(DRAW_TIME.default)
    expect(welcome.public).toBe(false)
    expect(welcome.awards).toEqual([])
    expect(alice.state!.players.map(p => p.name)).toEqual(['Alice', 'Bob'])
    expect(bob.state!.hostId).toBe(alice.id)
  })

  it('announces newcomers', async () => {
    const world = createWorld()
    const alice = await world.join('Alice')
    await world.join('Bob')
    expect(alice.last('log')).toMatchObject({ key: 'joined', params: { name: 'Bob' } })
  })

  it('takes the word language and visibility from the first player only', async () => {
    const world = createWorld()
    const alice = await world.join('Alice', { lang: 'it', public: true })
    await world.join('Bob', { lang: 'en' })
    expect(alice.state).toMatchObject({ language: 'it', public: true })

    const other = createWorld()
    const carol = await other.join('Carol', { lang: 'klingon' })
    expect(carol.state!.language).toBe('en')
  })

  it('trims and caps names, and falls back to the name as avatar seed', async () => {
    const world = createWorld()
    const long = await world.join(`  ${'x'.repeat(40)}  `, { token: 'long' })
    const me = long.state!.players.find(p => p.id === long.id)!
    expect(me.name).toBe('x'.repeat(MAX_NAME_LENGTH))
    expect(me.avatar).toBe(me.name)

    const seeded = await world.join('Seeded', { avatar: 'fox' })
    expect(seeded.state!.players.find(p => p.id === seeded.id)!.avatar).toBe('fox')
  })

  it('keeps the name colour a player picked, or gives them a stable one', async () => {
    const world = createWorld()
    const picked = await world.join('Picked', { color: '#1F8F95' })
    const unknown = await world.join('Unknown', { color: 'red' })
    const colorOf = (id: string) => picked.state!.players.find(p => p.id === id)!.color

    expect(colorOf(picked.id)).toBe('#1f8f95')
    expect(colorOf(unknown.id)).toBe(defaultNameColor(unknown.id))

    await world.join('Picked', { color: '#cf3a8a' })
    world.hibernate()
    await unknown.send({ t: 'chat', text: 'hi' })
    expect(colorOf(picked.id)).toBe('#cf3a8a')
    expect(picked.last('chat')).toMatchObject({ sender: 'Unknown', color: defaultNameColor(unknown.id) })
  })

  it('turns away a socket without a name or token', async () => {
    const world = createWorld()
    const nameless = await world.join('  ')
    expect(nameless.closed?.code).toBe(1008)
    expect(nameless.all('welcome')).toEqual([])

    const res = await world.request(`/parties/game-room/${ROOM}?name=Alice&v=${PROTOCOL_VERSION}`)
    expect(res.webSocket?.closed?.code).toBe(1008)
  })

  it('gives a returning token its old seat', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await bob.disconnect()
    const again = await world.join('Robert', { token: bob.token })

    expect(again.id).toBe(bob.id)
    expect(again.state!.players.map(p => p.name)).toEqual(['Alice', 'Robert'])
    expect(alice.state!.players).toHaveLength(2)
  })

  it('tells a client built for another protocol version to reload, without seating it', async () => {
    const world = createWorld()
    const alice = await world.join('Alice')
    for (const version of [null, '0', String(PROTOCOL_VERSION + 1)]) {
      const stale = await world.join('Stale', { version })
      expect(stale.last('outdated')).toBeDefined()
      expect(stale.closed?.code).toBe(OUTDATED_CLOSE_CODE)
      expect(stale.all('welcome')).toEqual([])
    }
    expect(alice.state!.players.map(p => p.name)).toEqual(['Alice'])
  })

  it('ignores frames it cannot read', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    bob.clear()
    for (const frame of ['not json', 'null', '42', '{"t":"nope"}', '{"t":"guess","text":7}'])
      await alice.sendRaw(frame)
    expect(bob.messages).toEqual([])
  })
})

describe('the worker', () => {
  it('only lets allowed origins open a socket', async () => {
    const world = createWorld({ ALLOWED_ORIGINS: 'https://skizz.app, http://localhost:3000' })
    const evil = await world.request(`/parties/game-room/${ROOM}?token=t&name=Eve`, 'https://evil.example')
    expect(evil.status).toBe(403)

    const local = await world.join('Dev', { origin: 'http://localhost:3000' })
    expect(local.id).toBeTruthy()
  })

  it('rejects malformed room codes and unknown paths', async () => {
    const world = createWorld()
    expect((await world.request('/parties/game-room/NOT-A-CODE?token=t&name=A')).status).toBe(404)
    expect((await world.request('/elsewhere')).status).toBe(404)
  })
})
