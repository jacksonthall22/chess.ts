// NOTE: This skips a bunch of stuff for now.
// This only implements enough for `pgn.ts` to work.

import { parseSquare, Square, SQUARE_NAMES } from './index'

/**
 * Details of an arrow to be drawn.
 */
export class Arrow {
  /** Start square of the arrow. */
  tail: Square

  /** End square of the arrow. */
  head: Square

  /** Arrow color. */
  color: string

  constructor(
    tail: Square,
    head: Square,
    { color = 'green' }: { color?: string } = {},
  ) {
    this.tail = tail
    this.head = head
    this.color = color
  }

  /**
   * Returns the arrow in the format used by ``[%csl ...]`` and
   * ``[%cal ...]`` PGN annotations, e.g., ``Ga1`` or ``Ya2h2``.
   *
   * Colors other than ``red``, ``yellow``, and ``blue`` default to green.
   */
  pgn(): string {
    let color: string
    if (this.color === 'red') {
      color = 'R'
    } else if (this.color === 'yellow') {
      color = 'Y'
    } else if (this.color === 'blue') {
      color = 'B'
    } else {
      color = 'G'
    }

    if (this.tail === this.head) {
      return `${color}${SQUARE_NAMES[this.tail]}`
    } else {
      return `${color}${SQUARE_NAMES[this.tail]}${SQUARE_NAMES[this.head]}`
    }
  }

  // __str__()
  toString(): string {
    return this.pgn()
  }

  // __repr__()
  toRepr(): string {
    return `Arrow(${SQUARE_NAMES[this.tail].toUpperCase()}, ${SQUARE_NAMES[this.head].toUpperCase()}, color=${this.color})`
  }

  /**
   * Parses an arrow from the format used by ``[%csl ...]`` and
   * ``[%cal ...]`` PGN annotations, e.g., ``Ga1`` or ``Ya2h2``.
   *
   * Also allows skipping the color prefix, defaulting to green.
   *
   * :raises: :exc:`ValueError` if the format is invalid.
   */
  static fromPgn(pgn: string): Arrow {
    let color: string
    if (pgn.startsWith('G')) {
      color = 'green'
      pgn = pgn.slice(1)
    } else if (pgn.startsWith('R')) {
      color = 'red'
      pgn = pgn.slice(1)
    } else if (pgn.startsWith('Y')) {
      color = 'yellow'
      pgn = pgn.slice(1)
    } else if (pgn.startsWith('B')) {
      color = 'blue'
      pgn = pgn.slice(1)
    } else {
      color = 'green'
    }

    const tail = parseSquare(pgn.slice(0, 2))
    const head = pgn.length > 2 ? parseSquare(pgn.slice(2)) : tail
    return new this(tail, head, { color })
  }
}

export default {
  Arrow,
}
