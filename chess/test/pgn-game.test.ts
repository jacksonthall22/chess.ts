import { describe, expect, test } from 'vitest'

import * as chess from '../index'
import * as pgn from '../pgn'
import { registerTestCase, TestCase } from './unittest'

/**
 * Mechanical translation of the variation-tree portions of python-chess
 * `PgnTestCase` at cd7f5958.
 */
class PgnTestCase extends TestCase {
  testExporter(): void {
    const game = new pgn.Game()
    game.comment = 'Test game:'
    game.headers.set('Result', '*')
    game.headers.set(
      'VeryLongHeader',
      'This is a very long header, much wider than the 80 columns that PGNs are formatted with by default',
    )

    const e4 = game.addVariation(game.board().parseSan('e4'))
    e4.comment = 'Scandinavian Defense:'

    const e4D5 = e4.addVariation(e4.board().parseSan('d5'))

    const e4H5 = e4.addVariation(e4.board().parseSan('h5'))
    e4H5.nags.add(pgn.NAG_MISTAKE)
    e4H5.startingComment = 'This'
    e4H5.comment = 'is nonsense'

    const e4E5 = e4.addVariation(e4.board().parseSan('e5'))
    const e4E5Qf3 = e4E5.addVariation(e4E5.board().parseSan('Qf3'))
    e4E5Qf3.nags.add(pgn.NAG_MISTAKE)

    const e4C5 = e4.addVariation(e4.board().parseSan('c5'))
    e4C5.comment = 'Sicilian'

    const e4D5Exd5 = e4D5.addMainVariation(e4D5.board().parseSan('exd5'))
    e4D5Exd5.comment = 'Best'

    let exporter = new pgn.StringExporter({
      headers: false,
      comments: false,
      variations: false,
    })
    game.accept(exporter)
    this.assertEqual(exporter.toString(), '1. e4 d5 2. exd5 *')

    exporter = new pgn.StringExporter({ headers: false, comments: false })
    game.accept(exporter)
    this.assertEqual(
      exporter.toString(),
      '1. e4 d5 ( 1... h5 ) ( 1... e5 2. Qf3 ) ( 1... c5 ) 2. exd5 *',
    )

    exporter = new pgn.StringExporter()
    game.accept(exporter)
    const exported = `[Event "?"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "?"]
[Black "?"]
[Result "*"]
[VeryLongHeader "This is a very long header, much wider than the 80 columns that PGNs are formatted with by default"]

{ Test game: } 1. e4 { Scandinavian Defense: } 1... d5 ( { This } 1... h5 $2
{ is nonsense } ) ( 1... e5 2. Qf3 $2 ) ( 1... c5 { Sicilian } ) 2. exd5
{ Best } *`
    this.assertEqual(exporter.toString(), exported)

    // Keep the complete upstream method executable. This reaches the current
    // parity gap only after all StringExporter assertions above have passed.
    const FileExporter = (
      pgn as unknown as {
        FileExporter?: new (handle: pgn.StringIO) => pgn.BaseVisitor<unknown>
      }
    ).FileExporter
    if (FileExporter === undefined) {
      throw new Error('chess.ts has not implemented pgn.FileExporter')
    }
    const virtualFile = new pgn.StringIO()
    const fileExporter = new FileExporter(virtualFile)
    game.accept(fileExporter)
    this.assertEqual(virtualFile.read(), `${exported}\n\n`)
  }

  testPromoteToMain(): void {
    const e4 = chess.Move.fromUci('e2e4')
    const d4 = chess.Move.fromUci('d2d4')

    const node = new pgn.Game()
    node.addVariation(e4)
    node.addVariation(d4)
    this.assertEqual(
      node.variations.map(variation => variation.move),
      [e4, d4],
    )

    node.promoteToMain(d4)
    this.assertEqual(
      node.variations.map(variation => variation.move),
      [d4, e4],
    )
  }

  testTreeTraversal(): void {
    const game = new pgn.Game()
    const node = game.addVariation(new chess.Move(chess.E2, chess.E4))
    const alternativeNode = game.addVariation(
      new chess.Move(chess.D2, chess.D4),
    )
    const endNode = node.addVariation(new chess.Move(chess.E7, chess.E5))

    this.assertEqual(game.root(), game)
    this.assertEqual(node.root(), game)
    this.assertEqual(alternativeNode.root(), game)
    this.assertEqual(endNode.root(), game)

    this.assertEqual(game.end(), endNode)
    this.assertEqual(node.end(), endNode)
    this.assertEqual(endNode.end(), endNode)
    this.assertEqual(alternativeNode.end(), alternativeNode)

    this.assertTrue(game.isMainline())
    this.assertTrue(node.isMainline())
    this.assertTrue(endNode.isMainline())
    this.assertFalse(alternativeNode.isMainline())

    this.assertFalse(game.startsVariation())
    this.assertFalse(node.startsVariation())
    this.assertFalse(endNode.startsVariation())
    this.assertTrue(alternativeNode.startsVariation())

    this.assertFalse(game.isEnd())
    this.assertFalse(node.isEnd())
    this.assertTrue(alternativeNode.isEnd())
    this.assertTrue(endNode.isEnd())
  }

  testPromoteDemote(): void {
    const game = new pgn.Game()
    const a = game.addVariation(new chess.Move(chess.A2, chess.A3))
    const b = game.addVariation(new chess.Move(chess.B2, chess.B3))

    this.assertTrue(a.isMainVariation())
    this.assertFalse(b.isMainVariation())
    this.assertEqual(game.getitem(0), a)
    this.assertEqual(game.getitem(1), b)

    game.promote(b)
    this.assertTrue(b.isMainVariation())
    this.assertFalse(a.isMainVariation())
    this.assertEqual(game.getitem(0), b)
    this.assertEqual(game.getitem(1), a)

    game.demote(b)
    this.assertTrue(a.isMainVariation())

    const c = game.addMainVariation(new chess.Move(chess.C2, chess.C3))
    this.assertTrue(c.isMainVariation())
    this.assertFalse(a.isMainVariation())
    this.assertFalse(b.isMainVariation())
    this.assertEqual(game.getitem(0), c)
    this.assertEqual(game.getitem(1), a)
    this.assertEqual(game.getitem(2), b)
  }

  testAddLine(): void {
    const game = new pgn.Game()
    game.addVariation(chess.Move.fromUci('e2e4'))

    const moves = [
      chess.Move.fromUci('g1f3'),
      chess.Move.fromUci('d7d5'),
    ]

    const tail = game.addLine(moves, {
      startingComment: 'start',
      comment: 'end',
      nags: [17, 42],
    })

    this.assertEqual(tail.parent?.move, chess.Move.fromUci('g1f3'))
    this.assertEqual(tail.parent?.startingComment, 'start')
    this.assertEqual(tail.parent?.comment, '')
    this.assertEqual(tail.parent?.nags.size, 0)

    this.assertEqual(tail.move, chess.Move.fromUci('d7d5'))
    this.assertEqual(tail.comment, 'end')
    this.assertIn(42, tail.nags)
  }

  testMainline(): void {
    const moves = ['d2d3', 'g8f6', 'e2e4'].map(chess.Move.fromUci)

    const game = new pgn.Game()
    game.addLine(moves)

    this.assertEqual(Array.from(game.mainlineMoves()), moves)
    // JavaScript objects are always truthy, so use the explicit bool mirror.
    this.assertTrue(game.mainlineMoves().bool())
    this.assertEqual(
      Array.from(game.mainlineMoves().reversed()),
      [...moves].reverse(),
    )
    this.assertEqual(game.mainlineMoves().toString(), '1. d3 Nf6 2. e4')
  }
}

registerTestCase('PgnTestCase', PgnTestCase, {
  lines: {
    testExporter: 2079,
    testPromoteToMain: 2180,
    testTreeTraversal: 2367,
    testPromoteDemote: 2398,
    testAddLine: 2679,
    testMainline: 2696,
  },
  // FileExporter is still commented out, and GameNode.demote() contains a
  // mistranslated tuple swap. Keep both complete upstream methods active.
  expectedFailures: ['testExporter', 'testPromoteDemote'],
})

describe('GameNode parity characterizations not covered upstream', () => {
  test('StringExporter output round-trips the mainline and sidelines', () => {
    const game = new pgn.Game()
    const e4 = game.addVariation(chess.Move.fromUci('e2e4'))
    e4.addVariation(chess.Move.fromUci('e7e5'), { comment: 'open' })
    e4.addVariation(chess.Move.fromUci('c7c5'), { comment: 'sicilian' })

    const exported = game.toString()
    const parsed = pgn.readGame(new pgn.StringIO(exported))

    expect(parsed).not.toBeNull()
    expect(parsed?.errors).toEqual([])
    expect(
      parsed?.variations[0].variations.map(node => [
        node.move.uci(),
        node.comment,
      ]),
    ).toEqual([
      ['e7e5', 'open'],
      ['c7c5', 'sicilian'],
    ])
    expect(parsed?.toString()).toBe(exported)
  })

  test('same-move variations remain distinct and lookup selects the first', () => {
    const game = new pgn.Game()
    const move = chess.Move.fromUci('e2e4')

    const first = game.addVariation(move, { comment: 'first' })
    const second = game.addVariation(move.copy(), { comment: 'second' })
    first.addVariation(chess.Move.fromUci('e7e5'), { comment: 'first child' })
    second.addVariation(chess.Move.fromUci('c7c5'), {
      comment: 'second child',
    })

    expect(game.variations).toHaveLength(2)
    expect(first).not.toBe(second)
    expect(game.variation(move)).toBe(first)
    expect(game.variation(first)).toBe(first)
    expect(game.variation(second)).toBe(second)
    expect(game.variations.map(node => node.comment)).toEqual([
      'first',
      'second',
    ])

    const exported = game.toString()
    const parsed = pgn.readGame(new pgn.StringIO(exported))
    expect(parsed?.errors).toEqual([])
    expect(
      parsed?.variations.map(node => ({
        move: node.move.uci(),
        comment: node.comment,
        child: node.variations[0]?.move.uci(),
        childComment: node.variations[0]?.comment,
      })),
    ).toEqual([
      {
        move: 'e2e4',
        comment: 'first',
        child: 'e7e5',
        childComment: 'first child',
      },
      {
        move: 'e2e4',
        comment: 'second',
        child: 'c7c5',
        childComment: 'second child',
      },
    ])
    expect(parsed?.toString()).toBe(exported)
  })

  test('duplicate variations can be removed independently by node and move', () => {
    const game = new pgn.Game()
    const move = chess.Move.fromUci('e2e4')

    const first = game.addVariation(move, { comment: 'first' })
    const second = game.addVariation(move.copy(), { comment: 'second' })

    game.removeVariation(second)

    expect(game.variations).toEqual([first])
    expect(game.variations).not.toContain(second)
    expect(game.variation(move)).toBe(first)

    game.removeVariation(move)
    expect(game.variations).toEqual([])
  })
})
