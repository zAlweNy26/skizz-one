export type GameLog = {
  sender: 'system'
  type: 'warning' | 'error' | 'info' | 'success'
  message: string
} | {
  sender: string & {}
  type: 'guess'
  message: string
} | {
  sender: string & {}
  type: 'path'
  message: number[]
}

export interface GamePlayer {
  id: string
  name: string
  points: number
}

export interface GameState {
  id: string
  round: number
  totalRounds: number
  host: string
  clients: GamePlayer[]
}
