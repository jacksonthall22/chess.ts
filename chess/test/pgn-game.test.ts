import { describe, expect, test } from 'vitest'

import * as chess from '../index'
import * as pgn from '../pgn'
import { Cp, Mate, PovScore } from '../engine'
import { Arrow } from '../svg'
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

    const virtualFile = new pgn.StringIO()
    const fileExporter = new pgn.FileExporter(virtualFile)
    game.accept(fileExporter)
    this.assertEqual(virtualFile.read(), `${exported}\n\n`)
  }

  testCommentAtEol(): void {
    const source =
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. Nbd2 a6 $6 (6... Bb6 $5 {\n/\\ Ne7, c6}) *'
    const game = pgn.readGame(new pgn.StringIO(source))
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }

    // Seek the node after 6.Nbd2 and before 6...a6.
    let node: pgn.GameNode = game
    while (
      node.variations.length !== 0 &&
      !node.hasVariation(chess.Move.fromUci('a7a6'))
    ) {
      node = node.getitem(0)
    }

    // Make sure the comment for the second variation is there.
    this.assertIn(5, node.getitem(1).nags)
    this.assertEqual(node.getitem(1).comment, '\n/\\ Ne7, c6')
  }

  testGameStartingComment(): void {
    let game = pgn.readGame(
      new pgn.StringIO('{ Game starting comment } 1. d3'),
    )
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    this.assertEqual(game.comment, 'Game starting comment')
    this.assertEqual(game.getitem(0).san(), 'd3')

    game = pgn.readGame(
      new pgn.StringIO('{ Empty game, but has a comment }'),
    )
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    this.assertEqual(game.comment, 'Empty game, but has a comment')
  }

  testGameStartingVariation(): void {
    const source =
      '{Start of game} 1. e4 ({Start of variation} 1. d4) 1... e5\n'
    const game = pgn.readGame(new pgn.StringIO(source))
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    this.assertEqual(game.comment, 'Start of game')

    let node = game.getitem(0)
    this.assertEqual(node.move, chess.Move.fromUci('e2e4'))
    this.assertFalse(node.comment)
    this.assertFalse(node.startingComment)

    node = game.getitem(1)
    this.assertEqual(node.move, chess.Move.fromUci('d2d4'))
    this.assertFalse(node.comment)
    this.assertEqual(node.startingComment, 'Start of variation')
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

  testAnnotations(): void {
    const game = new pgn.Game()
    game.comment = 'foo [%bar] baz'

    this.assertTrue(game.clock() === null)
    const clock = 12345
    game.setClock(clock)
    this.assertEqual(game.comment, 'foo [%bar] baz [%clk 3:25:45]')
    this.assertEqual(game.clock(), clock)

    this.assertTrue(game.eval() === null)
    game.setEval(new PovScore(new Cp(-80), chess.WHITE))
    this.assertEqual(
      game.comment,
      'foo [%bar] baz [%clk 3:25:45] [%eval -0.80]',
    )
    const centipawnEval = game.eval()
    if (centipawnEval === null) {
      throw new Error('Expected a centipawn evaluation annotation')
    }
    this.assertEqual(centipawnEval.white().score(), -80)
    this.assertEqual(game.evalDepth(), null)

    game.setEval(new PovScore(new Mate(1), chess.WHITE), 5)
    this.assertEqual(
      game.comment,
      'foo [%bar] baz [%clk 3:25:45] [%eval #1,5]',
    )
    const mateEval = game.eval()
    if (mateEval === null) {
      throw new Error('Expected a mate evaluation annotation')
    }
    this.assertEqual(mateEval.white().mate(), 1)
    this.assertEqual(game.evalDepth(), 5)

    this.assertEqual(game.arrows(), [])
    const highlightedSquare: [chess.Square, chess.Square] = [
      chess.A1,
      chess.A1,
    ]
    game.setArrows([
      highlightedSquare,
      new Arrow(chess.A1, chess.H1, { color: 'red' }),
      new Arrow(chess.B1, chess.B8),
    ])
    this.assertEqual(
      game.comment,
      '[%csl Ga1][%cal Ra1h1,Gb1b8] foo [%bar] baz [%clk 3:25:45] [%eval #1,5]',
    )
    const arrows = game.arrows()
    this.assertEqual(arrows.length, 3)
    this.assertEqual(arrows[0].color, 'green')
    this.assertEqual(arrows[1].color, 'red')
    this.assertEqual(arrows[2].color, 'green')

    this.assertTrue(game.emt() === null)
    const emt = 321
    game.setEmt(emt)
    this.assertEqual(
      game.comment,
      '[%csl Ga1][%cal Ra1h1,Gb1b8] foo [%bar] baz [%clk 3:25:45] [%eval #1,5] [%emt 0:05:21]',
    )
    this.assertEqual(game.emt(), emt)

    game.setEval(null)
    this.assertEqual(
      game.comment,
      '[%csl Ga1][%cal Ra1h1,Gb1b8] foo [%bar] baz [%clk 3:25:45] [%emt 0:05:21]',
    )

    game.setEmt(null)
    this.assertEqual(
      game.comment,
      '[%csl Ga1][%cal Ra1h1,Gb1b8] foo [%bar] baz [%clk 3:25:45]',
    )

    game.setClock(null)
    game.setArrows([])
    this.assertEqual(game.comment, 'foo [%bar] baz')
  }

  testFloatEmt(): void {
    const game = new pgn.Game()
    game.comment = '[%emt 0:00:01.234]'
    this.assertEqual(game.emt(), 1.234)

    game.setEmt(6.54321)
    this.assertEqual(game.comment, '[%emt 0:00:06.543]')
    this.assertEqual(game.emt(), 6.543)

    game.setEmt(-70)
    this.assertEqual(game.comment, '[%emt 0:00:00]')
    this.assertEqual(game.emt(), 0)
  }

  testFloatClk(): void {
    const game = new pgn.Game()
    game.comment = '[%clk 0:00:01.234]'
    this.assertEqual(game.clock(), 1.234)

    game.setClock(6.54321)
    this.assertEqual(game.comment, '[%clk 0:00:06.543]')
    this.assertEqual(game.clock(), 6.543)

    game.setClock(-70)
    this.assertEqual(game.comment, '[%clk 0:00:00]')
    this.assertEqual(game.clock(), 0)
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
    testExporter: 2084,
    testPromoteToMain: 2185,
    testCommentAtEol: 2223,
    testGameStartingComment: 2322,
    testGameStartingVariation: 2332,
    testTreeTraversal: 2372,
    testPromoteDemote: 2403,
    testAddLine: 2684,
    testMainline: 2701,
    testAnnotations: 2826,
    testFloatEmt: 2877,
    testFloatClk: 2890,
  },
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

  test('clock annotations use Python float formatting', () => {
    const game = new pgn.Game()
    const cases = [
      [Number.NaN, '00'],
      [1.0625, '01.062'],
      [1.3125, '01.312'],
      [2.6755, '02.675'],
    ] as const

    for (const [seconds, formatted] of cases) {
      game.comment = ''
      game.setClock(seconds)
      expect(game.comment).toBe(`[%clk 0:00:${formatted}]`)

      game.comment = ''
      game.setEmt(seconds)
      expect(game.comment).toBe(`[%emt 0:00:${formatted}]`)
    }
  })

  test('export wrapping counts Unicode code points', () => {
    const game = new pgn.Game()
    const comment = `${'x'.repeat(72)}😀`
    game.comment = comment

    expect(
      game.accept(new pgn.StringExporter({ headers: false, columns: 80 })),
    ).toBe(`{ ${comment} } *`)
  })

  test('export removes every closing brace from comments', () => {
    const game = new pgn.Game()
    game.comment = 'a}b}c'

    expect(
      game.accept(new pgn.StringExporter({ headers: false, columns: null })),
    ).toBe('{ abc } *')
  })
})
