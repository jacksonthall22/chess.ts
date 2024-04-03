// import engine from './engine';
import { Board, Color, Move, Square, WHITE } from './index'
import { PovScore, Cp, Score, Mate } from './engine'
import { Arrow } from './svg'
import { findVariant } from './variant'

/** ========== Custom declarations (no mirror in python-chess) ========== */

import * as utils from './utils'

/**
 * A minimal implementation of Python's `typing.TextIO` class interface.
 * Only the methods used internally by `pgn.ts` are implemented.
 */
export class StringIO {
  private buffer: string = ''

  constructor(s: string = '') {
    this.buffer = s
  }

  write(str: string): void {
    this.buffer += str
  }

  read(): string {
    return this.buffer
  }

  readline(): string {
    const index = this.buffer.indexOf('\n')
    if (index === -1) {
      const line = this.buffer
      this.buffer = ''
      return line
    }
    const line = this.buffer.slice(0, index + 1)
    this.buffer = this.buffer.slice(index + 1)
    return line
  }
}

/** ========== Direct transpilation ========== */

export const LOGGER = {
  info: (message: string) => console.info(`[pgn.ts] ${message}`),
  error: (message: string) => console.error(`[pgn.ts] ${message}`),
}

// Reference of Numeric Annotation Glyphs (NAGs):
// https://en.wikipedia.org/wiki/Numeric_Annotation_Glyphs

export const NAG_NULL = 0

/** A good move. Can also be indicated by ``!`` in PGN notation. */
export const NAG_GOOD_MOVE = 1

/** A mistake. Can also be indicated by ``?`` in PGN notation. */
export const NAG_MISTAKE = 2

/** A brilliant move. Can also be indicated by ``!!`` in PGN notation. */
export const NAG_BRILLIANT_MOVE = 3

/** A blunder. Can also be indicated by ``??`` in PGN notation. */
export const NAG_BLUNDER = 4

/** A speculative move. Can also be indicated by ``!?`` in PGN notation. */
export const NAG_SPECULATIVE_MOVE = 5

/** A dubious move. Can also be indicated by ``?!`` in PGN notation. */
export const NAG_DUBIOUS_MOVE = 6

export const NAG_FORCED_MOVE = 7
export const NAG_SINGULAR_MOVE = 8
export const NAG_WORST_MOVE = 9
export const NAG_DRAWISH_POSITION = 10
export const NAG_QUIET_POSITION = 11
export const NAG_ACTIVE_POSITION = 12
export const NAG_UNCLEAR_POSITION = 13
export const NAG_WHITE_SLIGHT_ADVANTAGE = 14
export const NAG_BLACK_SLIGHT_ADVANTAGE = 15
export const NAG_WHITE_MODERATE_ADVANTAGE = 16
export const NAG_BLACK_MODERATE_ADVANTAGE = 17
export const NAG_WHITE_DECISIVE_ADVANTAGE = 18
export const NAG_BLACK_DECISIVE_ADVANTAGE = 19

export const NAG_WHITE_ZUGZWANG = 22
export const NAG_BLACK_ZUGZWANG = 23

export const NAG_WHITE_MODERATE_COUNTERPLAY = 132
export const NAG_BLACK_MODERATE_COUNTERPLAY = 133
export const NAG_WHITE_DECISIVE_COUNTERPLAY = 134
export const NAG_BLACK_DECISIVE_COUNTERPLAY = 135
export const NAG_WHITE_MODERATE_TIME_PRESSURE = 136
export const NAG_BLACK_MODERATE_TIME_PRESSURE = 137
export const NAG_WHITE_SEVERE_TIME_PRESSURE = 138
export const NAG_BLACK_SEVERE_TIME_PRESSURE = 139

export const NAG_NOVELTY = 146

export const TAG_REGEX =
  /^\[([A-Za-z0-9][A-Za-z0-9_+#=:-]*)\s+\"([^\r]*)\"\]\s*$/

export const TAG_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9_+#=:-]*$/ // NOTE: `\Z` -> `$`

export const MOVETEXT_REGEX = new RegExp(
  '(' +
    '[NBKRQ]?[a-h]?[1-8]?[-x]?[a-h][1-8](?:=?[nbrqkNBRQK])?' +
    '|[PNBRQK]?@[a-h][1-8]' +
    '|--' +
    '|Z0' +
    '|0000' +
    '|@@@@' +
    '|O-O(?:-O)?' +
    '|0-0(?:-0)?' +
    ')' +
    '|(\\{.*)' +
    '|(;.*)' +
    '|(\\$[0-9]+)' +
    '|(\\()' +
    '|(\\))' +
    '|(\\*|1-0|0-1|1\\/2-1\\/2)' +
    '|([\\?!]{1,2})' +
    's', // `s` is equivalent to Python's `re.DOTALL`
)

export const SKIP_MOVETEXT_REGEX = /;|\{|\}/

export const CLOCK_REGEX =
  /(?<prefix>\s?)\[%clk\s(?<hours>\d+):(?<minutes>\d+):(?<seconds>\d+(?:\.\d*)?)\](?<suffix>\s?)/
export const EMT_REGEX =
  /(?<prefix>\s?)\[%emt\s(?<hours>\d+):(?<minutes>\d+):(?<seconds>\d+(?:\.\d*)?)\](?<suffix>\s?)/

export const EVAL_REGEX = new RegExp(
  '(?<prefix>\\s?)' +
    '\\[%eval\\s(?:' +
    '\\#(?<mate>[+-]?\\d+)' +
    '|(?<cp>[+-]?(?:\\d{0,10}\\.\\d{1,2}|\\d{1,10}\\.?))' +
    ')(?:' +
    ',(?<depth>\\d+)' +
    ')?\\]' +
    '(?<suffix>\\s?)',
)

export const ARROWS_REGEX = new RegExp(
  '(?<prefix>s?)' +
    '\\[%(?:csl|cal)\\s(?<arrows>' +
    '[RGYB][a-h][1-8](?:[a-h][1-8])?' +
    '(?:,[RGYB][a-h][1-8](?:[a-h][1-8])?)*' +
    ')\\]' +
    '(?<suffix>\\s?)',
)

export const _condenseAffix = (
  infix: string,
): ((substring: string, ...args: any[]) => string) => {
  return (match: string, ...groups: any[]) => {
    /*
    ChatGPT says:
    In TypeScript (and JavaScript), when you use string.replace() with a regular expression
    that contains capturing groups, and you pass a function as the replacer, this function
    receives the following arguments:

    1. The entire matched substring.
    2. The captured group values, one argument for each group.
    3. The zero-based index of the match in the whole string.
    4. The whole string being examined.
    */
    let fullMatch: string
    ;[fullMatch, ...groups] = groups
    if (groups.length < 4) {
      throw new Error(`Not enough groups in the match array. groups: ${groups}`)
    }
    const prefix = groups[0]
    const suffix = groups[-3]
    if (infix) {
      return prefix + infix + suffix
    } else {
      return prefix && suffix
    }
  }
}

export const TAG_ROSTER = [
  'Event',
  'Site',
  'Date',
  'Round',
  'White',
  'Black',
  'Result',
]

export enum SkipType {
  SKIP = 0,
  // NOTE: `python-chess` has this^ as `None`, but can't use `null` in TS enums.
  // Looks like this is not really used outside of this file anyway.
}

export const SKIP: SkipType = SkipType.SKIP

export enum TimeControlType {
  UNKNOW = 0,
  UNLIMITED = 1,
  STANDARD = 2,
  RAPID = 3,
  BLITZ = 4,
  BULLET = 5,
}

export class TimeControlPart {
  moves: number
  time: number
  increment: number
  delay: number

  constructor(
    moves: number = 0,
    time: number = 0,
    increment: number = 0,
    delay: number = 0,
  ) {
    this.moves = moves
    this.time = time
    this.increment = increment
    this.delay = delay
  }
}

/**
 * PGN TimeControl Parser
 * Spec: http://www.saremba.de/chessgml/standards/pgn/pgn-complete.htm#c9.6
 *
 * Not Yet Implemented:
 * - Hourglass/Sandclock ('*' prefix)
 * - Differentiating between Bronstein and Simple Delay (Not part of the PGN Spec)
 *   - More Info: https://en.wikipedia.org/wiki/Chess_clock#Timing_methods
 */
export class TimeControl {
  parts: TimeControlPart[]
  type: TimeControlType

  constructor(
    parts: TimeControlPart[] = [],
    type: TimeControlType = TimeControlType.UNKNOW,
  ) {
    this.parts = parts
    this.type = type
  }
}

export class _AcceptFrame {
  state: string
  node: ChildNode
  isVariation: boolean
  variations: Iterator<ChildNode>
  inVariation: boolean

  constructor(
    node: ChildNode,
    {
      isVariation = false,
      sidelines = true,
    }: { isVariation?: boolean; sidelines?: boolean } = {},
  ) {
    this.state = 'pre'
    this.node = node
    this.isVariation = isVariation
    this.variations = sidelines
      ? utils.islice(node.parent.variations, 1, null)
      : (function* () {})()
    this.inVariation = false
  }
}

export abstract class GameNode {
  /** The parent node or `null` if this is the root node of the game. */
  parent: GameNode | null

  /**
   * The move leading to this node or `null` if this is the root node of the
   * game.
   */
  move: Move | null

  /** A list of child nodes. */
  variations: ChildNode[]

  /**
   * A comment that goes behind the move leading to this node. Comments
   * that occur before any moves are assigned to the root node.
   */
  comment: string

  startingComment: string
  nags: Set<number>

  constructor({ comment = '' }: { comment?: string } = {}) {
    this.parent = null
    this.move = null
    this.variations = []
    this.comment = comment

    // Deprecated: These should be properties of ChildNode, but need to
    // remain here for backwards compatibility.
    this.startingComment = ''
    this.nags = new Set<number>()
  }

  /**
   * Gets a board with the position of the node.
   *
   * For the root node, this is the default starting position (for the
   * ``Variant``) unless the ``FEN`` header tag is set.
   *
   * It's a copy, so modifying the board will not alter the game.
   *
   * Complexity is `O(n)`.
   */
  abstract board(): Board

  /**
   * Returns the number of half-moves up to this node, as indicated by
   * fullmove number and turn of the position.
   * See :func:`Board.ply()`.
   *
   * Usually this is equal to the number of parent nodes, but it may be
   * more if the game was started from a custom position.
   *
   * Complexity is `O(n)`.
   */
  abstract ply(): number

  /**
   * Gets the color to move at this node. See :data:`Board.turn`.
   *
   * Complexity is `O(n)`.
   */
  turn(): Color {
    return this.ply() % 2 === 0
  }

  root(): GameNode {
    let node: GameNode = this
    while (node.parent) {
      node = node.parent
    }
    return node
  }

  /**
   * Gets the root node, i.e., the game.
   *
   * Complexity is `O(n)`.
   */
  game(): Game {
    const root = this.root()
    if (!(root instanceof Game)) {
      throw new Error('AssertionError: GameNode not rooted in Game')
    }
    return root
  }

  /**
   * Follows the main variation to the end and returns the last node.
   *
   * Complexity is `O(n)`.
   */
  end(): GameNode {
    let node: GameNode = this

    while (node.variations.length !== 0) {
      node = node.variations[0]
    }

    return node
  }

  /**
   * Checks if this node is the last node in the current variation.
   *
   * Complexity is `O(1)`.
   */
  isEnd(): boolean {
    return this.variations.length === 0
  }

  /**
   * Checks if this node starts a variation (and can thus have a starting
   * comment). The root node does not start a variation and can have no
   * starting comment.
   *
   * For example, in ``1. e4 e5 (1... c5 2. Nf3) 2. Nf3``, the node holding
   * 1... c5 starts a variation.
   *
   * Complexity is `O(1)`.
   */
  startsVariation(): boolean {
    if (!this.parent || this.parent.variations.length === 0) {
      return false
    }

    return this.parent.variations[0] !== (this as GameNode as ChildNode)
  }

  /**
   * Checks if the node is in the mainline of the game.
   *
   * Complexity is `O(n)`.
   */
  isMainline(): boolean {
    let node: GameNode = this

    while (node.parent) {
      const parent = node.parent

      if (!parent.variations || parent.variations[0] !== node) {
        return false
      }

      node = parent
    }

    return true
  }

  /**
   * Checks if this node is the first variation from the point of view of its
   * parent. The root node is also in the main variation.
   *
   * Complexity is `O(1)`.
   */
  is_main_variation(): boolean {
    if (this.parent === null) {
      return true
    }

    return (
      this.parent.variations.length === 0 ||
      this.parent.variations[0] === (this as GameNode as ChildNode)
    )
  }

  getitem(move: number | Move | GameNode): ChildNode {
    if (typeof move === 'number') {
      return this.variations[move]
    }

    for (const variation of this.variations) {
      if (variation.move === move || variation === move) {
        return variation
      }
    }

    throw new Error(`KeyError: ${move}`)
  }

  includes(move: number | Move | GameNode): boolean {
    try {
      this.getitem(move)
    } catch (e) {
      return false
    }
    return true
  }

  /**
   * Gets a child node by either the move or the variation index.
   */
  variation(move: number | Move | GameNode): ChildNode {
    return this.getitem(move)
  }

  /** Checks if this node has the given variation. */
  hasVariation(move: number | Move | GameNode): boolean {
    return this.includes(move)
  }

  /** Promotes the given *move* to the main variation. */
  promoteToMain(move: number | Move | GameNode): void {
    const variation = this.getitem(move)
    utils.remove(this.variations, variation)
    this.variations.unshift(variation)
  }

  /** Moves a variation one up in the list of variations. */
  promote(move: number | Move | GameNode): void {
    const variation = this.getitem(move)
    const i = this.variations.indexOf(variation)
    if (i > 0) {
      ;[this.variations[i - 1], this.variations[i]] = [
        this.variations[i],
        this.variations[i - 1],
      ]
    }
  }

  /**
   * Moves a variation one down in the list of variations.
   */
  demote(move: number | Move | GameNode): void {
    const variation = this.getitem(move)
    const i = this.variations.indexOf(variation)
    if (i < this.variations.length - 1) {
      this.variations[i + 1],
        (this.variations[i] = this.variations[i]),
        this.variations[i + 1]
    }
  }

  /**
   * Removes a variation.
   */
  removeVariation(move: number | Move | GameNode): void {
    utils.remove(this.variations, this.variation(move))
  }

  /**
   * Creates a child node with the given attributes.
   */
  addVariation(
    move: Move,
    {
      comment = '',
      startingComment = '',
      nags = [],
    }: {
      comment?: string
      startingComment?: string
      nags?: Iterable<number>
    } = {},
  ): ChildNode {
    // Instanciate ChildNode only in this method.
    return new ChildNode(this, move, { comment, startingComment, nags })
  }

  /**
   * Creates a child node with the given attributes and promotes it to the
   * main variation.
   */
  addMainVariation(
    move: Move,
    {
      comment = '',
      nags = [],
    }: { comment?: string; nags?: Iterable<number> } = {},
  ): ChildNode {
    const node = this.addVariation(move, { comment, nags })
    this.variations.unshift(this.variations.pop() as ChildNode)
    return node
  }

  /**
   * Returns the first node of the mainline after this node, or ``null`` if
   * this node does not have any children.
   *
   * Complexity is `O(1)`.
   */
  next(): ChildNode | null {
    return this.variations ? this.variations[0] : null
  }

  /**
   * Returns an iterable over the mainline starting after this node.
   */
  mainline(): Mainline<ChildNode> {
    return new Mainline(this, (node: ChildNode) => node)
  }

  /**
   * Returns an iterable over the main moves after this node.
   */
  mainlineMoves(): Mainline<Move> {
    return new Mainline(this, (node: ChildNode) => node.move)
  }

  /**
   * Creates a sequence of child nodes for the given list of moves.
   * Adds *comment* and *nags* to the last node of the line and returns it.
   */
  addLine(
    moves: Iterable<Move>,
    {
      comment = '',
      startingComment = '',
      nags = [],
    }: {
      comment?: string
      startingComment?: string
      nags?: Iterable<number>
    } = {},
  ): GameNode {
    let node: ChildNode = this as GameNode as ChildNode

    // Add line.
    for (const move of moves) {
      node = node.addVariation(move, { startingComment })
      startingComment = ''
    }

    // Merge comment and NAGs.
    if (node.comment.length !== 0) {
      node.comment += ' ' + comment
    } else {
      node.comment = comment
    }

    for (const nag of nags) {
      node.nags.add(nag)
    }

    return node
  }

  /**
   * Parses the first valid ``[%eval ...]`` annotation in the comment of
   * this node, if any.
   *
   * Complexity is `O(n)`.
   */
  eval(): PovScore | null {
    const match = this.comment.match(EVAL_REGEX)
    if (!match) {
      return null
    }

    const turn = this.turn()
    let score: Score
    if (match.groups!['mate']) {
      const mate = parseInt(match.groups!['mate'])
      score = new Mate(mate)
      if (mate === 0) {
        // Resolve this ambiguity in the specification in favor of
        // standard chess: The player to move after mate is the player
        // who has been mated.
        return new PovScore(score, turn)
      }
    } else {
      score = new Cp(Math.round(parseFloat(match.groups!['cp']) * 100))
    }

    return new PovScore(turn ? score : score.neg(), turn)
  }

  /**
   * Parses the first valid ``[%eval ...]`` annotation in the comment of
   * this node and returns the corresponding depth, if any.
   *
   * Complexity is `O(1)`.
   */
  evalDepth(): number | null {
    const match = this.comment.match(EVAL_REGEX)
    return match && match.groups!['depth']
      ? parseInt(match.groups!['depth'])
      : null
  }

  /**
   * Replaces the first valid `[%eval ...]` annotation in the comment of
   * this node or adds a new one.
   */
  setEval(score: PovScore | null, depth: number | null = null): void {
    let evalStr = ''
    if (score !== null) {
      const depthSuffix = depth === null ? '' : `,${Math.max(depth, 0)}`
      const cp = score.white().score()
      if (cp !== null) {
        evalStr = `[%eval ${(cp / 100).toFixed(2)}${depthSuffix}]`
      } else if (score.white().mate()) {
        evalStr = `[%eval #${score.white().mate()}${depthSuffix}]`
      }
    }

    let found: number
    ;[this.comment, found] = utils.subn(
      EVAL_REGEX,
      _condenseAffix(evalStr),
      this.comment,
      1,
    )

    if (!found && evalStr) {
      if (this.comment && !this.comment.endsWith(' ')) {
        this.comment += ' '
      }
      this.comment += evalStr
    }
  }

  /**
   * Parses all ``[%csl ...]`` and ``[%cal ...]`` annotations in the comment
   * of this node.
   *
   * Returns a list of :class:`arrows <svg.Arrow>`.
   */
  arrows(): Arrow[] {
    const arrows: Arrow[] = []
    for (const match of this.comment.matchAll(utils.toGlobal(ARROWS_REGEX))) {
      for (const group of match.groups!['arrows'].split(',')) {
        arrows.push(Arrow.fromPgn(group))
      }
    }

    return arrows
  }

  /**
   * Replaces all valid ``[%csl ...]`` and ``[%cal ...]`` annotations in
   * the comment of this node or adds new ones.
   */
  setArrows(arrows: Iterable<Arrow | [Square, Square]>): void {
    const csl: string[] = []
    const cal: string[] = []

    for (let arrow of arrows) {
      if (arrow instanceof Array) {
        let [tail, head] = arrow
        arrow = new Arrow(tail, head)
      }
      ;(arrow.tail === arrow.head ? csl : cal).push(arrow.pgn())
    }

    this.comment = utils.sub(ARROWS_REGEX, _condenseAffix(''), this.comment)

    let prefix = ''
    if (csl.length !== 0) {
      prefix += `[%csl ${csl.join(',')}]`
    }
    if (cal.length !== 0) {
      prefix += `[%cal ${cal.join(',')}]`
    }

    if (
      prefix &&
      this.comment &&
      !this.comment.startsWith(' ') &&
      this.comment.startsWith('\n')
    ) {
      this.comment = prefix + ' ' + this.comment
    } else {
      this.comment = prefix + this.comment
    }
  }

  /**
   * Parses the first valid ``[%clk ...]`` annotation in the comment of
   * this node, if any.
   *
   * Returns the player's remaining time to the next time control after this
   * move, in seconds.
   */
  clock(): number | null {
    const match = this.comment.match(CLOCK_REGEX)
    if (match === null) {
      return null
    }
    return (
      parseInt(match.groups!['hours']) * 3600 +
      parseInt(match.groups!['minutes']) * 60 +
      parseFloat(match.groups!['seconds'])
    )
  }

  /**
   * Replaces the first valid ``[%clk ...]`` annotation in the comment of
   * this node or adds a new one.
   */
  setClock(seconds: number | null): void {
    let clk = ''
    if (seconds !== null) {
      seconds = Math.max(0, seconds)
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      seconds = (seconds % 3600) % 60
      const secondsPart = seconds
        .toFixed(3)
        .padStart(6, '0')
        .replace(/0+$/, '')
        .replace(/\.$/, '')
      clk = `[%clk ${hours}:${minutes.toFixed(2).padStart(2, '0')}:${secondsPart}]`
    }

    let found: number
    ;[this.comment, found] = utils.subn(
      CLOCK_REGEX,
      _condenseAffix(clk),
      this.comment,
      1,
    )

    if (!found && clk) {
      if (
        this.comment &&
        !this.comment.endsWith(' ') &&
        !this.comment.endsWith('\n')
      ) {
        this.comment += ' '
      }
      this.comment += clk
    }
  }

  /**
   * Parses the first valid ``[%emt ...]`` annotation in the comment of
   * this node, if any.
   *
   * Returns the player's elapsed move time use for the comment of this
   * move, in seconds.
   */
  emt(): number | null {
    const match = this.comment.match(EMT_REGEX)
    if (match === null) {
      return null
    }
    return (
      parseInt(match.groups!['hours']) * 3600 +
      parseInt(match.groups!['minutes']) * 60 +
      parseFloat(match.groups!['seconds'])
    )
  }

  /**
   * Replaces the first valid ``[%emt ...]`` annotation in the comment of
   * this node or adds a new one.
   */
  setEmt(seconds: number | null): void {
    let emt = ''
    if (seconds !== null) {
      seconds = Math.max(0, seconds)
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      seconds = (seconds % 3600) % 60
      const secondsPart = seconds
        .toFixed(3)
        .padStart(6, '0')
        .replace(/0+$/, '')
        .replace(/\.$/, '')
      emt = `[%emt ${hours}:${minutes.toFixed(2).padStart(2, '0')}:${secondsPart}]`
    }

    let found: number
    ;[this.comment, found] = utils.subn(
      EMT_REGEX,
      _condenseAffix(emt),
      this.comment,
      1,
    )

    if (!found && emt) {
      if (
        this.comment &&
        !this.comment.endsWith(' ') &&
        !this.comment.endsWith('\n')
      ) {
        this.comment += ' '
      }
      this.comment += emt
    }
  }

  /**
   * Traverses game nodes in PGN order using the given `visitor`. Starts with
   * the move leading to this node. Returns the `visitor` result.
   */
  abstract accept<ResultT>(visitor: BaseVisitor<ResultT>): ResultT

  /**
   * Traverses headers and game nodes in PGN order, as if the game was
   * starting after this node. Returns the *visitor* result.
   */
  acceptSubgame<ResultT>(visitor: BaseVisitor<ResultT>): ResultT {
    if (visitor.beginGame() !== SKIP) {
      const game = this.game()
      const board = this.board()

      const dummyGame = Game.withoutTagRoster()
      dummyGame.setup(board)

      visitor.beginHeaders()

      for (const [tagname, tagvalue] of game.headers.items()) {
        if (!dummyGame.headers.includes(tagname)) {
          visitor.visitHeader(tagname, tagvalue)
        }
      }
      for (const [tagname, tagvalue] of dummyGame.headers.items()) {
        visitor.visitHeader(tagname, tagvalue)
      }

      if (visitor.endHeaders() !== SKIP) {
        visitor.visitBoard(board)

        if (this.variations.length !== 0) {
          this.variations[0]._accept(board, visitor)
        }

        visitor.visitResult(game.headers.get('Result') || '*')
      }
    }

    visitor.endGame()
    return visitor.result()
  }

  toString(): string {
    return this.accept(new StringExporter({ columns: null }))
  }
}

/**
 * A child node of a game, with the move leading to it.
 * Extends :class:`~pgn.GameNode`.
 */
export class ChildNode extends GameNode {
  /** The parent node. */
  parent: GameNode

  /** The move leading to this node. */
  move: Move

  /**
   * A comment for the start of a variation. Only nodes that
   * actually start a variation (:func:`~pgn.GameNode.starts_variation()`
   * checks this) can have a starting comment. The root node can not have
   * a starting comment.
   */
  startingComment: string

  /**
   * A set of NAGs as integers. NAGs always go behind a move, so the root
   * node of the game will never have NAGs.
   */
  nags: Set<number>

  constructor(
    parent: GameNode,
    move: Move,
    {
      comment = '',
      startingComment = '',
      nags = [],
    }: {
      comment?: string
      startingComment?: string
      nags?: Iterable<number>
    } = {},
  ) {
    super({ comment })
    this.parent = parent
    this.move = move
    this.parent.variations.push(this)

    this.nags = new Set<number>()
    for (const nag of nags) {
      this.nags.add(nag)
    }
    this.startingComment = startingComment
  }

  board(): Board {
    let stack: Move[] = []
    let node: GameNode = this

    while (node.move !== null && node.parent !== null) {
      stack.push(node.move)
      node = node.parent
    }

    const board = node.game().board()

    while (stack.length !== 0) {
      board.push(stack.pop() as Move)
    }

    return board
  }

  ply(): number {
    let ply = 0
    let node: GameNode = this
    while (node.parent !== null) {
      ply += 1
      node = node.parent
    }
    return node.game().ply() + ply
  }

  /**
   * Gets the standard algebraic notation of the move leading to this node.
   * See :func:`Board.san()`.
   *
   * Do not call this on the root node.
   *
   * Complexity is `O(n)`.
   */
  san(): string {
    return this.parent.board().san(this.move)
  }

  /**
   * Gets the UCI notation of the move leading to this node.
   * See :func:`Board.uci()`.
   *
   * Do not call this on the root node.
   *
   * Complexity is `O(n)`.
   */
  uci({ chess960 = null }: { chess960?: boolean | null } = {}): string {
    return this.parent.board().uci(this.move, { chess960 })
  }

  /**
   * Follows the main variation to the end and returns the last node.
   *
   * Complexity is `O(n)`.
   */
  end(): ChildNode {
    return super.end() as ChildNode
  }

  _acceptNode<ResultT>(
    parentBoard: Board,
    visitor: BaseVisitor<ResultT>,
  ): void {
    if (this.startingComment) {
      visitor.visitComment(this.startingComment)
    }

    visitor.visitMove(parentBoard, this.move)

    parentBoard.push(this.move)
    visitor.visitBoard(parentBoard)
    parentBoard.pop()

    for (const nag of Array.from(this.nags).sort()) {
      visitor.visitNag(nag)
    }

    if (this.comment) {
      visitor.visitComment(this.comment)
    }
  }

  _accept<ResultT>(
    parentBoard: Board,
    visitor: BaseVisitor<ResultT>,
    { sidelines = true }: { sidelines?: boolean } = {},
  ): void {
    let stack = [new _AcceptFrame(this, { sidelines })]

    while (stack.length !== 0) {
      let top = stack.at(-1) as _AcceptFrame

      if (top.inVariation) {
        top.inVariation = false
        visitor.endVariation()
      }

      if (top.state === 'pre') {
        top.node._acceptNode(parentBoard, visitor)
        top.state = 'variations'
      } else if (top.state === 'variations') {
        const variation = top.variations.next().value as ChildNode | undefined

        if (variation === undefined) {
          if (top.node.variations.length !== 0) {
            parentBoard.push(top.node.move)
            stack.push(
              new _AcceptFrame(top.node.variations[0], { sidelines: true }),
            )
            top.state = 'post'
          } else {
            top.state = 'end'
          }
        } else {
          if (visitor.beginVariation() !== SKIP) {
            stack.push(
              new _AcceptFrame(variation, {
                sidelines: false,
                isVariation: true,
              }),
            )
          }
          top.inVariation = true
        }
      } else if (top.state === 'post') {
        parentBoard.pop()
        top.state = 'end'
      } else {
        stack.pop()
      }
    }
  }

  accept<ResultT>(visitor: BaseVisitor<ResultT>): ResultT {
    this._accept(this.parent.board(), visitor, { sidelines: false })
    return visitor.result()
  }

  toRepr(): string {
    if (this.parent === null) {
      return `<${this.constructor.name} (dangling: ${this.move})>`
    }

    const parentBoard = this.parent.board()
    return `<${this.constructor.name} (${parentBoard.fullmoveNumber}${parentBoard.turn === WHITE ? '.' : '...'} ${parentBoard.san(this.move)} ...)>`
  }
}

/**
 * The root node of a game with extra information such as headers and the
 * starting position. Extends :class:`~pgn.GameNode`.
 */
export class Game extends GameNode {
  /**
   * A mapping of headers. By default, the following 7 headers are provided
   * (Seven Tag Roster):
   *
   *      >>> import pgn
   *      >>>
   *      >>> game = pgn.Game()
   *      >>> game.headers
   *      Headers(Event='?', Site='?', Date='????.??.??', Round='?', White='?', Black='?', Result='*')
   */
  headers: Headers

  /**
   * A list of errors (such as illegal or ambiguous moves) encountered while
   * parsing the game.
   */
  errors: Error[]

  constructor(
    headers: Map<string, string> | Iterable<[string, string]> | null = null,
  ) {
    super()
    this.headers = new Headers(headers)
    this.errors = []
  }

  board(): Board {
    return this.headers.board()
  }

  ply(): number {
    // Optimization: Parse FEN only for custom starting positions.
    return this.headers.includes('FEN') ? this.board().ply() : 0
  }

  /**
   * Sets up a specific starting position. This sets (or resets) the
   * ``FEN``, ``SetUp``, and ``Variant`` header tags.
   */
  setup(board: Board | string): void {
    let fen: string
    let setup: Board
    if (board instanceof Board) {
      fen = board.fen() // type: ignore
      setup = board
    } else {
      setup = new Board(board)
      setup.chess960 = setup.hasChess960CastlingRights()
      fen = setup.fen()
    }

    if (fen === (setup.constructor as typeof Board).startingFen) {
      this.headers.pop('FEN') // ', null)' not necessary
      this.headers.pop('SetUp') // ', null)' not necessary
    } else {
      this.headers.set('FEN', fen)
      this.headers.set('SetUp', '1')
    }

    if (
      (setup.constructor as typeof Board).aliases[0] === 'Standard' &&
      setup.chess960
    ) {
      this.headers.set('Variant', 'Chess960')
    } else if ((setup.constructor as typeof Board).aliases[0] !== 'Standard') {
      this.headers.set(
        'Variant',
        (setup.constructor as typeof Board).aliases[0],
      )
      this.headers.set('FEN', fen)
    } else {
      this.headers.pop('Variant') // ', null)' not necessary
    }
  }

  /**
   * Traverses the game in PGN order using the given *visitor*. Returns
   * the *visitor* result.
   */
  accept<ResultT>(visitor: BaseVisitor<ResultT>): ResultT {
    if (visitor.beginGame() !== SKIP) {
      for (const [tagname, tagvalue] of this.headers.items()) {
        visitor.visitHeader(tagname, tagvalue)
      }
      if (visitor.endHeaders() !== SKIP) {
        const board = this.board()
        visitor.visitBoard(board)

        if (this.comment) {
          visitor.visitComment(this.comment)
        }

        if (this.variations.length !== 0) {
          this.variations[0]._accept(board, visitor)
        }

        visitor.visitResult(this.headers.get('Result') || '*')
      }
    }

    visitor.endGame()
    return visitor.result()
  }

  /**
   * Returns the time control of the game. If the game has no time control
   * information, the default time control ('UNKNOWN') is returned.
   */
  timeControl(): TimeControl {
    const timeControlHeader = this.headers.get('TimeControl') || ''
    return parseTimeControl(timeControlHeader)
  }

  /**
   * Creates a game from the move stack of a :class:`~Board()`.
   */
  static fromBoard<T extends typeof Game>(
    this: T,
    board: Board,
  ): InstanceType<T> {
    // Setup the initial position.
    const game = new this() as InstanceType<T>
    game.setup(board.root())
    let node: GameNode = game

    // Replay all moves.
    for (const move of board.moveStack) {
      node = node.addVariation(move)
    }

    game.headers.set('Result', board.result())
    return game
  }

  /**
   * Creates an empty game without the default Seven Tag Roster.
   */
  static withoutTagRoster<T extends typeof Game>(this: T): InstanceType<T> {
    return new this(new Map<string, string>()) as InstanceType<T>
  }

  static builder<GameT extends typeof Game>(this: GameT): GameBuilder {
    return new GameBuilder({ Game_: this })
  }

  toRepr(): string {
    return `<${this.constructor.name} (${this.headers.get('White') || '?'} vs. ${this.headers.get('Black') || '?'}, ${this.headers.get('Date') || '????.??.??'} at ${this.headers.get('Site') || '?'}${this.errors.length > 0 ? `, ${this.errors.length} errors` : ''})>`
  }
}

export class Headers {
  _tagRoster: Map<string, string>
  _others: Map<string, string>

  constructor(
    data: Map<string, string> | Iterable<[string, string]> | null = null,
    { kwargs }: { kwargs: Map<string, string> } = {
      kwargs: new Map<string, string>(),
    },
  ) {
    this._tagRoster = new Map<string, string>()
    this._others = new Map<string, string>()

    if (data === null) {
      data = new Map<string, string>([
        ['Event', '?'],
        ['Site', '?'],
        ['Date', '????.??.??'],
        ['Round', '?'],
        ['White', '?'],
        ['Black', '?'],
        ['Result', '*'],
      ])
    }

    for (const [key, value] of data) {
      this.set(key, value)
    }

    for (const [key, value] of kwargs) {
      this.set(key, value)
    }
  }

  isChess960(): boolean {
    return [
      'chess960',
      'chess 960',
      'fischerandom', // Cute Chess
      'fischerrandom',
      'fischer random',
    ].includes((this.get('Variant') || '').toLowerCase())
  }

  isWild(): boolean {
    // http://www.freeorg/Help/HelpFiles/wild.html
    return [
      'wild/0',
      'wild/1',
      'wild/2',
      'wild/3',
      'wild/4',
      'wild/5',
      'wild/6',
      'wild/7',
      'wild/8',
      'wild/8a',
    ].includes((this.get('Variant') || '').toLowerCase())
  }

  variant(): typeof Board {
    if (!this.includes('Variant') || this.isChess960() || this.isWild()) {
      return Board
    } else {
      return findVariant(this.get('Variant')!)
    }
  }

  board(): Board {
    const VariantBoard = this.variant()
    const fen = this.get('FEN') || VariantBoard.startingFen
    const board = new VariantBoard(fen, { chess960: this.isChess960() })
    board.chess960 = board.chess960 || board.hasChess960CastlingRights()
    return board
  }

  // __setitem__()
  set(key: string, value: string): void {
    if (TAG_ROSTER.includes(key)) {
      this._tagRoster.set(key, value)
    } else if (key.match(TAG_NAME_REGEX) === null) {
      throw new Error(`ValueError: invalid pgn header tag: ${key}`)
    } else if (value.includes('\n') || value.includes('\r')) {
      throw new Error(`line break in pgn header ${key}: ${value}`)
    } else {
      this._others.set(key, value)
    }
  }

  // __getitem__()
  get(key: string): string | undefined {
    return TAG_ROSTER.includes(key)
      ? this._tagRoster.get(key)
      : this._others.get(key)
  }

  // __delitem__()
  delitem(key: string): boolean {
    if (TAG_ROSTER.includes(key)) {
      return this._tagRoster.delete(key)
    } else {
      return this._others.delete(key)
    }
  }

  // __iter__()
  *iter(): IterableIterator<string> {
    for (const key of TAG_ROSTER) {
      if (this._tagRoster.has(key)) {
        yield key
      }
    }

    yield* this._others.keys()
  }

  // __len__()
  length(): number {
    return this._tagRoster.size + this._others.size
  }

  copy(): this {
    return new (this.constructor as new (data: this) => this)(this)
  }

  // __copy__() skipped

  // __repr__()
  toRepr(): string {
    return `${this.constructor.name}(${Array.from(this.items())
      .map(([key, value]) => `${key}='${value}'`)
      .join(', ')})`
  }

  // Note: No `python-chess` mirror. Included for convenience.
  toString(): string {
    return this.toRepr()
  }

  static builder<HeadersT extends typeof Headers>(
    this: HeadersT,
  ): HeadersBuilder {
    return new HeadersBuilder({ Headers_: this })
  }

  /* 
  NOTE: All functions below have no `python-chess` mirror. These are included
  to mirror the Python `dict` API, which defines `get()`, `items()`, etc.
  */

  *keys(): IterableIterator<string> {
    return this.iter()
  }

  *values(): IterableIterator<string> {
    for (const [_, value] of this.iter()) {
      yield value
    }
  }

  *items(): IterableIterator<[string, string]> {
    for (const key of TAG_ROSTER) {
      if (this._tagRoster.has(key)) {
        yield [key, this._tagRoster.get(key) as string]
      }
    }

    yield* this._others
  }

  [Symbol.iterator](): IterableIterator<string> {
    return this.iter()
  }

  includes(key: string): boolean {
    for (const k of this) {
      if (k === key) {
        return true
      }
    }
    return false
  }

  pop(key: string): string | undefined {
    const value = this.get(key)
    this.delitem(key)
    return value
  }
}

export class Mainline<MainlineMapT> {
  start: GameNode
  f: (node: ChildNode) => MainlineMapT

  constructor(start: GameNode, f: (node: ChildNode) => MainlineMapT) {
    this.start = start
    this.f = f
  }

  bool(): boolean {
    return utils.bool(this.start.variations)
  }

  *iter(): IterableIterator<MainlineMapT> {
    let node = this.start
    while (node.variations.length !== 0) {
      node = node.variations[0]
      yield this.f(node as ChildNode)
    }
  }

  *reversed(): IterableIterator<MainlineMapT> {
    let node = this.start.end()
    while (node.parent && node !== this.start) {
      yield this.f(node as ChildNode)
      node = node.parent
    }
  }

  accept<ResultT>(visitor: BaseVisitor<ResultT>): ResultT {
    let node = this.start as ChildNode
    const board = this.start.board()
    while (node.variations.length !== 0) {
      node = node.variations[0]
      node._acceptNode(board, visitor)
      board.push(node.move)
    }
    return visitor.result()
  }

  toString(): string {
    return this.accept(new StringExporter({ columns: null }))
  }

  toRepr(): string {
    return `<Mainline (${this.accept(new StringExporter({ columns: null, comments: false }))})>`
  }
}

/**
 * Base class for visitors.
 *
 * Use with :func:`pgn.Game.accept()` or
 * :func:`pgn.GameNode.accept()` or :func:`pgn.readGame()`.
 *
 * The methods are called in PGN order.
 */
export abstract class BaseVisitor<ResultT> {
  /**
   * Called at the start of a game.
   */
  beginGame(): SkipType | void {
    // pass
  }

  /**
   * Called before visiting game headers.
   */
  beginHeaders(): Headers | void {
    // pass
  }

  /**
   * Called for each game header.
   */
  visitHeader(tagname: string, tagvalue: string): void {
    // pass
  }

  /**
   * Called after visiting game headers.
   */
  endHeaders(): SkipType | void {
    // pass
  }

  /**
   * When the visitor is used by a parser, this is called at the start of
   * each standard algebraic notation detailing a move.
   */
  beginParseSan(board: Board, san: string): SkipType | void {
    // pass
  }

  /**
   * When the visitor is used by a parser, this is called to parse a move
   * in standard algebraic notation.
   *
   * You can override the default implementation to work around specific
   * quirks of your input format.
   *
   * .. deprecated:: 1.1
   *     This method is very limited, because it is only called on moves
   *     that the parser recognizes in the first place. Instead of adding
   *     workarounds here, please report common quirks so that
   *     they can be handled for everyone.
   */
  parseSan(board: Board, san: string): Move {
    return board.parseSan(san)
  }

  /**
   * Called for each move.
   *
   * *board* is the board state before the move. The board state must be
   * restored before the traversal continues.
   */
  visitMove(board: Board, move: Move): void {
    // pass
  }

  /**
   * Called for the starting position of the game and after each move.
   *
   * The board state must be restored before the traversal continues.
   */
  visitBoard(board: Board): void {
    // pass
  }

  /**
   * Called for each comment.
   */
  visitComment(comment: string): void {
    // pass
  }

  /**
   * Called for each NAG.
   */
  visitNag(nag: number): void {
    // pass
  }

  /**
   * Called at the start of a new variation. It is not called for the
   * mainline of the game.
   */
  beginVariation(): SkipType | void {
    // pass
  }

  /**
   * Concludes a variation.
   */
  endVariation(): void {
    // pass
  }

  /**
   * Called at the end of a game with the value from the ``Result`` header.
   */
  visitResult(result: string): void {
    // pass
  }

  /**
   * Called at the end of a game.
   */
  endGame(): void {
    // pass
  }

  /**
   * Called to get the result of the visitor.
   */
  abstract result(): ResultT

  /**
   * Called for encountered errors. Defaults to raising an exception.
   */
  handleError(error: Error): void {
    throw error
  }
}

/**
 * Creates a game model. Default visitor for :func:`~pgn.readGame()`.
 */
export class GameBuilder extends BaseVisitor<Game> {
  Game_: typeof Game
  game: Game = null!
  variationStack: GameNode[] = null!
  startingComment: string = null!
  inVariation: boolean = null!

  constructor()
  constructor({ Game_ }: { Game_: typeof Game })
  constructor({ Game_ = Game }: { Game_?: typeof Game } = {}) {
    super()
    this.Game_ = Game_
  }

  beginGame(): void {
    this.game = new this.Game_()

    this.variationStack = [this.game]
    this.startingComment = ''
    this.inVariation = false
  }

  beginHeaders(): Headers {
    return this.game.headers
  }

  visitHeader(tagname: string, tagvalue: string): void {
    this.game.headers.set(tagname, tagvalue)
  }

  visitNag(nag: number): void {
    this.variationStack.at(-1)?.nags.add(nag)
  }

  beginVariation(): void {
    const parent = this.variationStack.at(-1)!.parent
    if (parent === null) {
      throw new Error(
        'AssertionError: beginVariation called, but root node on top of stack',
      )
    }
    this.variationStack.push(parent)
    this.inVariation = false
  }

  endVariation(): void {
    this.variationStack.pop()
  }

  visitResult(result: string): void {
    if ((this.game.headers.get('Result') || '*') === '*') {
      this.game.headers.set('Result', result)
    }
  }

  visitComment(comment: string): void {
    let newComment: [string, string]
    if (
      this.inVariation ||
      (this.variationStack.at(-1)!.parent === null &&
        this.variationStack.at(-1)!.isEnd())
    ) {
      // Add as a comment for the current node if in the middle of
      // a variation. Add as a comment for the game if the comment
      // starts before any move.
      newComment = [this.variationStack.at(-1)!.comment, comment]
      this.variationStack.at(-1)!.comment = newComment
        .filter(utils.bool)
        .join(' ')
    } else {
      // Otherwise, it is a starting comment.
      newComment = [this.startingComment, comment]
      this.startingComment = newComment.filter(utils.bool).join(' ')
    }
  }

  visitMove(board: Board, move: Move): void {
    this.variationStack
    this.variationStack[this.variationStack.length - 1] = this.variationStack
      .at(-1)!
      .addVariation(move) // TODO this type of indexing doesn't work
    this.variationStack.at(-1)!.startingComment = this.startingComment
    this.startingComment = ''
    this.inVariation = true
  }

  /**
   * Populates :data:`pgn.Game.errors` with encountered errors and
   * logs them.
   *
   * You can silence the log and handle errors yourself after parsing:
   *
   * >>> import pgn
   * >>> import logging
   * >>>
   * >>> logging.getLogger("pgn").setLevel(logging.CRITICAL)
   * >>>
   * >>> pgn = open("data/pgn/kasparov-deep-blue-1997.pgn")
   * >>>
   * >>> game = pgn.readGame(pgn)
   * >>> game.errors  // List of exceptions
   * []
   *
   * You can also override this method to hook into error handling:
   *
   * >>> import pgn
   * >>>
   * >>> class MyGameBuilder(pgn.GameBuilder):
   * >>>     def handleError(this, error: Exception) -> null:
   * >>>         pass  // Ignore error
   * >>>
   * >>> pgn = open("data/pgn/kasparov-deep-blue-1997.pgn")
   * >>>
   * >>> game = pgn.readGame(pgn, Visitor=MyGameBuilder)
   */
  handleError(error: Error): void {
    LOGGER.error(`${error} while parsing ${this.game}`)
    this.game.errors.push(error)
  }

  /**
   * Returns the visited :class:`~pgn.Game()`.
   */
  result(): Game {
    return this.game
  }
}

/**
 * Collects headers into a dictionary.
 */
export class HeadersBuilder extends BaseVisitor<Headers> {
  Headers_: typeof Headers
  headers: Headers = null!

  constructor()
  constructor({ Headers_ }: { Headers_: typeof Headers })
  constructor({ Headers_ = Headers }: { Headers_?: typeof Headers } = {}) {
    super()
    this.Headers_ = Headers_
  }

  beginHeaders(): Headers {
    this.headers = new this.Headers_(new Map<string, string>())
    return this.headers
  }

  visitHeader(tagname: string, tagvalue: string): void {
    this.headers.set(tagname, tagvalue)
  }

  endHeaders(): SkipType {
    return SKIP
  }

  result(): Headers {
    return this.headers
  }
}

/**
 * Returns the final position of the game. The mainline of the game is
 * on the move stack.
 */
export class BoardBuilder extends BaseVisitor<Board> {
  skipVariationDepth: number = null!
  board: Board = null!

  beginGame(): void {
    this.skipVariationDepth = 0
  }

  beginVariation(): SkipType {
    this.skipVariationDepth += 1
    return SKIP
  }

  endVariation(): void {
    this.skipVariationDepth = Math.max(this.skipVariationDepth - 1, 0)
  }

  visitBoard(board: Board): void {
    if (!this.skipVariationDepth) {
      this.board = board
    }
  }

  result(): Board {
    return this.board
  }
}

/**
 * Skips a game.
 */
export class SkipVisitor extends BaseVisitor<true> {
  beginGame(): SkipType {
    return SKIP
  }

  endHeaders(): SkipType {
    return SKIP
  }

  beginVariation(): SkipType {
    return SKIP
  }

  result(): true {
    return true
  }
}

/*
NOTE: `python-chess` does not have this class inherit from `BaseVisitor`, but we
do so here because it avoids mixin hell. Let's avoid a situation like this:
https://stackoverflow.com/a/64493510/7304977

Only `StringExporter` and `FileExporter` inherit from `StringExporterMixin`, and they
both also inherit from `BaseVisitor[str]` and `BaseVisitor[int]` respectively. Therefore,
we use a sort of roundabout solution by having the mixin itself inherit from `BaseVisitor`
and pass it a generic type which will be propagated as the generic type to `BaseVisitor`.
Then `StringExporter` will inherit from `StringExporterMixin<string>` and `FileExporter`
will inherit from `StringExporterMixin<number>`.
*/
export abstract class StringExporterMixin<
  BaseVisitorGenericT = string | number,
> extends BaseVisitor<BaseVisitorGenericT> {
  columns: number | null
  headers: boolean
  comments: boolean
  variations: boolean

  foundHeaders: boolean

  forceMovenumber: boolean

  lines: string[]
  currentLine: string
  variationDepth: number

  constructor({
    columns = 80,
    headers = true,
    comments = true,
    variations = true,
  }: {
    columns?: number | null
    headers?: boolean
    comments?: boolean
    variations?: boolean
  } = {}) {
    super()
    this.columns = columns
    this.headers = headers
    this.comments = comments
    this.variations = variations

    this.foundHeaders = false

    this.forceMovenumber = true

    this.lines = []
    this.currentLine = ''
    this.variationDepth = 0
  }

  flushCurrentLine(): void {
    if (this.currentLine) {
      this.lines.push(this.currentLine.trimEnd())
    }
    this.currentLine = ''
  }

  writeToken(token: string): void {
    if (
      this.columns !== null &&
      this.columns - this.currentLine.length < token.length
    ) {
      this.flushCurrentLine()
    }
    this.currentLine += token
  }

  writeLine(line: string = ''): void {
    this.flushCurrentLine()
    this.lines.push(line.trimEnd())
  }

  endGame(): void {
    this.writeLine()
  }

  beginHeaders(): void {
    this.foundHeaders = false
  }

  visitHeader(tagname: string, tagvalue: string): void {
    if (this.headers) {
      this.foundHeaders = true
      this.writeLine(`[${tagname} "${tagvalue}"]`)
    }
  }

  endHeaders(): void {
    if (this.foundHeaders) {
      this.writeLine()
    }
  }

  beginVariation(): SkipType | void {
    this.variationDepth += 1

    if (this.variations) {
      this.writeToken('( ')
      this.forceMovenumber = true
      return
    } else {
      return SKIP
    }
  }

  endVariation(): void {
    this.variationDepth -= 1

    if (this.variations) {
      this.writeToken(') ')
      this.forceMovenumber = true
    }
  }

  visitComment(comment: string): void {
    if (this.comments && (this.variations || this.variationDepth === 0)) {
      this.writeToken('{ ' + comment.replace('}', '').trim() + ' } ')
      this.forceMovenumber = true
    }
  }

  visitNag(nag: number): void {
    if (this.comments && (this.variations || this.variationDepth === 0)) {
      this.writeToken('$' + nag.toString() + ' ')
    }
  }

  visitMove(board: Board, move: Move): void {
    if (this.variations || this.variationDepth === 0) {
      // Write the move number.
      if (board.turn === WHITE) {
        this.writeToken(board.fullmoveNumber.toString() + '. ')
      } else if (this.forceMovenumber) {
        this.writeToken(board.fullmoveNumber.toString() + '... ')
      }

      // Write the SAN.
      this.writeToken(board.san(move) + ' ')

      this.forceMovenumber = false
    }
  }

  visitResult(result: string): void {
    this.writeToken(result + ' ')
  }
}

/**
 * Allows exporting a game as a string.
 *
 * >>> import pgn
 * >>>
 * >>> game = pgn.Game()
 * >>>
 * >>> exporter = pgn.StringExporter(headers=true, variations=true, comments=true)
 * >>> pgnString = game.accept(exporter)
 *
 * Only *columns* characters are written per line. If *columns* is ``null``,
 * then the entire movetext will be on a single line. This does not affect
 * header tags and comments.
 *
 * There will be no newline characters at the end of the string.
 */
export class StringExporter extends StringExporterMixin<string> {
  constructor({
    columns = 80,
    headers = true,
    comments = true,
    variations = true,
  }: {
    columns?: number | null
    headers?: boolean
    comments?: boolean
    variations?: boolean
  } = {}) {
    super({ columns, headers, comments, variations })
  }

  result(): string {
    if (this.currentLine) {
      return Array.from(
        utils.iterChain(this.lines, [this.currentLine.trimEnd()]),
      )
        .join('\n')
        .trimEnd()
    } else {
      return this.lines.join('\n').trimEnd()
    }
  }

  toString(): string {
    return this.result()
  }
}

// TODO: Support `FileExporter` if running in a Node environment
// /**
//  * Acts like a :class:`~pgn.StringExporter`, but games are written
//  * directly into a text file.
//  *
//  * There will always be a blank line after each game. Handling encodings is up
//  * to the caller.
//  *
//  * >>> import pgn
//  * >>>
//  * >>> game = pgn.Game()
//  * >>>
//  * >>> newPgn = open("/dev/null", "w", encoding="utf-8")
//  * >>> exporter = pgn.FileExporter(newPgn)
//  * >>> game.accept(exporter)
//  */
// export class FileExporter extends StringExporterMixin<number> {
//   handle: StringIO;
//   written: number;

//   constructor(handle: StringIO, { columns = 80, headers = true, comments = true, variations = true }: { columns?: number | null, headers?: boolean, comments?: boolean, variations?: boolean } = {}) {
//     super({ columns, headers, comments, variations })
//     this.handle = handle
//   }

//   beginGame(): void {
//     this.written = 0
//     super.beginGame()
//   }

//   flushCurrentLine(): void {
//     if (this.currentLine) {
//       this.written += this.handle.write(this.currentLine.trimEnd())
//       this.written += this.handle.write("\n")
//     }
//     this.currentLine = ""
//   }

//   writeLine(line: string = ""): void {
//     this.flushCurrentLine()
//     this.written += this.handle.write(line.trimEnd())
//     this.written += this.handle.write("\n")
//   }

//   result(): number {
//     return this.written
//   }

//   toRepr(): string {
//     return "<FileExporter>"
//   }

//   toString(): string {
//     return this.toRepr()
//   }
// }

export function readGame(handle: StringIO): Game | null
export function readGame<ResultT>(
  handle: StringIO,
  { Visitor }: { Visitor?: typeof BaseVisitor<ResultT> },
): ResultT | null
/**
 * Reads a game from a file opened in text mode.
 *
 * >>> import pgn
 * >>>
 * >>> pgn = open("data/pgn/kasparov-deep-blue-1997.pgn")
 * >>>
 * >>> firstGame = pgn.readGame(pgn)
 * >>> secondGame = pgn.readGame(pgn)
 * >>>
 * >>> firstGame.headers["Event"]
 * 'IBM Man-Machine, New York USA'
 * >>>
 * >>> // Iterate through all moves and play them on a board.
 * >>> board = firstGame.board()
 * >>> for move in firstGame.mainlineMoves():
 * ...     board.push(move)
 * ...
 * >>> board
 * Board('4r3/6P1/2p2P1k/1p6/pP2p1R1/P1B5/2P2K2/3r4 b - - 0 45')
 *
 * By using text mode, the parser does not need to handle encodings. It is the
 * caller's responsibility to open the file with the correct encoding.
 * PGN files are usually ASCII or UTF-8 encoded, sometimes with BOM (which
 * this parser automatically ignores). See :func:`open` for options to
 * deal with encoding errors.
 *
 * >>> pgn = open("data/pgn/kasparov-deep-blue-1997.pgn", encoding="utf-8")
 *
 * Use :class:`~io.StringIO` to parse games from a string.
 *
 * >>> import io
 * >>>
 * >>> pgn = io.StringIO("1. e4 e5 2. Nf3 *")
 * >>> game = pgn.readGame(pgn)
 *
 * The end of a game is determined by a completely blank line or the end of
 * the file. (Of course, blank lines in comments are possible).
 *
 * According to the PGN standard, at least the usual seven header tags are
 * required for a valid game. This parser also handles games without any
 * headers just fine.
 *
 * The parser is relatively forgiving when it comes to errors. It skips over
 * tokens it can not parse. By default, any exceptions are logged and
 * collected in :data:`Game.errors <pgn.Game.errors>`. This behavior can
 * be :func:`overridden <pgn.GameBuilder.handleError>`.
 *
 * Returns the parsed game or ``null`` if the end of file is reached.
 */
export function readGame<ResultT>(
  handle: StringIO,
  { Visitor = GameBuilder }: { Visitor?: any } = {},
): ResultT | null {
  const visitor = new Visitor()

  let foundGame = false
  let skippingGame = false
  let managedHeaders: Headers | null = null
  let unmanagedHeaders: Headers | null = null

  // Ignore leading empty lines and comments.
  let line: string = handle.readline().replace(/^\ufeff/, '')
  while (utils.isspace(line) || line.startsWith('%') || line.startsWith(';')) {
    line = handle.readline()
  }

  // Parse game headers.
  let consecutiveEmptyLines = 0
  while (line !== '') {
    // Ignore comments.
    if (line.startsWith('%') || line.startsWith(';')) {
      line = handle.readline()
      continue
    }

    // Ignore up to one consecutive empty line between headers.
    if (consecutiveEmptyLines < 1 && utils.isspace(line)) {
      consecutiveEmptyLines += 1
      line = handle.readline()
      continue
    }

    // First token of the game.
    if (!foundGame) {
      foundGame = true
      skippingGame = visitor.beginGame() === SKIP
      if (!skippingGame) {
        managedHeaders = visitor.beginHeaders()
        if (!(managedHeaders instanceof Headers)) {
          unmanagedHeaders = new Headers(new Map<string, string>())
        }
      }
    }

    if (!line.startsWith('[')) {
      break
    }

    consecutiveEmptyLines = 0

    if (!skippingGame) {
      const tagMatch = line.match(TAG_REGEX)
      if (tagMatch) {
        visitor.visitHeader(tagMatch[1], tagMatch[2])
        if (unmanagedHeaders !== null) {
          unmanagedHeaders.set(tagMatch[1], tagMatch[2])
        }
      } else {
        // Ignore invalid or malformed headers.
        line = handle.readline()
        continue
      }
    }

    line = handle.readline()
  }

  if (!foundGame) {
    return null
  }

  if (!skippingGame) {
    skippingGame = visitor.endHeaders() === SKIP
  }

  let board: Board
  let boardStack: Board[]
  if (!skippingGame) {
    // Chess variant.
    const headers =
      unmanagedHeaders === null ? managedHeaders : unmanagedHeaders
    if (headers === null) {
      throw new Error(
        'AssertionError: got neither managed nor unmanaged headers',
      )
    }
    let VariantBoard: typeof Board
    try {
      VariantBoard = headers.variant()
    } catch (error) {
      visitor.handleError(error)
      VariantBoard = Board
    }

    // Initial position.
    const fen = headers.get('FEN') || VariantBoard.startingFen
    try {
      board = new VariantBoard(fen, { chess960: headers.isChess960() })
      board.chess960 = board.chess960 || board.hasChess960CastlingRights()
      boardStack = [board]
      visitor.visitBoard(board)
    } catch (error) {
      visitor.handleError(error)
      skippingGame = true
    }
  }

  // Fast path: Skip entire game.
  if (skippingGame) {
    let inComment = false

    while (line) {
      if (!inComment) {
        if (utils.isspace(line)) {
          break
        } else if (line.startsWith('%')) {
          line = handle.readline()
          continue
        }
      }

      for (const match of line.matchAll(utils.toGlobal(SKIP_MOVETEXT_REGEX))) {
        const token = match[0]
        if (token === '{') {
          inComment = true
        } else if (!inComment && token === ';') {
          break
        } else if (token === '}') {
          inComment = false
        }
      }

      line = handle.readline()
    }

    visitor.endGame()
    return visitor.result()
  }

  // Parse movetext.
  let skipVariationDepth = 0
  let freshLine = true
  while (line) {
    if (freshLine) {
      // Ignore comments.
      if (line.startsWith('%') || line.startsWith(';')) {
        line = handle.readline()
        continue
      }
      // An empty line means the end of a game.
      if (utils.isspace(line)) {
        visitor.endGame()
        return visitor.result()
      }
    }
    freshLine = true

    for (const match of line.matchAll(utils.toGlobal(MOVETEXT_REGEX))) {
      const token = match[0]

      if (token.startsWith('{')) {
        // Consume until the end of the comment.
        const startIndex = token.startsWith('{ ') ? 2 : 1
        line = token.slice(startIndex)

        const commentLines: string[] = []
        while (line && !line.includes('}')) {
          commentLines.push(line)
          line = handle.readline()
        }

        if (line) {
          const closeIndex = line.indexOf('}')
          const endIndex =
            closeIndex > 0 && line[closeIndex - 1] === ' '
              ? closeIndex - 1
              : closeIndex
          commentLines.push(line.slice(0, endIndex))
          line = line.slice(closeIndex + 1)
        }

        if (!skipVariationDepth) {
          visitor.visitComment(commentLines.join(''))
        }

        // Continue with the current line.
        freshLine = false
        break
      } else if (token === '(') {
        if (skipVariationDepth) {
          skipVariationDepth += 1
        } else if (boardStack!.at(-1)!.moveStack) {
          if (visitor.beginVariation() === SKIP) {
            skipVariationDepth = 1
          } else {
            board = boardStack!.at(-1)!.copy()
            board.pop()
            boardStack!.push(board)
          }
        }
      } else if (token === ')') {
        if (skipVariationDepth === 1) {
          skipVariationDepth = 0
          visitor.endVariation()
        } else if (skipVariationDepth) {
          skipVariationDepth -= 1
        } else if (boardStack!.length > 1) {
          visitor.endVariation()
          boardStack!.pop()
        }
      } else if (skipVariationDepth) {
        continue
      } else if (token.startsWith(';')) {
        break
      } else if (token.startsWith('$')) {
        // Found a NAG.
        visitor.visitNag(parseInt(token.slice(1)))
      } else if (token === '?') {
        visitor.visitNag(NAG_MISTAKE)
      } else if (token === '??') {
        visitor.visitNag(NAG_BLUNDER)
      } else if (token === '!') {
        visitor.visitNag(NAG_GOOD_MOVE)
      } else if (token === '!!') {
        visitor.visitNag(NAG_BRILLIANT_MOVE)
      } else if (token === '!?') {
        visitor.visitNag(NAG_SPECULATIVE_MOVE)
      } else if (token === '?!') {
        visitor.visitNag(NAG_DUBIOUS_MOVE)
      } else if (
        ['1-0', '0-1', '1/2-1/2', '*'].includes(token) &&
        boardStack!.length === 1
      ) {
        visitor.visitResult(token)
      } else {
        // Parse SAN tokens.
        if (visitor.beginParseSan(boardStack!.at(-1)!, token) !== SKIP) {
          try {
            const move = visitor.parseSan(boardStack!.at(-1)!, token)
            visitor.visitMove(boardStack!.at(-1), move)
            boardStack!.at(-1)!.push(move)
          } catch (error) {
            visitor.handleError(error)
            skipVariationDepth = 1
          }
        }
        visitor.visitBoard(boardStack!.at(-1)!)
      }
    }

    if (freshLine) {
      line = handle.readline()
    }
  }

  visitor.endGame()
  return visitor.result()
}

/**
 * Reads game headers from a PGN file opened in text mode. Skips the rest of
 * the game.
 *
 * Since actually parsing many games from a big file is relatively expensive,
 * this is a better way to look only for specific games and then seek and
 * parse them later.
 *
 * This example scans for the first game with Kasparov as the white player.
 *
 *      >>> import pgn
 *      >>>
 *      >>> pgn = open("data/pgn/kasparov-deep-blue-1997.pgn")
 *      >>>
 *      >>> kasparovOffsets = []
 *      >>>
 *      >>> while true:
 *      ...     offset = pgn.tell()
 *      ...
 *      ...     headers = pgn.readHeaders(pgn)
 *      ...     if headers is null:
 *      ...         break
 *      ...
 *      ...     if "Kasparov" in headers.get("White", "?"):
 *      ...         kasparovOffsets.append(offset)
 *
 * Then it can later be seeked and parsed.
 *
 *      >>> for offset in kasparovOffsets:
 *      ...     pgn.seek(offset)
 *      ...     pgn.readGame(pgn)  // doctest: +ELLIPSIS
 *      0
 *      <Game at ... ('Garry Kasparov' vs. 'Deep Blue (Computer)', 1997.??.??)>
 *      1436
 *      <Game at ... ('Garry Kasparov' vs. 'Deep Blue (Computer)', 1997.??.??)>
 *      3067
 *      <Game at ... ('Garry Kasparov' vs. 'Deep Blue (Computer)', 1997.??.??)>
 */
export const readHeaders = (handle: StringIO): Headers | null => {
  return readGame(handle, { Visitor: HeadersBuilder })
}

/**
 * Skips a game. Returns ``true`` if a game was found and skipped.
 */
export const skipGame = (handle: StringIO): boolean => {
  return utils.bool(readGame(handle, { Visitor: SkipVisitor }))
}

export const parseTimeControl = (timeControl: string): TimeControl => {
  const tc = new TimeControl()

  if (!timeControl) {
    return tc
  }

  if (timeControl.startsWith('?')) {
    return tc
  }

  if (timeControl.startsWith('-')) {
    tc.type = TimeControlType.UNLIMITED
    return tc
  }

  const _parsePart = (part: string): TimeControlPart => {
    const tcp = new TimeControlPart()

    const [movesTime, ...bonus] = part.split('+')

    if (bonus) {
      const _bonus = bonus[0]
      if (_bonus.toLowerCase().endsWith('d')) {
        tcp.delay = parseFloat(_bonus.slice(0, -1))
      } else {
        tcp.increment = parseFloat(_bonus)
      }
    }

    const [moves, ...time] = movesTime.split('/')
    if (time) {
      tcp.moves = parseInt(moves)
      tcp.time = parseInt(time[0])
    } else {
      tcp.moves = 0
      tcp.time = parseInt(moves)
    }

    return tcp
  }

  tc.parts = timeControl.split(':').map(_parsePart)

  if (tc.parts.length > 1) {
    for (const part of tc.parts.slice(0, -1)) {
      if (part.moves === 0) {
        throw new Error("ValueError: Only last part can be 'sudden death'.")
      }
    }
  }

  // Classification according to https://www.fide.com/FIDE/handbook/LawsOfpdf
  // (Bullet added)
  const baseTime = tc.parts[0].time
  const increment = tc.parts[0].increment
  if (baseTime + 60 * increment < 3 * 60) {
    tc.type = TimeControlType.BULLET
  } else if (baseTime + 60 * increment < 15 * 60) {
    tc.type = TimeControlType.BLITZ
  } else if (baseTime + 60 * increment < 60 * 60) {
    tc.type = TimeControlType.RAPID
  } else {
    tc.type = TimeControlType.STANDARD
  }

  return tc
}

export default {
  LOGGER,
  NAG_NULL,
  NAG_GOOD_MOVE,
  NAG_MISTAKE,
  NAG_BRILLIANT_MOVE,
  NAG_BLUNDER,
  NAG_SPECULATIVE_MOVE,
  NAG_DUBIOUS_MOVE,
  NAG_FORCED_MOVE,
  NAG_SINGULAR_MOVE,
  NAG_WORST_MOVE,
  NAG_DRAWISH_POSITION,
  NAG_QUIET_POSITION,
  NAG_ACTIVE_POSITION,
  NAG_UNCLEAR_POSITION,
  NAG_WHITE_SLIGHT_ADVANTAGE,
  NAG_BLACK_SLIGHT_ADVANTAGE,
  NAG_WHITE_MODERATE_ADVANTAGE,
  NAG_BLACK_MODERATE_ADVANTAGE,
  NAG_WHITE_DECISIVE_ADVANTAGE,
  NAG_BLACK_DECISIVE_ADVANTAGE,
  NAG_WHITE_ZUGZWANG,
  NAG_BLACK_ZUGZWANG,
  NAG_WHITE_MODERATE_COUNTERPLAY,
  NAG_BLACK_MODERATE_COUNTERPLAY,
  NAG_WHITE_DECISIVE_COUNTERPLAY,
  NAG_BLACK_DECISIVE_COUNTERPLAY,
  NAG_WHITE_MODERATE_TIME_PRESSURE,
  NAG_BLACK_MODERATE_TIME_PRESSURE,
  NAG_WHITE_SEVERE_TIME_PRESSURE,
  NAG_BLACK_SEVERE_TIME_PRESSURE,
  NAG_NOVELTY,
  TAG_REGEX,
  TAG_NAME_REGEX,
  MOVETEXT_REGEX,
  SKIP_MOVETEXT_REGEX,
  CLOCK_REGEX,
  EMT_REGEX,
  EVAL_REGEX,
  ARROWS_REGEX,
  _condenseAffix,
  TAG_ROSTER,
  SkipType,
  SKIP,
  TimeControlType,
  TimeControlPart,
  TimeControl,
  _AcceptFrame,
  GameNode,
  ChildNode,
  Game,
  Headers,
  Mainline,
  BaseVisitor,
  GameBuilder,
  HeadersBuilder,
  BoardBuilder,
  SkipVisitor,
  StringExporterMixin,
  StringExporter,
  // FileExporter,
  // readGame,
  // readGame,
  // readGame,
  // readHeaders,
  // skipGame,
  parseTimeControl,
}
