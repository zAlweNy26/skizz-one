/**
 * End-to-end check against a running `wrangler dev` of the realtime worker.
 *
 *   bun run dev:realtime --port 8799   # one terminal
 *   bun run test:realtime              # another
 */

const PORT = process.env.REALTIME_PORT ?? '8799'
const ROOM = crypto.randomUUID().slice(0, 8)
const BASE = `ws://127.0.0.1:${PORT}/parties/game-room`

/** Mirrors `AWAY_GRACE_MS` in the protocol. */
const AWAY_GRACE_MS = 60_000

/** Mirrors `PUBLIC_ROOM_CAP` in the protocol. */
const PUBLIC_ROOM_CAP = 10

let failures = 0

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

function connect(playerId, name, room = ROOM, extra = '') {
  const ws = new WebSocket(`${BASE}/${room}?playerId=${playerId}&name=${name}${extra}`)
  ws.inbox = []
  ws.addEventListener('message', (e) => {
    try {
      ws.inbox.push(JSON.parse(e.data))
    } catch {
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

/** A kicked socket is told so before the server closes it; the close frame itself can lag. */
async function waitKicked(ws, ms = 4000) {
  return Boolean(await waitFor(ws, m => m.t === 'kicked', ms))
}

function lobbySocket() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/parties/lobby/global`)
  ws.inbox = []
  ws.addEventListener('message', e => ws.inbox.push(JSON.parse(e.data)))
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(ws))
    ws.addEventListener('error', reject)
  })
}

async function publicRooms() {
  const lobby = await lobbySocket()
  const listed = id => m => m.t === 'rooms' && m.rooms.some(r => r.id === id)
  const entry = (m, id) => m?.rooms?.find(r => r.id === id)
  check('the lobby sends the room list on connect', Boolean(await waitFor(lobby, m => m.t === 'rooms')))

  const hidden = crypto.randomUUID().slice(0, 8)
  const p1 = await connect('pub-p', 'Pat', hidden)
  await waitFor(p1, m => m.t === 'welcome')
  check('a private room is never listed', !(await waitFor(lobby, listed(hidden), 800)))

  const room = crypto.randomUUID().slice(0, 8)
  const h = await connect('pub-h', 'Hugo', room, '&public=1')
  const welcome = await waitFor(h, m => m.t === 'welcome')
  check('quick play creates a public room', welcome?.state?.public === true)
  const first = await waitFor(lobby, listed(room))
  check('a public room shows up in the lobby', entry(first, room)?.hostName === 'Hugo'
  && entry(first, room)?.players === 1, JSON.stringify(entry(first, room)))

  const j = await connect('pub-j', 'Jo', room, '&public=1')
  await waitFor(j, m => m.t === 'welcome')
  const two = await waitFor(lobby, m => entry(m, room)?.players === 2)
  check('the listing follows the player count', Boolean(two))
  check('joining an existing room with the flag changes nothing', j.inbox.find(m => m.t === 'welcome')?.state?.public)

  lobby.inbox.length = 0
  send(j, { t: 'settings', settings: { public: false } })
  check('only the host can make a room private', !(await waitFor(lobby, m => m.t === 'rooms' && !entry(m, room), 800)))
  send(h, { t: 'settings', settings: { public: false } })
  check('a room made private leaves the lobby', Boolean(await waitFor(lobby, m => m.t === 'rooms' && !entry(m, room))))
  send(h, { t: 'settings', settings: { public: true } })
  check('and comes back when made public again', Boolean(await waitFor(lobby, listed(room))))

  const others = []
  for (let i = 0; i < PUBLIC_ROOM_CAP - 2; i++) {
    const ws = await connect(`pub-${i}`, `P${i}`, room)
    await waitFor(ws, m => m.t === 'welcome')
    others.push(ws)
  }
  const extra = await connect('pub-extra', 'Xan', room)
  check('a full public room turns newcomers away', Boolean(await waitFor(extra, m => m.t === 'roomFull')))
  check('a turned-away newcomer gets no welcome', !extra.inbox.some(m => m.t === 'welcome'))
  others.at(-1).close()
  await sleep(300)
  const back = await connect(`pub-${PUBLIC_ROOM_CAP - 3}`, 'Again', room)
  check('a player coming back to their seat is let in', Boolean(await waitFor(back, m => m.t === 'welcome')))
  for (const ws of [...others, back]) ws.close()

  h.close()
  j.close()
  const emptied = await waitFor(lobby, m => m.t === 'rooms' && !entry(m, room), AWAY_GRACE_MS + 5000)
  check('an empty room leaves the lobby once its players\' grace runs out', Boolean(emptied))

  for (const ws of [p1, lobby]) ws.close()
}

async function kicking() {
  const room = crypto.randomUUID().slice(0, 8)
  const h = await connect('kick-h', 'Hana', room)
  await waitFor(h, m => m.t === 'welcome')
  const p = await connect('kick-p', 'Pia', room)
  const q = await connect('kick-q', 'Quin', room)
  const r = await connect('kick-r', 'Rex', room)
  await waitFor(h, m => m.t === 'state' && m.state.players.length === 4)
  const inRoom = (m, id) => m.state.players.some(pl => pl.id === id)

  h.inbox.length = 0
  send(p, { t: 'kick', target: 'kick-r', want: true })
  const oneVote = await waitFor(h, m => m.t === 'state' && m.state.kickVotes['kick-r']?.length === 1)
  check('a kick vote is tallied in the state', Boolean(oneVote))
  const asked = h.inbox.find(m => m.t === 'log' && m.key === 'kickRequested')
  check('the chat hears who wants to kick whom', asked?.params?.target === 'Rex' && asked?.params?.needed === 2,
    JSON.stringify(asked?.params))

  h.inbox.length = 0
  send(p, { t: 'kick', target: 'kick-r', want: false })
  const withdrawn = await waitFor(h, m => m.t === 'state' && !m.state.kickVotes['kick-r'])
  check('a kick vote can be taken back', Boolean(withdrawn))

  h.inbox.length = 0
  send(p, { t: 'kick', target: 'kick-r', want: true })
  send(q, { t: 'kick', target: 'kick-r', want: true })
  check('a majority kicks the player', await waitKicked(r))
  const gone = await waitFor(h, m => m.t === 'state' && !inRoom(m, 'kick-r'))
  check('a kicked player leaves the roster', Boolean(gone))
  check('the room hears about the kick', h.inbox.some(m => m.t === 'log' && m.key === 'kicked'))

  const r2 = await connect('kick-r', 'Rex', room)
  check('a kicked player cannot come back', await waitKicked(r2))
  check('a kicked player gets no welcome', !r2.inbox.some(m => m.t === 'welcome'))

  send(h, { t: 'kick', target: 'kick-q', want: true })
  check('the host\'s vote alone does not kick', !(await waitKicked(q, 600)))
  send(p, { t: 'kick', target: 'kick-q', want: true })
  check('the host needs a majority like everyone else', await waitKicked(q))

  h.inbox.length = 0
  send(h, { t: 'kick', target: 'kick-p', want: true })
  send(p, { t: 'kick', target: 'kick-h', want: true })
  const lone = await waitFor(h, m => m.t === 'state' && Object.keys(m.state.kickVotes).length, 600)
  check('nobody can vote to kick with two players', !lone)

  const s = await connect('kick-s', 'Sol', room)
  await waitFor(h, m => m.t === 'state' && inRoom(m, 'kick-s'))
  h.inbox.length = 0
  send(h, { t: 'start' })
  const choosing = await waitFor(h, m => m.t === 'state' && m.state.phase === 'choosing')
  const drawer = choosing?.state?.drawerId
  h.inbox.length = 0
  const others = [[h, 'kick-h'], [p, 'kick-p'], [s, 'kick-s']].filter(([, id]) => id !== drawer)
  for (const [ws] of others) send(ws, { t: 'kick', target: drawer, want: true })

  const watcher = others[0][0]
  const moved = await waitFor(watcher, m => m.t === 'state' && m.state.phase === 'choosing' && m.state.drawerId !== drawer)
  check('kicking the drawer moves the turn on', Boolean(moved), moved?.state?.drawerId)
  if (drawer === 'kick-h')
    check('kicking the host hands the room over', moved?.state?.hostId && moved.state.hostId !== 'kick-h')

  for (const ws of [h, p, s]) ws.close()
}

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

  // --- settings ---------------------------------------------------------
  check('room starts in English', welcomeA?.state?.language === 'en', welcomeA?.state?.language)
  check('room starts on the default draw time', welcomeA?.state?.drawTime === 80, welcomeA?.state?.drawTime)

  a.inbox.length = 0
  send(b, { t: 'settings', settings: { language: 'it' } })
  const ignored = await waitFor(a, m => m.t === 'state', 800)
  check('only the host can change the settings', ignored === null, ignored?.state?.language)

  b.inbox.length = 0
  send(a, {
    t: 'settings',
    settings: {
      language: 'it',
      drawTime: 9999,
      totalRounds: 1,
      hints: 'lots',
      customWords: ['Zeppelin', 'rock-n-roll', 'zeppelin'],
    },
  })
  const switched = await waitFor(b, m => m.t === 'state' && m.state.language === 'it')
  check('host switches the room to Italian', Boolean(switched))
  check('draw time is clamped to 240 s', switched?.state?.drawTime === 240, switched?.state?.drawTime)
  check('rounds are clamped to 2', switched?.state?.totalRounds === 2, switched?.state?.totalRounds)
  check('a malformed hint count is ignored', switched?.state?.hints === 2, switched?.state?.hints)
  check('custom words are counted, cleaned', switched?.state?.customWordCount === 1, switched?.state?.customWordCount)

  const hostWords = await waitFor(a, m => m.t === 'customWords')
  check('the host gets the custom words back', JSON.stringify(hostWords?.words) === '["zeppelin"]',
    JSON.stringify(hostWords?.words))
  const guestWords = b.inbox.find(m => m.t === 'customWords')
  const leakedWord = b.inbox.some(m => JSON.stringify(m).includes('zeppelin'))
  check('other players never see the custom words', !guestWords && !leakedWord)

  send(a, { t: 'settings', settings: { drawTime: 80 } })
  await waitFor(b, m => m.t === 'state' && m.state.drawTime === 80)

  // --- the word must never be broadcast ---------------------------------
  a.inbox.length = 0
  b.inbox.length = 0
  send(a, { t: 'start' })

  const choosing = await waitFor(a, m => m.t === 'state' && m.state.phase === 'choosing')
  check('the turn opens with the drawer choosing', Boolean(choosing))
  const drawer = choosing?.state?.drawerId
  const drawerWs = drawer === 'player-a' ? a : b
  const watcherWs = drawer === 'player-a' ? b : a
  const watcherId = drawer === 'player-a' ? 'player-b' : 'player-a'
  const choices = await waitFor(drawerWs, m => m.t === 'choices')
  check('the drawer is offered three words', choices?.words?.length === 3, JSON.stringify(choices?.words))
  check('the watcher is offered nothing', !watcherWs.inbox.some(m => m.t === 'choices'))
  check('no word is set while choosing', choosing?.state?.hint === '', choosing?.state?.hint)

  check('the drawer can swap the words once', choices?.canReroll === true)
  send(watcherWs, { t: 'reroll' })
  check('only the drawer can swap the words', !(await waitFor(watcherWs, m => m.t === 'choices', 500)))

  drawerWs.inbox.length = 0
  send(drawerWs, { t: 'reroll' })
  const rerolled = await waitFor(drawerWs, m => m.t === 'choices')
  check('the drawer gets three new words', rerolled?.words?.length === 3
  && rerolled.words.every(w => !choices.words.includes(w)), JSON.stringify(rerolled?.words))
  check('the swap is used up', rerolled?.canReroll === false)
  drawerWs.inbox.length = 0
  send(drawerWs, { t: 'reroll' })
  check('a second swap is ignored', !(await waitFor(drawerWs, m => m.t === 'choices', 500)))

  send(watcherWs, { t: 'choose', index: 0 })
  check('only the drawer can choose', !(await waitFor(watcherWs, m => m.t === 'turn', 500)))

  send(drawerWs, { t: 'choose', index: 1 })
  const turnA = await waitFor(a, m => m.t === 'turn')
  const turnB = await waitFor(b, m => m.t === 'turn')
  check('a turn starts for both', Boolean(turnA && turnB))
  const drawerTurn = drawer === 'player-a' ? turnA : turnB
  const watcherTurn = drawer === 'player-a' ? turnB : turnA

  check('drawer receives the word', typeof drawerTurn?.word === 'string' && drawerTurn.word.length > 0)
  check('the word is the one chosen', drawerTurn?.word === rerolled?.words?.[1], drawerTurn?.word)
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
  // x, y, ms since the stroke began — POINT_STRIDE numbers per point.
  const pts = [100, 200, 0, 1500, 8000, 16]
  send(drawerWs, { t: 'draw', id: 'stroke-1', pts })
  send(drawerWs, { t: 'commit', id: 'stroke-1', svg: '<path d="M 10,20 L 150,800"/>' })

  const gotStart = await waitFor(watcherWs, m => m.t === 'strokeStart' && m.id === 'stroke-1')
  const gotDraw = await waitFor(watcherWs, m => m.t === 'draw' && m.id === 'stroke-1')
  const gotCommit = await waitFor(watcherWs, m => m.t === 'commit' && m.id === 'stroke-1')
  check('watcher receives strokeStart', Boolean(gotStart))
  check('watcher receives the points', Boolean(gotDraw), JSON.stringify(gotDraw?.pts))
  check('points survive the trip intact', JSON.stringify(gotDraw?.pts) === JSON.stringify(pts))
  check('watcher receives the authoritative commit', gotCommit?.svg === '<path d="M 10,20 L 150,800"/>')

  // --- drawer enforcement -----------------------------------------------
  drawerWs.inbox.length = 0
  send(watcherWs, { t: 'strokeStart', id: 'forged', brush })
  send(watcherWs, { t: 'draw', id: 'forged', pts: [1, 2] })
  await sleep(600)
  const forged = drawerWs.inbox.find(m => m.id === 'forged')
  check('a watcher cannot draw', !forged, forged ? JSON.stringify(forged) : '')

  // --- the cached canvas is capped ---------------------------------------
  watcherWs.inbox.length = 0
  drawerWs.inbox.length = 0
  const huge = `<path d="M 0,0 ${'L 1,1 '.repeat(200_000)}"/>`
  send(drawerWs, { t: 'commit', id: 'huge', svg: huge })
  const resync = await waitFor(watcherWs, m => m.t === 'canvas')
  check('an oversized commit resyncs watchers to the cached canvas', resync?.svg?.includes('M 10,20')
  && !resync.svg.includes('huge') && resync.svg.length < 1000, `${resync?.svg?.length} chars`)
  check('the oversized commit is not relayed', !watcherWs.inbox.some(m => m.t === 'commit' && m.id === 'huge'))
  check('the drawer hears the canvas is full', Boolean(await waitFor(drawerWs, m => m.t === 'log' && m.key === 'canvasFull')))
  check('the drawer is resynced too', drawerWs.inbox.some(m => m.t === 'canvas'))

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

  send(watcherWs, { t: 'guess', text: drawerTurn.word.slice(0, -1) })
  check('a near miss is flagged as close', Boolean(await waitFor(watcherWs, m => m.t === 'log' && m.key === 'close')))

  watcherWs.inbox.length = 0
  drawerWs.inbox.length = 0
  send(watcherWs, { t: 'guess', text: drawerTurn.word })
  const announce = await waitFor(drawerWs, m => m.t === 'log' && m.key === 'guessed')
  check('a correct guess announces the guesser', announce?.params?.name === 'Bob', JSON.stringify(announce?.params))

  const leaked = drawerWs.inbox.find(m => m.t === 'chat' && m.text === drawerTurn.word)
  check('the winning guess is NEVER echoed', !leaked, leaked ? JSON.stringify(leaked) : '')

  const scored = await waitFor(watcherWs, m => m.t === 'state' && m.state.players.some(p => p.points > 0))
  check(
    'points are awarded',
    Boolean(scored),
    JSON.stringify(scored?.state?.players?.map(p => `${p.name}:${p.points}`)),
  )

  const ranks = scored?.state?.players?.map(p => p.rank).sort() ?? []
  check('every player has a place of their own', JSON.stringify(ranks) === JSON.stringify(ranks.map((_, i) => i + 1)),
    JSON.stringify(ranks))
  check('shown points are whole', scored?.state?.players?.every(p => Number.isInteger(p.points)))

  // --- private chat once you've guessed ---------------------------------
  for (const ws of [a, b, c]) ws.inbox.length = 0
  send(watcherWs, { t: 'guess', text: 'psst, easy one' })
  const toDrawer = await waitFor(drawerWs, m => m.t === 'chat' && m.text === 'psst, easy one')
  check('a guesser\'s chat reaches the drawer, marked private', toDrawer?.private === true, JSON.stringify(toDrawer))
  send(drawerWs, { t: 'guess', text: 'thanks!' })
  const toGuesser = await waitFor(watcherWs, m => m.t === 'chat' && m.text === 'thanks!')
  check('the drawer can chat back privately', toGuesser?.private === true, JSON.stringify(toGuesser))
  await sleep(400)
  const overheard = c.inbox.find(m => m.t === 'chat')
  check('a player still guessing sees none of it', !overheard, overheard ? JSON.stringify(overheard) : '')

  // --- reacting to the drawing ------------------------------------------
  for (const ws of [a, b, c]) ws.inbox.length = 0
  const pointsBefore = JSON.stringify(scored?.state?.players?.map(p => p.points))
  send(watcherWs, { t: 'react', reaction: 'like' })
  const liked = await waitFor(drawerWs, m => m.t === 'state' && m.state.reactions[watcherId] === 'like')
  check('the drawer sees a like', Boolean(liked), JSON.stringify(liked?.state?.reactions))
  check('a reaction does not score', JSON.stringify(liked?.state?.players?.map(p => p.points)) === pointsBefore)
  send(watcherWs, { t: 'react', reaction: null })
  const unliked = await waitFor(drawerWs, m => m.t === 'state' && !(watcherId in m.state.reactions))
  check('a reaction can be taken back', Boolean(unliked))
  drawerWs.inbox.length = 0
  send(drawerWs, { t: 'react', reaction: 'like' })
  await sleep(400)
  check('the drawer cannot react to their own drawing', !drawerWs.inbox.some(m => m.t === 'state'))

  // --- pausing takes everyone -------------------------------------------
  for (const ws of [a, b, c]) ws.inbox.length = 0
  send(a, { t: 'pause', want: true })
  send(b, { t: 'pause', want: true })
  const twoVotes = await waitFor(c, m => m.t === 'state' && m.state.pauseVotes.length === 2)
  check('votes are tallied in the state', Boolean(twoVotes))
  const asked = c.inbox.find(m => m.t === 'log' && m.key === 'pauseRequested')
  check('the chat hears who asked for a pause', asked?.params?.votes === 1 && asked?.params?.needed === 3,
    JSON.stringify(asked?.params))
  check('two of three votes do not pause', twoVotes?.state?.paused === false)

  send(c, { t: 'pause', want: true })
  const pausedState = await waitFor(a, m => m.t === 'state' && m.state.paused)
  check('a unanimous vote pauses the game', Boolean(pausedState))
  check('the countdown is frozen', pausedState?.state?.endsAt === null && pausedState?.state?.remainingMs > 0,
    `endsAt=${pausedState?.state?.endsAt} remainingMs=${pausedState?.state?.remainingMs}`)
  check('votes reset after pausing', pausedState?.state?.pauseVotes?.length === 0)

  watcherWs.inbox.length = 0
  send(drawerWs, { t: 'strokeStart', id: 'frozen', brush })
  send(c, { t: 'guess', text: drawerTurn.word })
  const onHold = await waitFor(c, m => m.t === 'log' && m.key === 'guessOnHold')
  check('guessing is on hold while paused', Boolean(onHold))
  a.inbox.length = 0
  send(c, { t: 'guess', text: 'still thinking' })
  const pausedChat = await waitFor(a, m => m.t === 'chat' && m.text === 'still thinking')
  check('players can still chat while paused', pausedChat && !pausedChat.private)
  const frozenStroke = watcherWs.inbox.find(m => m.id === 'frozen')
  check('the drawer cannot draw while paused', !frozenStroke)

  // --- resuming takes a majority ----------------------------------------
  a.inbox.length = 0
  send(a, { t: 'pause', want: true })
  const oneResume = await waitFor(a, m => m.t === 'state' && m.state.pauseVotes.length === 1)
  check('one of three votes does not resume', oneResume?.state?.paused === true)
  check('the chat hears who asked to resume', a.inbox.some(m => m.t === 'log' && m.key === 'resumeRequested'))
  send(b, { t: 'pause', want: true })
  const resumed = await waitFor(a, m => m.t === 'state' && !m.state.paused)
  check('a majority resumes the game', Boolean(resumed))
  check('the countdown runs again', typeof resumed?.state?.endsAt === 'number')

  // --- a short absence keeps the seat -------------------------------------
  a.inbox.length = 0
  b.close()
  const bobOf = m => m.state.players.find(p => p.id === 'player-b')
  const away = await waitFor(a, m => m.t === 'state' && bobOf(m)?.away)
  check('a dropped player is shown as away', Boolean(away))
  check('an away player keeps their seat', bobOf(away ?? { state: { players: [] } })?.connected === true)
  a.inbox.length = 0
  const b2 = await connect('player-b', 'Bob')
  const back = await waitFor(a, m => m.t === 'state' && bobOf(m)?.away === false)
  check('coming back clears away', Boolean(back))
  check('a short absence is not announced', !a.inbox.some(m => m.t === 'log' && m.key === 'disconnected'))

  // --- the last player standing wins --------------------------------------
  a.inbox.length = 0
  b2.close()
  await sleep(1000)
  c.close()
  const leaveWait = AWAY_GRACE_MS + 5000
  const twoLeft = await waitFor(a, m => m.t === 'state' && bobOf(m)?.connected === false, leaveWait)
  check('an away player leaves once the grace runs out', Boolean(twoLeft))
  check('the game goes on with two players left', twoLeft && twoLeft.state.phase !== 'finished',
    twoLeft?.state?.phase)
  const finished = await waitFor(a, m => m.t === 'state' && m.state.phase === 'finished', leaveWait)
  check('the game ends when one player is left', Boolean(finished))
  check('the winner is announced', a.inbox.some(m => m.t === 'log' && m.key === 'winner'))
  check('nothing is paused after the game ends', finished?.state?.paused === false)

  const awardOf = key => finished?.state?.awards?.find(award => award.key === key)
  check('the fastest guess wins an award', awardOf('fastest')?.playerId === watcherId
  && awardOf('fastest').value > 0, JSON.stringify(awardOf('fastest')))
  check('the near miss wins "almost had it"', awardOf('almostHadIt')?.playerId === watcherId,
    JSON.stringify(awardOf('almostHadIt')))
  check('the guessed drawer wins "Picasso"', awardOf('picasso')?.playerId === drawer,
    JSON.stringify(awardOf('picasso')))
  check('no likes means no "most liked"', !awardOf('mostLiked'))
  check('awards stay out of a running game', welcomeA?.state?.awards?.length === 0)

  a.close()
  await sleep(200)

  await kicking()
  await publicRooms()

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
