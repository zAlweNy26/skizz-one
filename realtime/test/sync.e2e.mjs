/**
 * End-to-end check against a running `wrangler dev` of the realtime worker.
 *
 * Drives two real WebSocket clients through a round and asserts that the
 * drawing actually reaches the watcher, that a non-drawer cannot draw, and
 * that the word never leaks to anyone who is supposed to be guessing it.
 *
 *   bun run dev:realtime --port 8799   # one terminal
 *   bun run test:realtime              # another
 */

const PORT = process.env.REALTIME_PORT ?? '8799'
// A fresh room per run: a Durable Object keeps its state, so reusing a name
// would carry the previous run's roster and scores into this one.
const ROOM = `test-${crypto.randomUUID().slice(0, 8)}`
const BASE = `ws://127.0.0.1:${PORT}/parties/game-room/${ROOM}`

let failures = 0

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

function connect(playerId, name) {
  const ws = new WebSocket(`${BASE}?playerId=${playerId}&name=${name}`)
  ws.inbox = []
  ws.addEventListener('message', (e) => {
    try {
      ws.inbox.push(JSON.parse(e.data))
    }
    catch {
      // A frame we can't parse is not part of any assertion.
    }
  })
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(ws))
    ws.addEventListener('error', reject)
    setTimeout(() => reject(new Error(`timeout connecting ${name}`)), 10_000)
  })
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Wait until a message matching `pred` arrives, or give up. */
async function waitFor(ws, pred, ms = 4000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const hit = ws.inbox.find(pred)
    if (hit) return hit
    await sleep(50)
  }
  return null
}

const send = (ws, msg) => ws.send(JSON.stringify(msg))

async function main() {
  const a = await connect('player-a', 'Alice')
  const b = await connect('player-b', 'Bob')

  // --- joining ----------------------------------------------------------
  const welcomeA = await waitFor(a, m => m.t === 'welcome')
  const welcomeB = await waitFor(b, m => m.t === 'welcome')
  check('both players get a welcome', Boolean(welcomeA && welcomeB))
  check('welcome carries own id', welcomeA?.you === 'player-a', welcomeA?.you)
  check('first player is host', welcomeA?.state?.hostId === 'player-a', welcomeA?.state?.hostId)

  await sleep(300)
  const rosterA = await waitFor(a, m => m.t === 'state' && m.state.players.length === 2)
  check('roster reaches two players', Boolean(rosterA), `${rosterA?.state?.players?.length ?? 0}`)

  // --- the word must never be broadcast ---------------------------------
  a.inbox.length = 0
  b.inbox.length = 0
  send(a, { t: 'start' })

  const turnA = await waitFor(a, m => m.t === 'turn')
  const turnB = await waitFor(b, m => m.t === 'turn')
  check('a turn starts for both', Boolean(turnA && turnB))

  const drawer = turnA?.drawerId
  const drawerWs = drawer === 'player-a' ? a : b
  const watcherWs = drawer === 'player-a' ? b : a
  const drawerTurn = drawer === 'player-a' ? turnA : turnB
  const watcherTurn = drawer === 'player-a' ? turnB : turnA

  check('drawer receives the word', typeof drawerTurn?.word === 'string' && drawerTurn.word.length > 0)
  check('watcher receives NO word', watcherTurn?.word === undefined, JSON.stringify(watcherTurn?.word))
  check('watcher gets a masked hint', /^_+$/.test((watcherTurn?.hint ?? '').replace(/ /g, '')), watcherTurn?.hint)
  check(
    'hint length matches the word',
    drawerTurn?.word?.length === watcherTurn?.hint?.length,
    `${drawerTurn?.word?.length} vs ${watcherTurn?.hint?.length}`,
  )

  // --- streaming a stroke -----------------------------------------------
  watcherWs.inbox.length = 0
  const brush = { mode: 'draw', color: '#000000', size: 16 }
  send(drawerWs, { t: 'strokeStart', id: 'stroke-1', brush })
  send(drawerWs, { t: 'draw', id: 'stroke-1', pts: [100, 200, 1500, 8000] })
  send(drawerWs, { t: 'commit', id: 'stroke-1', svg: '<path d="M 10,20 L 150,800"/>' })

  const gotStart = await waitFor(watcherWs, m => m.t === 'strokeStart' && m.id === 'stroke-1')
  const gotDraw = await waitFor(watcherWs, m => m.t === 'draw' && m.id === 'stroke-1')
  const gotCommit = await waitFor(watcherWs, m => m.t === 'commit' && m.id === 'stroke-1')
  check('watcher receives strokeStart', Boolean(gotStart))
  check('watcher receives the points', Boolean(gotDraw), JSON.stringify(gotDraw?.pts))
  check('points survive the trip intact', JSON.stringify(gotDraw?.pts) === JSON.stringify([100, 200, 1500, 8000]))
  check('watcher receives the authoritative commit', gotCommit?.svg === '<path d="M 10,20 L 150,800"/>')

  // --- drawer enforcement -----------------------------------------------
  drawerWs.inbox.length = 0
  send(watcherWs, { t: 'strokeStart', id: 'forged', brush })
  send(watcherWs, { t: 'draw', id: 'forged', pts: [1, 2] })
  await sleep(600)
  const forged = drawerWs.inbox.find(m => m.id === 'forged')
  check('a watcher cannot draw', !forged, forged ? JSON.stringify(forged) : '')

  // --- late joiner gets the canvas --------------------------------------
  const c = await connect('player-c', 'Carol')
  const canvasC = await waitFor(c, m => m.t === 'canvas')
  check('late joiner receives the cached canvas', Boolean(canvasC))
  check(
    'cached canvas contains the committed stroke',
    canvasC?.svg?.includes('M 10,20'),
    canvasC?.svg?.slice(0, 60),
  )
  const welcomeC = await waitFor(c, m => m.t === 'welcome')
  check(
    'late joiner is not told the word',
    !JSON.stringify(welcomeC?.state ?? {}).includes(drawerTurn?.word ?? ' '),
  )

  // --- guessing ---------------------------------------------------------
  watcherWs.inbox.length = 0
  drawerWs.inbox.length = 0
  send(watcherWs, { t: 'guess', text: 'definitely-not-the-word' })
  const wrongEcho = await waitFor(drawerWs, m => m.t === 'chat' && m.text === 'definitely-not-the-word')
  check('a wrong guess is broadcast as chat', Boolean(wrongEcho))

  watcherWs.inbox.length = 0
  drawerWs.inbox.length = 0
  send(watcherWs, { t: 'guess', text: drawerTurn.word })
  const announce = await waitFor(drawerWs, m => m.t === 'log' && /guessed the word/.test(m.message ?? ''))
  check('a correct guess announces the guesser', Boolean(announce), announce?.message)

  const leaked = drawerWs.inbox.find(m => m.t === 'chat' && m.text === drawerTurn.word)
  check('the winning guess is NEVER echoed', !leaked, leaked ? JSON.stringify(leaked) : '')

  const scored = await waitFor(watcherWs, m => m.t === 'state' && m.state.players.some(p => p.points > 0))
  check(
    'points are awarded',
    Boolean(scored),
    JSON.stringify(scored?.state?.players?.map(p => `${p.name}:${p.points}`)),
  )

  for (const ws of [a, b, c]) ws.close()
  await sleep(200)

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
