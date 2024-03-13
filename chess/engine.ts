import * as utils from "./utils"

import * as chess from "./index"
import { Color } from "./index"


export type WdlModel = "sf" | "sf16" | "sf15.1" | "sf15" | "sf14" | "sf12" | "lichess"


// NOTE: Skipping a bunch of stuff in `python-chess` for running analysis


/**
 * A relative :class:`~chess.engine.Score` and the point of view.
 */
export class PovScore {
  /** The relative :class:`~chess.engine.Score`. */
  relative: Score

  /** The point of view (``chess.WHITE`` or ``chess.BLACK``). */
  turn: Color

  constructor(relative: Score, turn: Color) {
    this.relative = relative
    this.turn = turn
  }

  /**
   * Gets the score from White's point of view.
   */
  white(): Score {
    return this.pov(chess.WHITE)
  }

  /**
   * Gets the score from Black's point of view.
   */
  black(): Score {
    return this.pov(chess.BLACK)
  }

  /**
   * Gets the score from the point of view of the given *color*.
   */
  pov(color: Color): Score {
    return this.turn === color ? this.relative : this.relative.neg()
  }

  /**
   * Tests if this is a mate score.
   */
  isMate(): boolean {
    return this.relative.isMate()
  }

  /**
   * See :func:`~chess.engine.Score.wdl()`.
   */
  wdl({ model = "sf", ply = 30 }: { model?: WdlModel, ply?: number } = {}): PovWdl {
    return new PovWdl(this.relative.wdl({ model, ply }), this.turn)
  }

  toRepr(): string {
    return `PovScore(${this.relative.toString()}, ${this.turn ? "WHITE" : "BLACK"})`
  }

  toString = this.toRepr;  // Not in `python-chess`, including for convenience

  equals(other: object): boolean {
    if (other instanceof PovScore) {
      return this.white() === other.white()
    } else {
      return false
    }
  }
}


/**
 * Evaluation of a position.
 * 
 * The score can be :class:`~chess.engine.Cp` (centi-pawns),
 * :class:`~chess.engine.Mate` or :py:data:`~chess.engine.MateGiven`.
 * A positive value indicates an advantage.
 * 
 * There is a total order defined on centi-pawn and mate scores.
 * 
 * >>> from chess.engine import Cp, Mate, MateGiven
 * >>>
 * >>> Mate(-0) < Mate(-1) < Cp(-50) < Cp(200) < Mate(4) < Mate(1) < MateGiven
 * true
 * 
 * Scores can be negated to change the point of view:
 * 
 * >>> -Cp(20)
 * Cp(-20)
 * 
 * >>> -Mate(-4)
 * Mate(+4)
 * 
 * >>> -Mate(0)
 * MateGiven
 */
export abstract class Score {
  abstract score(): number | null;
  abstract score({ mateScore }: { mateScore: number }): number;
  abstract score({ mateScore }: { mateScore: null }): number | null;
  /**
   * Returns the centi-pawn score as an integer or ``null``.
   * 
   * You can optionally pass a large value to convert mate scores to
   * centi-pawn scores.
   * 
   * >>> Cp(-300).score()
   * -300
   * >>> Mate(5).score() is null
   * true
   * >>> Mate(5).score(mateScore=100000)
   * 99995
   */
  abstract score({ mateScore }: { mateScore?: number | null }): number | null;

  /**
   * Returns the number of plies to mate, negative if we are getting
   * mated, or ``null``.
   * 
   * .. warning::
   *     This conflates ``Mate(0)`` (we lost) and ``MateGiven``
   *     (we won) to ``0``.
   */
  abstract mate(): number | null;

  /**
   * Tests if this is a mate score.
   */
  isMate(): boolean {
    return this.mate() !== null
  }

  /**
   * Returns statistics for the expected outcome of this game, based on
   * a *model*, given that this score is reached at *ply*.
   * 
   * Scores have a total order, but it makes little sense to compute
   * the difference between two scores. For example, going from
   * ``Cp(-100)`` to ``Cp(+100)`` is much more significant than going
   * from ``Cp(+300)`` to ``Cp(+500)``. It is better to compute differences
   * of the expectation values for the outcome of the game (based on winning
   * chances and drawing chances).
   * 
   * >>> Cp(100).wdl().expectation() - Cp(-100).wdl().expectation()  // doctest: +ELLIPSIS
   * 0.379...
   * 
   * >>> Cp(500).wdl().expectation() - Cp(300).wdl().expectation()  // doctest: +ELLIPSIS
   * 0.015...
   * 
   * :param model:
   *     * ``sf``, the WDL model used by the latest Stockfish
   *       (currently ``sf16``).
   *     * ``sf16``, the WDL model used by Stockfish 16.
   *     * ``sf15.1``, the WDL model used by Stockfish 15.1.
   *     * ``sf15``, the WDL model used by Stockfish 15.
   *     * ``sf14``, the WDL model used by Stockfish 14.
   *     * ``sf12``, the WDL model used by Stockfish 12.
   *     * ``lichess``, the win rate model used by Lichess.
   *       Does not use *ply*, and does not consider drawing chances.
   * :param ply: The number of half-moves played since the starting
   *     position. Models may scale scores slightly differently based on
   *     this. Defaults to middle game.
   */
  abstract wdl({ model, ply }: { model?: WdlModel, ply?: number }): Wdl;

  // __neg__()
  abstract neg(): Score;

  // __pos__()
  abstract pos(): Score;

  abstract abs(): Score;

  _scoreTuple(): [boolean, boolean, boolean, number, number | null] {
    const mate = this.mate()
    return [
      this instanceof MateGivenType,
      (mate !== null) && (mate > 0),
      mate === null,
      -(mate || 0),
      this.score(),
    ]
  }

  // __eq__()
  equals(other: object): boolean {
    if (other instanceof Score) {
      return this._scoreTuple() === other._scoreTuple()
    } else {
      return false
    }
  }

  // __lt__()
  lt(other: object): boolean {
    if (other instanceof Score) {
      return this._scoreTuple() < other._scoreTuple()
    } else {
      return false
    }
  }

  // __le__()
  le(other: object): boolean {
    if (other instanceof Score) {
      return this._scoreTuple() <= other._scoreTuple()
    } else {
      return false
    }
  }

  // __gt__()
  gt(other: object): boolean {
    if (other instanceof Score) {
      return this._scoreTuple() > other._scoreTuple()
    } else {
      return false
    }
  }

  // __ge__()
  ge(other: object): boolean {
    if (other instanceof Score) {
      return this._scoreTuple() >= other._scoreTuple()
    } else {
      return false
    }
  }
}

export const _sf16Wins = (cp: number, { ply }: { ply: number }): number => {
  // https://github.com/official-stockfish/Stockfish/blob/sf16/src/uci.h//L38
  const NormalizeToPawnValue = 328
  // https://github.com/official-stockfish/Stockfish/blob/sf16/src/uci.cpp//L200-L224
  const m = Math.min(240, Math.max(ply, 0)) / 64
  const a = (((0.38036525 * m + -2.82015070) * m + 23.17882135) * m) + 307.36768407
  const b = (((-2.29434733 * m + 13.27689788) * m + -14.26828904) * m) + 63.45318330
  const x = Math.min(4000, Math.max(cp * NormalizeToPawnValue / 100, -4000))
  return Math.floor(0.5 + 1000 / (1 + Math.exp((a - x) / b)))
}

export const _sf151Wins = (cp: number, { ply }: { ply: number }): number => {
  // https://github.com/official-stockfish/Stockfish/blob/sf15.1/src/uci.h//L38
  const NormalizeToPawnValue = 361
  // https://github.com/official-stockfish/Stockfish/blob/sf15.1/src/uci.cpp//L200-L224
  const m = Math.min(240, Math.max(ply, 0)) / 64
  const a = (((-0.58270499 * m + 2.68512549) * m + 15.24638015) * m) + 344.49745382
  const b = (((-2.65734562 * m + 15.96509799) * m + -20.69040836) * m) + 73.61029937
  const x = Math.min(4000, Math.max(cp * NormalizeToPawnValue / 100, -4000))
  return Math.floor(0.5 + 1000 / (1 + Math.exp((a - x) / b)))
}

export const _sf15Wins = (cp: number, { ply }: { ply: number }): number => {
  // https://github.com/official-stockfish/Stockfish/blob/sf15/src/uci.cpp//L200-L220
  const m = Math.min(240, Math.max(ply, 0)) / 64
  const a = (((-1.17202460e-1 * m + 5.94729104e-1) * m + 1.12065546e+1) * m) + 1.22606222e+2
  const b = (((-1.79066759 * m + 11.30759193) * m + -17.43677612) * m) + 36.47147479
  const x = Math.min(2000, Math.max(cp, -2000))
  return Math.floor(0.5 + 1000 / (1 + Math.exp((a - x) / b)))
}

export const _sf14Wins = (cp: number, { ply }: { ply: number }): number => {
  // https://github.com/official-stockfish/Stockfish/blob/sf14/src/uci.cpp//L200-L220
  const m = Math.min(240, Math.max(ply, 0)) / 64
  const a = (((-3.68389304 * m + 30.07065921) * m + -60.52878723) * m) + 149.53378557
  const b = (((-2.01818570 * m + 15.85685038) * m + -29.83452023) * m) + 47.59078827
  const x = Math.min(2000, Math.max(cp, -2000))
  return Math.floor(0.5 + 1000 / (1 + Math.exp((a - x) / b)))
}

export const _sf12Wins = (cp: number, { ply }: { ply: number }): number => {
  // https://github.com/official-stockfish/Stockfish/blob/sf12/src/uci.cpp//L198-L218
  const m = Math.min(240, Math.max(ply, 0)) / 64
  const a = (((-8.24404295 * m + 64.23892342) * m + -95.73056462) * m) + 153.86478679
  const b = (((-3.37154371 * m + 28.44489198) * m + -56.67657741) * m) + 72.05858751
  const x = Math.min(1000, Math.max(cp, -1000))
  return Math.floor(0.5 + 1000 / (1 + Math.exp((a - x) / b)))
}

export const _lichessRawWins = (cp: number): number => {
  // https://github.com/lichess-org/lila/pull/11148
  // https://github.com/lichess-org/lila/blob/2242b0a08faa06e7be5508d338ede7bb09049777/modules/analyse/src/main/WinPercent.scala//L26-L30
  return Math.round(1000 / (1 + Math.exp(-0.00368208 * cp)))
}


/**
 * Centi-pawn score.
 */
export class Cp extends Score {
  cp: number;

  constructor(cp: number) {
    super()
    this.cp = cp
  }

  mate(): null {
    return null
  }

  score({ mateScore = null }: { mateScore?: number | null } = {}): number {
    return this.cp
  }

  wdl({ model = "sf", ply = 30 }: { model?: WdlModel, ply?: number } = {}): Wdl {
    let wins: number
    let losses: number
    if (model === "lichess") {
      wins = _lichessRawWins(Math.max(-1000, Math.min(this.cp, 1000)))
      losses = 1000 - wins
    } else if (model === "sf12") {
      wins = _sf12Wins(this.cp, { ply })
      losses = _sf12Wins(-this.cp, { ply })
    } else if (model === "sf14") {
      wins = _sf14Wins(this.cp, { ply })
      losses = _sf14Wins(-this.cp, { ply })
    } else if (model === "sf15") {
      wins = _sf15Wins(this.cp, { ply })
      losses = _sf15Wins(-this.cp, { ply })
    } else if (model === "sf15.1") {
      wins = _sf151Wins(this.cp, { ply })
      losses = _sf151Wins(-this.cp, { ply })
    } else {
      wins = _sf16Wins(this.cp, { ply })
      losses = _sf16Wins(-this.cp, { ply })
    }
    const draws = 1000 - wins - losses
    return new Wdl(wins, draws, losses)
  }

  // __str__()
  toString(): string {
    return this.cp > 0 ? `+${this.cp}` : this.cp.toString()
  }

  // __repr__()
  toRepr(): string {
    return `Cp(${this})`
  }

  // __neg__()
  neg(): Cp {
    return new Cp(-this.cp)
  }

  // __pos__()
  pos(): Cp {
    return new Cp(this.cp)
  }

  // __abs__()
  abs(): Cp {
    return new Cp(Math.abs(this.cp))
  }
}


/**
 * Mate score.
 */
export class Mate extends Score {
  moves: number;

  constructor(moves: number) {
    super()
    this.moves = moves
  }

  mate(): number {
    return this.moves
  }

  score(): number | null;
  score({ mateScore }: { mateScore: number }): number;
  score({ mateScore }: { mateScore?: number | null }): number | null;
  score({ mateScore = null }: { mateScore?: number | null } = {}): number | null {
    if (mateScore === null) {
      return null
    } else if (this.moves > 0) {
      return mateScore - this.moves
    } else {
      return -mateScore - this.moves
    }
  }

  wdl({ model = "sf", ply = 30 }: { model?: WdlModel, ply?: number } = {}): Wdl {
    if (model === "lichess") {
      const cp = (21 - Math.min(10, Math.abs(this.moves))) * 100
      const wins = _lichessRawWins(cp)
      return this.moves > 0 ? new Wdl(wins, 0, 1000 - wins) : new Wdl(1000 - wins, 0, wins)
    } else {
      return this.moves > 0 ? new Wdl(1000, 0, 0) : new Wdl(0, 0, 1000)
    }
  }

  // __str__()
  toString(): string {
    return this.moves > 0 ? `#+${this.moves}` : `#-${Math.abs(this.moves)}`
  }

  // __repr__()
  toRepr(): string {
    return `Mate(${this.toString().replace(/^#/, "")})`
  }

  // __neg__()
  neg(): MateGivenType | Mate {
    return !this.moves ? MateGiven : new Mate(-this.moves)
  }

  // __pos__()
  pos(): Mate {
    return new Mate(this.moves)
  }

  abs(): MateGivenType | Mate {
    return !this.moves ? MateGiven : new Mate(Math.abs(this.moves))
  }
}


/**
 * Winning mate score, equivalent to ``-Mate(0)``.
 */
export class MateGivenType extends Score {
  mate(): number {
    return 0
  }

  score(): number | null;
  score({ mateScore }: { mateScore: number }): number;
  score({ mateScore }: { mateScore?: number | null }): number | null;
  score({ mateScore = null }: { mateScore?: number | null } = {}): number | null {
    return mateScore
  }

  wdl({ model = "sf", ply = 30 }: { model?: WdlModel, ply?: number } = {}): Wdl {
    return new Wdl(1000, 0, 0)
  }

  // __neg__()
  neg(): Mate {
    return new Mate(0)
  }

  // __pos__()
  pos(): MateGivenType {
    return this
  }

  // __abs__()
  abs(): MateGivenType {
    return this
  }

  // __repr__()
  toRepr(): string {
    return "MateGiven"
  }

  // __str__()
  toString(): string {
    return "//+0"
  }
}

export const MateGiven = new MateGivenType()


/**
 * Relative :class:`win/draw/loss statistics <chess.engine.Wdl>` and the point
 * of view.
 * 
 * .. deprecated:: 1.2
 *     Behaves like a tuple
 *     ``(wdl.relative.wins, wdl.relative.draws, wdl.relative.losses)``
 *     for backwards compatibility. But it is recommended to use the provided
 *     fields and methods instead.
 */
export class PovWdl {
  /** The relative :class:`~chess.engine.Wdl`. */
  relative: Wdl

  /** The point of view (``chess.WHITE`` or ``chess.BLACK``). */
  turn: Color

  constructor(relative: Wdl, turn: Color) {
    this.relative = relative
    this.turn = turn
  }

  /**
   * Gets the :class:`~chess.engine.Wdl` from White's point of view.
   */
  white(): Wdl {
    return this.pov(chess.WHITE)
  }

  /**
   * Gets the :class:`~chess.engine.Wdl` from Black's point of view.
   */
  black(): Wdl {
    return this.pov(chess.BLACK)
  }

  /**
   * Gets the :class:`~chess.engine.Wdl` from the point of view of the given
   * *color*.
   */
  pov(color: Color): Wdl {
    return this.turn === color ? this.relative : this.relative.neg()
  }

  // __bool__()
  bool(): boolean {
    return this.relative.bool()
  }

  // __repr__()
  toRepr(): string {
    return `PovWdl(${this.relative}, ${this.turn ? "WHITE" : "BLACK"})`
  }

  // Unfortunately in python-chess v1.1.0, info["wdl"] was a simple tuple
  // of the relative permille values, so we have to support __iter__,
  // __len__, __getitem__, and equality comparisons with other tuples.
  // Never mind the ordering, because that's not a sensible operation, anyway.

  // __iter__()
  *iter(): IterableIterator<number> {
    yield this.relative.wins
    yield this.relative.draws
    yield this.relative.losses
  }

  // __len__()
  len(): number {
    return 3
  }

  // __getitem__()
  getitem(idx: number): number {
    return [this.relative.wins, this.relative.draws, this.relative.losses][idx]
  }

  // __eq__()
  equals(other: object): boolean {
    if (other instanceof PovWdl) {
      return this.white() === other.white()
    } else if (other instanceof Array) {
      return other.length === 3 && 
        this.relative.wins === other[0] &&
        this.relative.draws === other[1] &&
        this.relative.losses === other[2]
    } else {
      return false
    }
  }
}


/**
 * Win/draw/loss statistics.
 */
export class Wdl {
  /** The number of wins. */
  wins: number
  
  /** The number of draws. */
  draws: number

  /** The number of losses. */
  losses: number

  constructor(wins: number, draws: number, losses: number) {
    this.wins = wins
    this.draws = draws
    this.losses = losses
  }

  /**
   * Returns the total number of games. Usually, ``wdl`` reported by engines
   * is scaled to 1000 games.
   */
  total(): number {
    return this.wins + this.draws + this.losses
  }

  /**
   * Returns the relative frequency of wins.
   */
  winningChance(): number {
    return this.wins / this.total()
  }

  /**
   * Returns the relative frequency of draws.
   */
  drawingChance(): number {
    return this.draws / this.total()
  }

  /**
   * Returns the relative frequency of losses.
   */
  losingChance(): number {
    return this.losses / this.total()
  }

  /**
   * Returns the expectation value, where a win is valued 1, a draw is
   * valued 0.5, and a loss is valued 0.
   */
  expectation(): number {
    return (this.wins + 0.5 * this.draws) / this.total()
  }

  // __bool__()
  bool(): boolean {
    return utils.bool(this.total())
  }

  // __iter__()
  *iter(): IterableIterator<number> {
    yield this.wins
    yield this.draws
    yield this.losses
  }

  // __reversed__()
  *reversed(): IterableIterator<number> {
    yield this.losses
    yield this.draws
    yield this.wins
  }

  // __pos__()
  pos(): Wdl {
    return this
  }

  // __neg__()
  neg(): Wdl {
    return new Wdl(this.losses, this.draws, this.wins)
  }
}
