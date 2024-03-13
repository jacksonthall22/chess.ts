// NOTE: This skips a bunch of stuff for now.
// This only implements enough for minimal functionality of `pgn.ts`.


import * as utils from "./utils"
import * as chess from "./index"


const VARIANTS: (typeof chess.Board)[] = [
  chess.Board,
  /* TODO: Add variant board support */
  // SuicideBoard, GiveawayBoard, AntichessBoard,
  // AtomicBoard,
  // KingOfTheHillBoard,
  // RacingKingsBoard,
  // HordeBoard,
  // ThreeCheckBoard,
  // CrazyhouseBoard,
]


/**
 * Looks for a variant board class by variant name. Supports many common
 * aliases.
 */
export const findVariant = (name: string): typeof chess.Board => {
  for (const variant of VARIANTS) {
    if (utils.iterAny(variant.aliases, (alias) => alias.toLowerCase() === name.toLowerCase())) {
      return variant
    }
  }
  throw new Error(`ValueError: unsupported variant: ${name}`)
}
