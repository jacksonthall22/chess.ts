import { describe, expect, test } from 'vitest'

import * as chess from '../index'
import * as engine from '../engine'

describe('TypeScript-native parity contracts', () => {
  test('dataclass equality requires the same concrete class', () => {
    class DerivedPiece extends chess.Piece {}
    class DerivedWdl extends engine.Wdl {}

    const piece = new chess.Piece(chess.BISHOP, chess.WHITE)
    const derivedPiece = new DerivedPiece(chess.BISHOP, chess.WHITE)
    const wdl = new engine.Wdl(1, 2, 3)
    const derivedWdl = new DerivedWdl(1, 2, 3)

    expect(piece.equals(new chess.Piece(chess.BISHOP, chess.WHITE))).toBe(true)
    expect(piece.equals(derivedPiece)).toBe(false)
    expect(derivedPiece.equals(piece)).toBe(false)
    expect(wdl.equals(new engine.Wdl(1, 2, 3))).toBe(true)
    expect(wdl.equals(derivedWdl)).toBe(false)
    expect(derivedWdl.equals(wdl)).toBe(false)
  })

  test('Score ordering preserves Python unordered NaN comparisons', () => {
    const pairs: [engine.Score, engine.Score][] = [
      [new engine.Cp(Number.NaN), new engine.Cp(0)],
      [new engine.Cp(0), new engine.Cp(Number.NaN)],
      [new engine.Mate(Number.NaN), new engine.Mate(0)],
      [new engine.Mate(0), new engine.Mate(Number.NaN)],
    ]

    for (const [left, right] of pairs) {
      expect(left.equals(right)).toBe(false)
      expect(left.lt(right)).toBe(false)
      expect(left.le(right)).toBe(false)
      expect(left.gt(right)).toBe(false)
      expect(left.ge(right)).toBe(false)
    }
  })

  test('BaseBoard factories and copies preserve subclasses', () => {
    class DerivedBoard extends chess.BaseBoard {
      initializedWith: string | null

      constructor(boardFen: string | null = chess.STARTING_BOARD_FEN) {
        super(boardFen)
        this.initializedWith = boardFen
      }
    }

    const original = new DerivedBoard()
    const copy = original.copy()
    const empty = DerivedBoard.empty()
    const chess960 = DerivedBoard.fromChess960Pos(518)

    expect(copy).toBeInstanceOf(DerivedBoard)
    expect(copy.initializedWith).toBeNull()
    expect(copy.boardFen()).toBe(original.boardFen())
    expect(empty).toBeInstanceOf(DerivedBoard)
    expect(empty.initializedWith).toBeNull()
    expect(empty.boardFen()).toBe('8/8/8/8/8/8/8/8')
    expect(chess960).toBeInstanceOf(DerivedBoard)
    expect(chess960.initializedWith).toBeNull()
    expect(chess960.boardFen()).toBe(chess.STARTING_BOARD_FEN)
  })

  test('setEpd preserves and parses the complete operation field', () => {
    const board = new chess.Board()
    const operations = board.setEpd(
      '8/8/8/8/8/8/8/8 w - - ce 55; id "complete field";',
    )

    expect(operations.get('ce')).toBe(55)
    expect(operations.get('id')).toBe('complete field')
    expect(board.fen()).toBe('8/8/8/8/8/8/8/8 w - - 0 1')
  })

  test('setEpd accepts Python numeric whitespace before later operations', () => {
    const operations = new chess.Board().setEpd(
      '8/8/8/8/8/8/8/8 w - - ce 55 ; acd 1.5\t; id "x";',
    )

    expect(operations.get('ce')).toBe(55)
    expect(operations.get('acd')).toBe(1.5)
    expect(operations.get('id')).toBe('x')
  })

  test('setEpd uses Python whitespace splitting for move operands', () => {
    const board = new chess.Board()
    const operations = board.setEpd(
      `${chess.STARTING_FEN.split(' ').slice(0, 4).join(' ')} ` +
        'bm e4\t d4; am Nf3\nNc3; pv e4  e5;',
    )

    expect(
      (operations.get('bm') as chess.Move[]).map(move => move.uci()),
    ).toEqual(['e2e4', 'd2d4'])
    expect(
      (operations.get('am') as chess.Move[]).map(move => move.uci()),
    ).toEqual(['g1f3', 'b1c3'])
    expect(
      (operations.get('pv') as chess.Move[]).map(move => move.uci()),
    ).toEqual(['e2e4', 'e7e5'])
  })

  test.each([
    ['1_000', 1000],
    ['.5', 0.5],
    ['5.', 5],
    ['1e3', 1000],
    ['-0', 0],
    ['-0.0', -0],
  ])('setEpd parses the complete Python numeric token %s', (token, value) => {
    const operations = new chess.Board().setEpd(
      `8/8/8/8/8/8/8/8 w - - ce ${token};`,
    )

    expect(operations.get('ce')).toBe(value)
  })

  test.each(['1abc', '+', '.', '1e', '1_', '0x10'])(
    'setEpd rejects the complete malformed numeric token %s',
    token => {
      const board = new chess.Board()
      const originalFen = board.fen()

      expect(() =>
        board.setEpd(`8/8/8/8/8/8/8/8 w - - ce ${token};`),
      ).toThrow(chess.ValueError)
      expect(board.fen()).toBe(originalFen)
    },
  )

  test('SquareSet operations accept both masks and SquareSet values', () => {
    const masks = [
      chess.BB_EMPTY,
      chess.BB_A1,
      chess.BB_RANK_1,
      chess.BB_FILE_E,
    ]

    for (const leftMask of masks) {
      for (const rightMask of masks) {
        const left = new chess.SquareSet(leftMask)
        const right = new chess.SquareSet(rightMask)

        expect(left.union(right).int()).toBe(leftMask | rightMask)
        expect(left.intersection(rightMask).int()).toBe(leftMask & rightMask)
        expect(left.difference(right).int()).toBe(leftMask & ~rightMask)
        expect(left.symmetricDifference(rightMask).int()).toBe(
          leftMask ^ rightMask,
        )
      }
    }
  })
})
