declare const gameNodeIdBrand: unique symbol

/** Opaque identity for one node within a structured game lineage. */
export type GameNodeId = string & {
  readonly [gameNodeIdBrand]: true
}

const GAME_NODE_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Parses a canonical UUID-shaped game-node identity without normalization. */
export const parseGameNodeId = (value: unknown): GameNodeId => {
  if (typeof value !== 'string' || !GAME_NODE_ID_REGEX.test(value)) {
    throw new TypeError('GameNodeId must be a canonical lowercase UUID')
  }
  return value as GameNodeId
}

/** Creates a collision-resistant opaque game-node identity. */
export const createGameNodeId = (): GameNodeId => {
  if (
    typeof globalThis.crypto === 'undefined' ||
    typeof globalThis.crypto.randomUUID !== 'function'
  ) {
    throw new Error('Secure UUID generation is unavailable in this runtime')
  }
  return parseGameNodeId(globalThis.crypto.randomUUID())
}
