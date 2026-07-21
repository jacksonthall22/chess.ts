import * as chess from '../index'
import { registerTestCase, TestCase } from './unittest'

const squareValues = (squares: chess.SquareSet): Set<chess.Square> =>
  new Set(squares.iter())

// The translated `IntoSquareSet` declaration does not currently recognize a
// SquareSet as iterable. Keep the upstream SquareSet-to-SquareSet calls intact
// at runtime so the tests characterize that public parity gap.
const asIntoSquareSet = (squares: chess.SquareSet): chess.IntoSquareSet =>
  squares as unknown as chess.IntoSquareSet

const setsAreDisjoint = <T>(left: Set<T>, right: Set<T>): boolean =>
  Array.from(left).every(value => !right.has(value))

const isSubset = <T>(left: Set<T>, right: Set<T>): boolean =>
  Array.from(left).every(value => right.has(value))

const setUnion = <T>(left: Set<T>, right: Set<T>): Set<T> =>
  new Set([...left, ...right])

const setIntersection = <T>(left: Set<T>, right: Set<T>): Set<T> =>
  new Set(Array.from(left).filter(value => right.has(value)))

const setDifference = <T>(left: Set<T>, right: Set<T>): Set<T> =>
  new Set(Array.from(left).filter(value => !right.has(value)))

const setSymmetricDifference = <T>(left: Set<T>, right: Set<T>): Set<T> =>
  setUnion(setDifference(left, right), setDifference(right, left))

/** Mechanical translation of python-chess `LegalMoveGeneratorTestCase` at cd7f5958. */
class LegalMoveGeneratorTestCase extends TestCase {
  testListConversion(): void {
    this.assertEqual(Array.from(new chess.Board().legalMoves).length, 20)
  }

  testNonzero(): void {
    // JavaScript objects are always truthy, so invoke the generator's explicit
    // Python-truthiness equivalent instead of coercing the wrapper object.
    this.assertTrue(new chess.Board().legalMoves.bool())
    this.assertTrue(new chess.Board().pseudoLegalMoves.bool())

    const caroKannMate = new chess.Board(
      'r1bqkb1r/pp1npppp/2pN1n2/8/3P4/8/PPP1QPPP/R1B1KBNR b KQkq - 4 6',
    )
    this.assertFalse(caroKannMate.legalMoves.bool())
    this.assertTrue(caroKannMate.pseudoLegalMoves.bool())
  }

  testStringConversion(): void {
    const board = new chess.Board(
      'r3k1nr/ppq1pp1p/2p3p1/8/1PPR4/2N5/P3QPPP/5RK1 b kq b3 0 16',
    )

    // TypeScript exposes one canonical string conversion rather than Python's
    // separate str() and repr() protocols. Retain both upstream assertions
    // against that canonical representation.
    this.assertIn('Qxh2+', board.legalMoves.toString())
    this.assertIn('Qxh2+', board.legalMoves.toString())

    this.assertIn('Qxh2+', board.pseudoLegalMoves.toString())
    this.assertIn('Qxh2+', board.pseudoLegalMoves.toString())
    this.assertIn('e8d7', board.pseudoLegalMoves.toString())
    this.assertIn('e8d7', board.pseudoLegalMoves.toString())
  }

  testTraverseOnce(): void {
    class MockBoard {
      // A semicolon is required before a generator method because otherwise
      // JavaScript parses the leading `*` as a continuation of this field.
      traversals = 0;

      *generateLegalMoves(): IterableIterator<chess.Move> {
        this.traversals += 1
      }
    }

    const board = new MockBoard()
    // The deliberately minimal upstream mock is structurally incomplete for
    // Board; the cast preserves its focused traversal-counting purpose.
    const generator = new chess.LegalMoveGenerator(
      board as unknown as chess.Board,
    )
    Array.from(generator)
    this.assertEqual(board.traversals, 1)
  }
}

registerTestCase('LegalMoveGeneratorTestCase', LegalMoveGeneratorTestCase, {
  // Both move-generator iterators return a nested iterator instead of
  // delegating with `yield*`, so JavaScript observes an empty traversal.
  expectedFailures: [
    'testListConversion',
    'testStringConversion',
    'testTraverseOnce',
  ],
  lines: {
    testListConversion: 1716,
    testNonzero: 1719,
    testStringConversion: 1727,
    testTraverseOnce: 1738,
  },
})

/** Mechanical translation of python-chess `BaseBoardTestCase` at cd7f5958. */
class BaseBoardTestCase extends TestCase {
  testSetPieceMap(): void {
    const a = chess.BaseBoard.empty()
    const b = new chess.BaseBoard()
    a.setPieceMap(b.pieceMap())
    this.assertEqual(a, b)
    a.setPieceMap(new Map())
    this.assertNotEqual(a, b)
  }
}

registerTestCase('BaseBoardTestCase', BaseBoardTestCase, {
  // BaseBoard's translated default currently clears instead of resetting.
  expectedFailures: ['testSetPieceMap'],
  lines: {
    testSetPieceMap: 1756,
  },
})

/** Mechanical translation of python-chess `SquareSetTestCase` at cd7f5958. */
class SquareSetTestCase extends TestCase {
  testEquality(): void {
    const a1 = new chess.SquareSet(chess.BB_RANK_4)
    const a2 = new chess.SquareSet(chess.BB_RANK_4)
    const b1 = new chess.SquareSet(chess.BB_RANK_5 | chess.BB_RANK_6)
    const b2 = new chess.SquareSet(chess.BB_RANK_5 | chess.BB_RANK_6)

    this.assertEqual(a1, a2)
    this.assertEqual(b1, b2)
    this.assertFalse(!a1.equals(a2))
    this.assertFalse(!b1.equals(b2))

    this.assertNotEqual(a1, b1)
    this.assertNotEqual(a2, b2)
    this.assertFalse(a1.equals(b1))
    this.assertFalse(a2.equals(b2))

    this.assertEqual(new chess.SquareSet(chess.BB_ALL), chess.BB_ALL)
    this.assertEqual(chess.BB_ALL, new chess.SquareSet(chess.BB_ALL))

    // The cast bridges the incomplete translated type declaration while
    // preserving the upstream SquareSet-to-SquareSet constructor call.
    this.assertEqual(
      new chess.SquareSet(asIntoSquareSet(new chess.SquareSet(999n))).int(),
      999n,
    )
    this.assertEqual(new chess.SquareSet([chess.B8]), chess.BB_B8)
  }

  testStringConversion(): void {
    const expected = [
      '. . . . . . . 1',
      '. 1 . . . . . .',
      '. . . . . . . .',
      '. . . . . . . .',
      '. . . . . . . .',
      '. . . . . . . .',
      '. . . . . . . .',
      '1 1 1 1 1 1 1 1',
    ].join('\n')

    const bb = new chess.SquareSet(
      chess.BB_H8 | chess.BB_B7 | chess.BB_RANK_1,
    )
    this.assertEqual(bb.toString(), expected)
  }

  testIter(): void {
    const bb = new chess.SquareSet(chess.BB_G7 | chess.BB_G8)
    this.assertEqual(Array.from(bb.iter()), [chess.G7, chess.G8])
  }

  testReversed(): void {
    const bb = new chess.SquareSet(
      chess.BB_A1 | chess.BB_B1 | chess.BB_A7 | chess.BB_E1,
    )
    this.assertEqual(Array.from(bb.reversed()), [
      chess.A7,
      chess.E1,
      chess.B1,
      chess.A1,
    ])
  }

  testArithmetic(): void {
    // JavaScript does not support operator overloading. SquareSet's named
    // methods are the direct equivalents of the upstream bitwise operations.
    this.assertEqual(
      new chess.SquareSet(chess.BB_RANK_2).and(chess.BB_FILE_D),
      chess.BB_D2,
    )
    this.assertEqual(
      new chess.SquareSet(chess.BB_ALL).xor(chess.BB_EMPTY),
      chess.BB_ALL,
    )
    this.assertEqual(
      new chess.SquareSet(chess.BB_C1).or(chess.BB_FILE_C),
      chess.BB_FILE_C,
    )

    const bb = new chess.SquareSet(chess.BB_EMPTY)
    bb.ixor(chess.BB_ALL)
    this.assertEqual(bb, chess.BB_ALL)
    bb.iand(chess.BB_E4)
    this.assertEqual(bb, chess.BB_E4)
    bb.ior(chess.BB_RANK_4)
    this.assertEqual(bb, chess.BB_RANK_4)

    this.assertEqual(
      new chess.SquareSet(chess.BB_F3).lshift(1n),
      chess.BB_G3,
    )
    this.assertEqual(
      new chess.SquareSet(chess.BB_C8).rshift(2n),
      chess.BB_A8,
    )

    const shifted = new chess.SquareSet(chess.BB_D1)
    shifted.ilshift(1n)
    this.assertEqual(shifted, chess.BB_E1)
    shifted.irshift(2n)
    this.assertEqual(shifted, chess.BB_C1)
  }

  testImmutableSetOperations(): void {
    const examples = [
      chess.BB_EMPTY,
      chess.BB_A1,
      chess.BB_A2,
      chess.BB_RANK_1,
      chess.BB_RANK_2,
      chess.BB_FILE_A,
      chess.BB_FILE_E,
    ]

    for (const a of examples) {
      this.assertEqual(new chess.SquareSet(a).copy(), a)
    }

    for (const aMask of examples) {
      const a = new chess.SquareSet(aMask)
      for (const bMask of examples) {
        const b = new chess.SquareSet(bMask)
        const nativeA = squareValues(a)
        const nativeB = squareValues(b)

        // The casts bridge the incomplete translated type declaration while
        // deliberately preserving upstream's direct SquareSet arguments.
        this.assertEqual(
          setsAreDisjoint(nativeA, nativeB),
          a.isdisjoint(asIntoSquareSet(b)),
        )
        this.assertEqual(
          isSubset(nativeA, nativeB),
          a.issubset(asIntoSquareSet(b)),
        )
        this.assertEqual(
          isSubset(nativeB, nativeA),
          a.issuperset(asIntoSquareSet(b)),
        )
        this.assertEqual(
          setUnion(nativeA, nativeB),
          squareValues(a.union(asIntoSquareSet(b))),
        )
        this.assertEqual(
          setIntersection(nativeA, nativeB),
          squareValues(a.intersection(asIntoSquareSet(b))),
        )
        this.assertEqual(
          setDifference(nativeA, nativeB),
          squareValues(a.difference(asIntoSquareSet(b))),
        )
        this.assertEqual(
          setSymmetricDifference(nativeA, nativeB),
          squareValues(
            a.symmetricDifference(asIntoSquareSet(b)) as unknown as chess.SquareSet,
          ),
        )
      }
    }
  }

  testMutableSetOperations(): void {
    const squares = new chess.SquareSet(chess.BB_A1)
    squares.update(chess.BB_FILE_H)
    this.assertEqual(squares, chess.BB_A1 | chess.BB_FILE_H)

    squares.intersectionUpdate(chess.BB_RANK_8)
    this.assertEqual(squares, chess.BB_H8)

    squares.differenceUpdate(chess.BB_A1)
    this.assertEqual(squares, chess.BB_H8)

    squares.symmetricDifferenceUpdate(chess.BB_A1)
    this.assertEqual(squares, chess.BB_A1 | chess.BB_H8)

    squares.add(chess.A3)
    this.assertEqual(squares, chess.BB_A1 | chess.BB_A3 | chess.BB_H8)

    squares.remove(chess.H8)
    this.assertEqual(squares, chess.BB_A1 | chess.BB_A3)

    this.assertRaises(Error, () => squares.remove(chess.H8))

    squares.discard(chess.H8)

    squares.discard(chess.A1)
    this.assertEqual(squares, chess.BB_A3)

    squares.clear()
    this.assertEqual(squares, chess.BB_EMPTY)

    this.assertRaises(Error, () => squares.pop())

    squares.add(chess.C7)
    this.assertEqual(squares.pop(), chess.C7)
    this.assertEqual(squares, chess.BB_EMPTY)
  }

  testFromSquare(): void {
    this.assertEqual(chess.SquareSet.fromSquare(chess.H5), chess.BB_H5)
    this.assertEqual(chess.SquareSet.fromSquare(chess.C2), chess.BB_C2)
  }

  testCarryRippler(): void {
    this.assertEqual(
      Array.from(new chess.SquareSet(chess.BB_D1).carryRippler()).length,
      2 ** 1,
    )
    this.assertEqual(
      Array.from(new chess.SquareSet(chess.BB_FILE_B).carryRippler()).length,
      2 ** 8,
    )
  }

  testMirror(): void {
    this.assertEqual(
      new chess.SquareSet(0x00a2_0900_0004_a600n).mirror(),
      0x00a6_0400_0009_a200n,
    )
    this.assertEqual(
      new chess.SquareSet(0x1e22_2212_0e0a_1222n).mirror(),
      0x2212_0a0e_1222_221en,
    )
  }

  testFlip(): void {
    this.assertEqual(chess.flipVertical(chess.BB_ALL), chess.BB_ALL)
    this.assertEqual(chess.flipHorizontal(chess.BB_ALL), chess.BB_ALL)
    this.assertEqual(chess.flipDiagonal(chess.BB_ALL), chess.BB_ALL)
    this.assertEqual(chess.flipAntiDiagonal(chess.BB_ALL), chess.BB_ALL)

    const s = new chess.SquareSet(0x1e22_2212_0e0a_1222n) // Letter R.
    this.assertEqual(chess.flipVertical(s.int()), 0x2212_0a0e_1222_221en)
    this.assertEqual(chess.flipHorizontal(s.int()), 0x7844_4448_7050_4844n)
    this.assertEqual(chess.flipDiagonal(s.int()), 0x0000_6192_8c88_ff00n)
    this.assertEqual(chess.flipAntiDiagonal(s.int()), 0x00ff_1131_4986_0000n)
  }

  testLenOfComplenent(): void {
    const squares = new chess.SquareSet(~chess.BB_ALL)
    this.assertEqual(squares.length(), 0)

    const complement = new chess.SquareSet(chess.BB_BACKRANKS).invert()
    this.assertEqual(complement.length(), 48)
  }

  testIntConversion(): void {
    const center = new chess.SquareSet(chess.BB_CENTER).int()
    this.assertEqual(center, 0x0000_0018_1800_0000n)
    this.assertEqual(`0x${center.toString(16)}`, '0x1818000000')
    this.assertEqual(`0b${center.toString(2)}`, '0b1100000011000000000000000000000000000')
  }

  testTolist(): void {
    this.assertEqual(
      new chess.SquareSet(chess.BB_LIGHT_SQUARES)
        .tolist()
        .filter(Boolean).length,
      32,
    )
  }

  testFlipDucktyping(): void {
    const bb = 0x1e22_2212_0e0a_1222n
    const squares = new chess.SquareSet(bb)
    const flips = [
      chess.flipVertical,
      chess.flipHorizontal,
      chess.flipDiagonal,
      chess.flipAntiDiagonal,
    ]
    for (const flip of flips) {
      // Python's SquareSet is an int subclass. TypeScript makes that same
      // conversion explicit before calling bitboard functions.
      this.assertEqual(flip(squares.int()), flip(bb))
      this.assertEqual(squares.int(), bb) // Not mutated.
    }
  }
}

registerTestCase('SquareSetTestCase', SquareSetTestCase, {
  // SquareSet currently compares only against bigint and does not implement
  // the iterable protocol expected by its own set-to-set operations.
  expectedFailures: ['testEquality', 'testImmutableSetOperations'],
  lines: {
    testEquality: 1767,
    testStringConversion: 1789,
    testIter: 1803,
    testReversed: 1807,
    testArithmetic: 1811,
    testImmutableSetOperations: 1833,
    testMutableSetOperations: 1859,
    testFromSquare: 1897,
    testCarryRippler: 1901,
    testMirror: 1905,
    testFlip: 1909,
    testLenOfComplenent: 1921,
    testIntConversion: 1928,
    testTolist: 1933,
    testFlipDucktyping: 1936,
  },
})
