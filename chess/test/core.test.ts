import * as chess from '../index'
import { describe, expect, test } from 'vitest'
import { registerTestCase, TestCase } from './unittest'

/** Mechanical translation of python-chess `SquareTestCase` at cd7f5958. */
class SquareTestCase extends TestCase {
  testSquare(): void {
    for (const square of chess.SQUARES) {
      const fileIndex = chess.squareFile(square)
      const rankIndex = chess.squareRank(square)
      this.assertEqual(
        chess.square(fileIndex, rankIndex),
        square,
        chess.squareName(square),
      )
    }
  }

  testShifts(): void {
    const shifts = [
      chess.shiftDown,
      chess.shift2Down,
      chess.shiftUp,
      chess.shift2Up,
      chess.shiftRight,
      chess.shift2Right,
      chess.shiftLeft,
      chess.shift2Left,
      chess.shiftUpLeft,
      chess.shiftUpRight,
      chess.shiftDownLeft,
      chess.shiftDownRight,
    ]

    for (const shift of shifts) {
      for (const bbSquare of chess.BB_SQUARES) {
        const shifted = shift(bbSquare)
        const count = chess.popcount(shifted)
        this.assertLessEqual(count, 1)
        this.assertEqual(count, chess.popcount(shifted & chess.BB_ALL))
      }
    }
  }

  testParseSquare(): void {
    this.assertEqual(chess.parseSquare('a1'), 0)
    this.assertRaises(Error, () => chess.parseSquare('A1'))
    this.assertRaises(Error, () => chess.parseSquare('a0'))
  }

  testSquareDistance(): void {
    this.assertEqual(chess.squareDistance(chess.A1, chess.A1), 0)
    this.assertEqual(chess.squareDistance(chess.A1, chess.H8), 7)
    this.assertEqual(chess.squareDistance(chess.E1, chess.E8), 7)
    this.assertEqual(chess.squareDistance(chess.A4, chess.H4), 7)
    this.assertEqual(chess.squareDistance(chess.D4, chess.E5), 1)
  }

  testSquareManhattanDistance(): void {
    this.assertEqual(chess.squareManhattanDistance(chess.A1, chess.A1), 0)
    this.assertEqual(chess.squareManhattanDistance(chess.A1, chess.H8), 14)
    this.assertEqual(chess.squareManhattanDistance(chess.E1, chess.E8), 7)
    this.assertEqual(chess.squareManhattanDistance(chess.A4, chess.H4), 7)
    this.assertEqual(chess.squareManhattanDistance(chess.D4, chess.E5), 2)
  }

  testSquareKnightDistance(): void {
    this.assertEqual(chess.squareKnightDistance(chess.A1, chess.A1), 0)
    this.assertEqual(chess.squareKnightDistance(chess.A1, chess.H8), 6)
    this.assertEqual(chess.squareKnightDistance(chess.G1, chess.F3), 1)
    this.assertEqual(chess.squareKnightDistance(chess.E1, chess.E8), 5)
    this.assertEqual(chess.squareKnightDistance(chess.A4, chess.H4), 5)
    this.assertEqual(chess.squareKnightDistance(chess.A1, chess.B1), 3)
    this.assertEqual(chess.squareKnightDistance(chess.A1, chess.C3), 4)
    this.assertEqual(chess.squareKnightDistance(chess.A1, chess.B2), 4)
    this.assertEqual(chess.squareKnightDistance(chess.C1, chess.B2), 2)
  }
}

registerTestCase('SquareTestCase', SquareTestCase, {
  lines: {
    testSquare: 44,
    testShifts: 50,
    testParseSquare: 73,
    testSquareDistance: 80,
    testSquareManhattanDistance: 87,
    testSquareKnightDistance: 94,
  },
})

/** Mechanical translation of python-chess `MoveTestCase` at cd7f5958. */
class MoveTestCase extends TestCase {
  testEquality(): void {
    const a = new chess.Move(chess.A1, chess.A2)
    const b = new chess.Move(chess.A1, chess.A2)
    const c = new chess.Move(chess.H7, chess.H8, { promotion: chess.BISHOP })
    const d1 = new chess.Move(chess.H7, chess.H8)
    const d2 = new chess.Move(chess.H7, chess.H8)

    this.assertEqual(a, b)
    this.assertEqual(b, a)
    this.assertEqual(d1, d2)

    this.assertNotEqual(a, c)
    this.assertNotEqual(c, d1)
    this.assertNotEqual(b, d1)
    this.assertFalse(!d1.equals(d2))
  }

  testUciParsing(): void {
    this.assertEqual(chess.Move.fromUci('b5c7').uci(), 'b5c7')
    this.assertEqual(chess.Move.fromUci('e7e8q').uci(), 'e7e8q')
    this.assertEqual(chess.Move.fromUci('P@e4').uci(), 'P@e4')
    this.assertEqual(chess.Move.fromUci('B@f4').uci(), 'B@f4')
    this.assertEqual(chess.Move.fromUci('0000').uci(), '0000')
  }

  testInvalidUci(): void {
    this.assertRaises(chess.InvalidMoveError, () => chess.Move.fromUci(''))
    this.assertRaises(chess.InvalidMoveError, () => chess.Move.fromUci('N'))
    this.assertRaises(chess.InvalidMoveError, () => chess.Move.fromUci('z1g3'))
    this.assertRaises(chess.InvalidMoveError, () => chess.Move.fromUci('Q@g9'))
  }

  testXboardMove(): void {
    this.assertEqual(chess.Move.fromUci('b5c7').xboard(), 'b5c7')
    this.assertEqual(chess.Move.fromUci('e7e8q').xboard(), 'e7e8q')
    this.assertEqual(chess.Move.fromUci('P@e4').xboard(), 'P@e4')
    this.assertEqual(chess.Move.fromUci('B@f4').xboard(), 'B@f4')
    this.assertEqual(chess.Move.fromUci('0000').xboard(), '@@@@')
  }

  testCopy(): void {
    const a = chess.Move.fromUci('N@f3')
    const b = chess.Move.fromUci('a1h8')
    const c = chess.Move.fromUci('g7g8r')
    this.assertEqual(a.copy(), a)
    this.assertEqual(b.copy(), b)
    this.assertEqual(c.copy(), c)
  }
}

registerTestCase('MoveTestCase', MoveTestCase, {
  lines: {
    testEquality: 108,
    testUciParsing: 124,
    testInvalidUci: 131,
    testXboardMove: 144,
    testCopy: 151,
  },
})

describe('lc0-style null-move parsing', () => {
  test('Move.fromUci normalizes a1a1 to the canonical null move', () => {
    const move = chess.Move.fromUci('a1a1')

    expect(move.equals(chess.Move.null())).toBe(true)
    expect(move.bool()).toBe(false)
    expect(move.uci()).toBe('0000')
  })

  test('same-square moves remain invalid away from a1', () => {
    expect(() => chess.Move.fromUci('b1b1')).toThrow(chess.InvalidMoveError)
    expect(() => chess.Move.fromUci('h8h8')).toThrow(chess.InvalidMoveError)
  })
})

test('mirrored python-chess version tracks the upstream release', () => {
  expect(chess.__version__).toBe('1.11.2')
})

test('historical transpiler version remains independently versioned', () => {
  expect(chess.__transpiledVersion__).toBe('0.0.1')
})

/** Mechanical translation of python-chess `PieceTestCase` at cd7f5958. */
class PieceTestCase extends TestCase {
  testEquality(): void {
    const a = new chess.Piece(chess.BISHOP, chess.WHITE)
    const b = new chess.Piece(chess.KING, chess.BLACK)
    const c = new chess.Piece(chess.KING, chess.WHITE)
    const d1 = new chess.Piece(chess.BISHOP, chess.WHITE)
    const d2 = new chess.Piece(chess.BISHOP, chess.WHITE)

    // JavaScript Sets use object identity, so compare the canonical
    // representation to preserve Python's value-hash intent.
    this.assertEqual(new Set([a, b, c, d1, d2].map(piece => piece.toRepr())).size, 3)

    this.assertEqual(a, d1)
    this.assertEqual(d1, a)
    this.assertEqual(d1, d2)
    this.assertEqual(a.toRepr(), d1.toRepr())

    this.assertNotEqual(a, b)
    this.assertNotEqual(b, c)
    this.assertNotEqual(b, d1)
    this.assertNotEqual(a, c)
    this.assertFalse(d1.toRepr() !== d2.toRepr())

    this.assertNotEqual(a.toRepr(), b.toRepr())
    this.assertNotEqual(b.toRepr(), c.toRepr())
    this.assertNotEqual(b.toRepr(), d1.toRepr())
    this.assertNotEqual(a.toRepr(), c.toRepr())
  }

  testFromSymbol(): void {
    const whiteKnight = chess.Piece.fromSymbol('N')
    this.assertEqual(whiteKnight.color, chess.WHITE)
    this.assertEqual(whiteKnight.pieceType, chess.KNIGHT)
    this.assertEqual(whiteKnight.symbol(), 'N')
    this.assertEqual(whiteKnight.toString(), 'N')

    const blackQueen = chess.Piece.fromSymbol('q')
    this.assertEqual(blackQueen.color, chess.BLACK)
    this.assertEqual(blackQueen.pieceType, chess.QUEEN)
    this.assertEqual(blackQueen.symbol(), 'q')
    this.assertEqual(blackQueen.toString(), 'q')
  }

  testHash(): void {
    const pieces = 'pnbrqkPNBRQK'.split('').map(chess.Piece.fromSymbol)
    // JavaScript Sets use identity for objects. The canonical representation
    // preserves the upstream uniqueness assertion; hash() itself is direct.
    this.assertEqual(new Set(pieces.map(piece => piece.toRepr())).size, 12)
    this.assertEqual(
      new Set(pieces.map(piece => piece.hash())),
      new Set(Array.from({ length: 12 }, (_, index) => index)),
    )
  }
}

registerTestCase('PieceTestCase', PieceTestCase, {
  lines: {
    testEquality: 162,
    testFromSymbol: 188,
    testHash: 203,
  },
})
