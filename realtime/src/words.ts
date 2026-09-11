/**
 * Word list for rounds.
 *
 * Bundled as a plain array on purpose: picking a word sits on the round-start
 * path, and the word must never leave the Durable Object. No I/O, no binding.
 */
const WORDS = [
  // everyday objects
  'anchor', 'balloon', 'bicycle', 'bucket', 'candle', 'compass', 'cushion',
  'envelope', 'guitar', 'hammer', 'kettle', 'ladder', 'lantern', 'mailbox',
  'mirror', 'padlock', 'pencil', 'pillow', 'scissors', 'suitcase', 'teapot',
  'telescope', 'toothbrush', 'umbrella', 'wallet', 'whistle', 'windmill',

  // animals
  'butterfly', 'chameleon', 'dolphin', 'elephant', 'flamingo', 'giraffe',
  'hedgehog', 'jellyfish', 'kangaroo', 'ladybug', 'octopus', 'ostrich',
  'panda', 'peacock', 'penguin', 'rhinoceros', 'seahorse', 'snail',
  'squirrel', 'tortoise', 'walrus', 'zebra',

  // food
  'avocado', 'baguette', 'broccoli', 'cupcake', 'doughnut', 'lollipop',
  'pancake', 'pineapple', 'popcorn', 'pretzel', 'sandwich', 'spaghetti',
  'strawberry', 'watermelon',

  // places and nature
  'campfire', 'cactus', 'castle', 'desert', 'iceberg', 'island', 'lighthouse',
  'mountain', 'rainbow', 'tornado', 'volcano', 'waterfall',

  // vehicles and machines
  'ambulance', 'helicopter', 'parachute', 'rocket', 'sailboat', 'skateboard',
  'submarine', 'tractor', 'train',

  // people and fiction
  'astronaut', 'dinosaur', 'dragon', 'ghost', 'mermaid', 'pirate', 'robot',
  'scarecrow', 'skeleton', 'snowman', 'unicorn', 'vampire', 'wizard',

  // actions and scenes
  'birthday', 'campsite', 'fireworks', 'haircut', 'picnic', 'sunset',
  'thunderstorm', 'treehouse',
] as const

/**
 * Pick `count` distinct words, avoiding any already used this game.
 *
 * Falls back to the full list once a long game has exhausted it, so a room
 * can never stall for want of an unused word.
 */
export function pickWords(count: number, used: readonly string[] = []): string[] {
  const usedSet = new Set(used)
  let pool = WORDS.filter(w => !usedSet.has(w))
  if (pool.length < count) pool = [...WORDS]

  const picked: string[] = []
  const available = [...pool]
  for (let i = 0; i < count && available.length > 0; i++) {
    const index = Math.floor(Math.random() * available.length)
    picked.push(available.splice(index, 1)[0]!)
  }
  return picked
}

export function pickWord(used: readonly string[] = []): string {
  return pickWords(1, used)[0]!
}
