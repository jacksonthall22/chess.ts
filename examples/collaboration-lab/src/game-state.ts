import type * as pgn from '@jacksonthall22/chess.ts/pgn'

export interface SemanticNodeState {
  readonly nodeId: string
  readonly moveUci: string | null
  readonly comments: readonly string[]
  readonly startingComments: readonly string[]
  readonly nags: readonly number[]
  readonly children: readonly SemanticNodeState[]
}

export interface SemanticGameState {
  readonly headers: readonly (readonly [string, string])[]
  readonly root: SemanticNodeState
}

const readNode = (node: pgn.GameNode): SemanticNodeState => ({
  nodeId: node.nodeId,
  moveUci: node.move?.uci() ?? null,
  comments: [...node.comments],
  startingComments: [...node.startingComments],
  nags: [...node.nags].sort((left, right) => left - right),
  children: node.variations.map(readNode),
})

export const readGameState = (game: pgn.Game): SemanticGameState => ({
  headers: [...game.headers.items()],
  root: readNode(game),
})

export const gameFingerprint = (game: pgn.Game): string =>
  JSON.stringify(readGameState(game))
