import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, expectTypeOf, test, vi } from 'vitest'

import * as chess from '../index'
import * as pgn from '../pgn'
import { Cp, Mate, PovScore } from '../engine'
import { Arrow } from '../svg'
import { registerTestCase, TestCase } from './unittest'

/**
 * Mechanical translation of the variation-tree portions of python-chess
 * `PgnTestCase` at the pinned upstream state. The baseline began at cd7f5958.
 */
class PgnTestCase extends TestCase {
  testExporter(): void {
    const game = new pgn.Game()
    game.comments = ['Test game:']
    game.headers.set('Result', '*')
    game.headers.set(
      'VeryLongHeader',
      'This is a very long header, much wider than the 80 columns that PGNs are formatted with by default',
    )

    const e4 = game.addVariation(game.board().parseSan('e4'))
    e4.comments = ['Scandinavian Defense:']

    const e4D5 = e4.addVariation(e4.board().parseSan('d5'))

    const e4H5 = e4.addVariation(e4.board().parseSan('h5'))
    e4H5.nags.add(pgn.NAG_MISTAKE)
    e4H5.startingComments = ['This']
    e4H5.comments = ['is nonsense']

    const e4E5 = e4.addVariation(e4.board().parseSan('e5'))
    const e4E5Qf3 = e4E5.addVariation(e4E5.board().parseSan('Qf3'))
    e4E5Qf3.nags.add(pgn.NAG_MISTAKE)

    const e4C5 = e4.addVariation(e4.board().parseSan('c5'))
    e4C5.comments = ['Sicilian']

    const e4D5Exd5 = e4D5.addMainVariation(e4D5.board().parseSan('exd5'))
    e4D5Exd5.comments = ['Best', 'and the end of this {example}']

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
{ Best } { and the end of this example } *`
    this.assertEqual(exporter.toString(), exported)

    const virtualFile = new pgn.StringIO()
    const fileExporter = new pgn.FileExporter(virtualFile)
    game.accept(fileExporter)
    this.assertEqual(virtualFile.read(), `${exported}\n\n`)
  }

  testSetup(): void {
    const game = new pgn.Game()
    this.assertEqual(game.board(), new chess.Board())
    this.assertNotIn('FEN', game.headers)
    this.assertNotIn('SetUp', game.headers)
    this.assertNotIn('Variant', game.headers)

    let fen =
      'rnbqkbnr/pp1ppp1p/6p1/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4'
    game.setup(fen)
    this.assertEqual(game.headers.get('FEN'), fen)
    this.assertEqual(game.headers.get('SetUp'), '1')
    this.assertNotIn('Variant', game.headers)

    game.setup(chess.STARTING_FEN)
    this.assertNotIn('FEN', game.headers)
    this.assertNotIn('SetUp', game.headers)
    this.assertNotIn('Variant', game.headers)

    // Setup again, while starting FEN is already set.
    game.setup(chess.STARTING_FEN)
    this.assertNotIn('FEN', game.headers)
    this.assertNotIn('SetUp', game.headers)
    this.assertNotIn('Variant', game.headers)

    game.setup(new chess.Board(fen))
    this.assertEqual(game.headers.get('FEN'), fen)
    this.assertEqual(game.headers.get('SetUp'), '1')
    this.assertNotIn('Variant', game.headers)

    // Chess960 starting position #283.
    fen = 'rkbqrnnb/pppppppp/8/8/8/8/PPPPPPPP/RKBQRNNB w KQkq - 0 1'
    game.setup(fen)
    this.assertEqual(game.headers.get('FEN'), fen)
    this.assertEqual(game.headers.get('SetUp'), '1')
    this.assertEqual(game.headers.get('Variant'), 'Chess960')
    const board = game.board()
    this.assertTrue(board.chess960)
    this.assertEqual(board.fen(), fen)
  }

  testReadGame(): void {
    const source = readFileSync(
      resolve(
        __dirname,
        '../../python-chess/data/pgn/kasparov-deep-blue-1997.pgn',
      ),
      'utf8',
    )
    const handle = new pgn.StringIO(source)
    const firstGame = pgn.readGame(handle)
    const secondGame = pgn.readGame(handle)
    const thirdGame = pgn.readGame(handle)
    const fourthGame = pgn.readGame(handle)
    const fifthGame = pgn.readGame(handle)
    const sixthGame = pgn.readGame(handle)
    this.assertEqual(pgn.readGame(handle), null)

    if (
      firstGame === null ||
      secondGame === null ||
      thirdGame === null ||
      fourthGame === null ||
      fifthGame === null ||
      sixthGame === null
    ) {
      throw new Error('Expected the PGN fixture to contain six games')
    }

    this.assertEqual(
      firstGame.headers.get('Event'),
      'IBM Man-Machine, New York USA',
    )
    this.assertEqual(firstGame.headers.get('Site'), '01')
    this.assertEqual(firstGame.headers.get('Result'), '1-0')

    this.assertEqual(
      secondGame.headers.get('Event'),
      'IBM Man-Machine, New York USA',
    )
    this.assertEqual(secondGame.headers.get('Site'), '02')

    this.assertEqual(thirdGame.headers.get('ECO'), 'A00')
    this.assertEqual(fourthGame.headers.get('PlyCount'), '111')
    this.assertEqual(fifthGame.headers.get('Result'), '1/2-1/2')
    this.assertEqual(sixthGame.headers.get('White'), 'Deep Blue (Computer)')
    this.assertEqual(sixthGame.headers.get('Result'), '1-0')
  }

  testReadGameWithMulticommentMove(): void {
    const game = pgn.readGame(
      new pgn.StringIO(
        '1. e4 {A common opening} 1... e5 {A common response} {An uncommon comment}',
      ),
    )
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    const firstMove = game.variation(0)
    this.assertEqual(firstMove.comments, ['A common opening'])
    const secondMove = firstMove.variation(0)
    this.assertEqual(secondMove.comments, [
      'A common response',
      'An uncommon comment',
    ])
  }

  testReadGameWithLeadingWhitespaceBeforeHeader(): void {
    const source =
      ' [Event "TCEC Season 27 - Entrance League"]\n' +
      '[Site "https://tcec-chess.com"]\n' +
      '[White "Patricia 3.1_dev_ca7ef0a3"]\n' +
      '[Black "Weiss 2.1-dev11"]\n' +
      '[Result "*"]\n' +
      '\n' +
      '1. d4 *'

    const game = pgn.readGame(new pgn.StringIO(source))
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }

    this.assertEqual(
      game.headers.get('Event'),
      'TCEC Season 27 - Entrance League',
    )
    this.assertEqual(game.headers.get('White'), 'Patricia 3.1_dev_ca7ef0a3')
    this.assertEqual(game.next()?.move, chess.Move.fromUci('d2d4'))
    this.assertEqual(game.errors, [])
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
    this.assertEqual(node.getitem(1).comments, ['\n/\\ Ne7, c6'])
  }

  testVariationStack(): void {
    // Survive superfluous closing brackets.
    let game = pgn.readGame(new pgn.StringIO('1. e4 (1. d4))) !? *'))
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    this.assertEqual(game.getitem(0).san(), 'e4')
    this.assertEqual(game.getitem(0).uci(), 'e2e4')
    this.assertEqual(game.getitem(1).san(), 'd4')
    this.assertEqual(game.getitem(1).uci(), 'd2d4')
    this.assertEqual(game.errors.length, 0)

    // Survive superfluous opening brackets.
    game = pgn.readGame(new pgn.StringIO('((( 1. c4 *'))
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    this.assertEqual(game.getitem(0).san(), 'c4')
    this.assertEqual(game.errors.length, 0)
  }

  testGameStartingComment(): void {
    let game = pgn.readGame(
      new pgn.StringIO('{ Game starting comment } 1. d3'),
    )
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    this.assertEqual(game.comments, ['Game starting comment'])
    this.assertEqual(game.getitem(0).san(), 'd3')

    game = pgn.readGame(
      new pgn.StringIO('{ Empty game, but has a comment }'),
    )
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    this.assertEqual(game.comments, ['Empty game, but has a comment'])
  }

  testGameStartingVariation(): void {
    const source =
      '{Start of game} 1. e4 ({Start of variation} 1. d4) 1... e5\n'
    const game = pgn.readGame(new pgn.StringIO(source))
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    this.assertEqual(game.comments, ['Start of game'])

    let node = game.getitem(0)
    this.assertEqual(node.move, chess.Move.fromUci('e2e4'))
    this.assertFalse(node.comments.length !== 0)
    this.assertFalse(node.startingComments.length !== 0)

    node = game.getitem(1)
    this.assertEqual(node.move, chess.Move.fromUci('d2d4'))
    this.assertFalse(node.comments.length !== 0)
    this.assertEqual(node.startingComments, ['Start of variation'])
  }

  testAnnotationSymbols(): void {
    const game = pgn.readGame(
      new pgn.StringIO('1. b4?! g6 2. Bb2 Nc6? 3. Bxh8!!'),
    )
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }

    let node = game.variation(chess.Move.fromUci('b2b4'))
    this.assertIn(pgn.NAG_DUBIOUS_MOVE, node.nags)
    this.assertEqual(node.nags.size, 1)

    node = node.getitem(0)
    this.assertEqual(node.nags.size, 0)

    node = node.getitem(0)
    this.assertEqual(node.nags.size, 0)

    node = node.getitem(0)
    this.assertIn(pgn.NAG_MISTAKE, node.nags)
    this.assertEqual(node.nags.size, 1)

    node = node.getitem(0)
    this.assertIn(pgn.NAG_BRILLIANT_MOVE, node.nags)
    this.assertEqual(node.nags.size, 1)
  }

  testVisitBoard(): void {
    class TraceVisitor extends pgn.BaseVisitor<string[]> {
      trace: string[] = []

      visitBoard(board: chess.Board): void {
        this.trace.push(board.fen())
      }

      visitMove(board: chess.Board, move: chess.Move): void {
        this.trace.push(board.san(move))
      }

      result(): string[] {
        return this.trace
      }
    }

    const source = `[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]

1... e5 (1... d5 2. exd5) (1... c5) 2. Nf3 Nc6
`

    const trace = [
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      'e5',
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      'd5',
      'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      'exd5',
      'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
      'c5',
      'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      'Nf3',
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
      'Nc6',
      'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    ]

    this.assertEqual(
      trace,
      pgn.readGame<string[]>(new pgn.StringIO(source), {
        Visitor: TraceVisitor,
      }),
    )

    const game = pgn.readGame<pgn.Game>(new pgn.StringIO(source), {})
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    this.assertEqual(trace, game.accept(new TraceVisitor()))

    this.assertEqual(
      new chess.Board(trace.at(-1)),
      pgn.readGame<chess.Board>(new pgn.StringIO(source), {
        Visitor: pgn.BoardBuilder,
      }),
    )
  }

  testBlackToMove(): void {
    const game = new pgn.Game()
    game.setup('8/8/4k3/8/4P3/4K3/8/8 b - - 0 17')
    let node: pgn.GameNode = game
    node = node.addMainVariation(chess.Move.fromUci('e6d6'))
    node = node.addMainVariation(chess.Move.fromUci('e3d4'))
    node.addMainVariation(chess.Move.fromUci('d6e6'))

    const expected = `[Event "?"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "?"]
[Black "?"]
[Result "*"]
[FEN "8/8/4k3/8/4P3/4K3/8/8 b - - 0 17"]
[SetUp "1"]

17... Kd6 18. Kd4 Ke6 *`

    this.assertEqual(game.toString(), expected)
  }

  testErrors(): void {
    const handle = new pgn.StringIO(`
            1. e4 Qa1 e5 2. Qxf8

            1. a3`)
    const logger = vi.spyOn(pgn.LOGGER, 'error').mockImplementation(() => {})
    let game: pgn.Game | null
    try {
      game = pgn.readGame(handle)
    } finally {
      logger.mockRestore()
    }
    if (game === null) {
      throw new Error('Expected the PGN to contain the first game')
    }
    this.assertEqual(game.errors.length, 1)
    this.assertEqual(
      game.end().board().fen(),
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    )

    game = pgn.readGame(handle)
    if (game === null) {
      throw new Error('Expected the PGN to contain the second game')
    }
    this.assertEqual(
      game.end().board().fen(),
      'rnbqkbnr/pppppppp/8/8/8/P7/1PPPPPPP/RNBQKBNR b KQkq - 0 1',
    )
  }

  testSemicolonComment(): void {
    const game = pgn.readGame(new pgn.StringIO('1. e4 ; e5'))
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    const node = game.next()
    if (node === null) {
      throw new Error('Expected the game to contain a move')
    }
    this.assertEqual(node.move, chess.Move.fromUci('e2e4'))
    this.assertTrue(node.isEnd())
  }

  testNoMovetext(): void {
    const handle = new pgn.StringIO('[Event "A"]\n\n\n[Event "B"]\n')

    let game = pgn.readGame(handle)
    if (game === null) {
      throw new Error('Expected the PGN to contain the first game')
    }
    this.assertEqual(game.headers.get('Event'), 'A')

    game = pgn.readGame(handle)
    if (game === null) {
      throw new Error('Expected the PGN to contain the second game')
    }
    this.assertEqual(game.headers.get('Event'), 'B')

    this.assertEqual(pgn.readGame(handle), null)
  }

  testSubgame(): void {
    const game = pgn.readGame(
      new pgn.StringIO('1. d4 d5 (1... Nf6 2. c4 (2. Nf3 g6 3. g3))'),
    )
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    const mainline = game.next()
    if (mainline === null) {
      throw new Error('Expected the game to contain a move')
    }
    const node = mainline.variations[1]
    const subgame = node.acceptSubgame(new pgn.GameBuilder())
    this.assertEqual(
      subgame.headers.get('FEN'),
      'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2',
    )
    this.assertEqual(subgame.next()?.move, chess.Move.fromUci('c2c4'))
    this.assertEqual(
      subgame.variations[1].move,
      chess.Move.fromUci('g1f3'),
    )
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
    this.assertEqual(tail.parent?.startingComments, ['start'])
    this.assertEqual(tail.parent?.comments, [])
    this.assertEqual(tail.parent?.nags.size, 0)

    this.assertEqual(tail.move, chess.Move.fromUci('d7d5'))
    this.assertEqual(tail.comments, ['end'])
    this.assertIn(42, tail.nags)
  }

  testAnnotations(): void {
    const game = new pgn.Game()
    game.comments = ['foo [%bar] baz']

    this.assertTrue(game.clock() === null)
    const clock = 12345
    game.setClock(clock)
    this.assertEqual(game.comments, ['foo [%bar] baz', '[%clk 3:25:45]'])
    this.assertEqual(game.clock(), clock)

    this.assertTrue(game.eval() === null)
    game.setEval(new PovScore(new Cp(-80), chess.WHITE))
    this.assertEqual(
      game.comments,
      ['foo [%bar] baz', '[%clk 3:25:45]', '[%eval -0.80]'],
    )
    const centipawnEval = game.eval()
    if (centipawnEval === null) {
      throw new Error('Expected a centipawn evaluation annotation')
    }
    this.assertEqual(centipawnEval.white().score(), -80)
    this.assertEqual(game.evalDepth(), null)

    game.setEval(new PovScore(new Mate(1), chess.WHITE), 5)
    this.assertEqual(
      game.comments,
      ['foo [%bar] baz', '[%clk 3:25:45]', '[%eval #1,5]'],
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
      game.comments,
      [
        '[%csl Ga1][%cal Ra1h1,Gb1b8]',
        'foo [%bar] baz',
        '[%clk 3:25:45]',
        '[%eval #1,5]',
      ],
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
      game.comments,
      [
        '[%csl Ga1][%cal Ra1h1,Gb1b8]',
        'foo [%bar] baz',
        '[%clk 3:25:45]',
        '[%eval #1,5]',
        '[%emt 0:05:21]',
      ],
    )
    this.assertEqual(game.emt(), emt)

    game.setEval(null)
    this.assertEqual(
      game.comments,
      [
        '[%csl Ga1][%cal Ra1h1,Gb1b8]',
        'foo [%bar] baz',
        '[%clk 3:25:45]',
        '[%emt 0:05:21]',
      ],
    )

    game.setEmt(null)
    this.assertEqual(
      game.comments,
      [
        '[%csl Ga1][%cal Ra1h1,Gb1b8]',
        'foo [%bar] baz',
        '[%clk 3:25:45]',
      ],
    )

    game.setClock(null)
    game.setArrows([])
    this.assertEqual(game.comments, ['foo [%bar] baz'])
  }

  testFloatEmt(): void {
    const game = new pgn.Game()
    game.comments = ['[%emt 0:00:01.234]']
    this.assertEqual(game.emt(), 1.234)

    game.setEmt(6.54321)
    this.assertEqual(game.comments, ['[%emt 0:00:06.543]'])
    this.assertEqual(game.emt(), 6.543)

    game.setEmt(-70)
    this.assertEqual(game.comments, ['[%emt 0:00:00]'])
    this.assertEqual(game.emt(), 0)
  }

  testFloatClk(): void {
    const game = new pgn.Game()
    game.comments = ['[%clk 0:00:01.234]']
    this.assertEqual(game.clock(), 1.234)

    game.setClock(6.54321)
    this.assertEqual(game.comments, ['[%clk 0:00:06.543]'])
    this.assertEqual(game.clock(), 6.543)

    game.setClock(-70)
    this.assertEqual(game.comments, ['[%clk 0:00:00]'])
    this.assertEqual(game.clock(), 0)
  }

  testNodeTurn(): void {
    let game = new pgn.Game()
    this.assertEqual(game.turn(), chess.WHITE)
    let node = game.addVariation(chess.Move.fromUci('a2a3'))
    this.assertEqual(node.turn(), chess.BLACK)
    node = node.addVariation(chess.Move.fromUci('a7a6'))
    this.assertEqual(node.turn(), chess.WHITE)

    game = new pgn.Game()
    game.setup('4k3/8/8/8/8/8/8/4K3 b - - 7 6')
    this.assertEqual(game.turn(), chess.BLACK)
    node = game.addVariation(chess.Move.fromUci('e8e7'))
    this.assertEqual(node.turn(), chess.WHITE)
    node = node.addVariation(chess.Move.fromUci('e1e2'))
    this.assertEqual(node.turn(), chess.BLACK)
  }

  testSkipInnerVariation(): void {
    class BlackVariationsOnly extends pgn.GameBuilder {
      skipping = false

      beginVariation(): pgn.SkipType | void {
        this.skipping = this.variationStack.at(-1)!.turn() !== chess.WHITE
        if (this.skipping) {
          return pgn.SKIP
        }
        return super.beginVariation()
      }

      endVariation(): void {
        if (this.skipping) {
          this.skipping = false
        } else {
          super.endVariation()
        }
      }
    }

    const source =
      '1. e4 e5 ( 1... d5 2. exd5 Qxd5 3. Nc3 ( 3. c4 ) 3... Qa5 ) *'
    const expected = '1. e4 e5 ( 1... d5 2. exd5 Qxd5 3. Nc3 Qa5 ) *'

    // Driven by parser.
    let game = pgn.readGame<pgn.Game>(new pgn.StringIO(source), {
      Visitor: BlackVariationsOnly,
    })
    if (game === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    this.assertEqual(
      game.accept(new pgn.StringExporter({ headers: false })),
      expected,
    )

    // Driven by game tree traversal.
    const parsed = pgn.readGame<pgn.Game>(new pgn.StringIO(source), {})
    if (parsed === null) {
      throw new Error('Expected the PGN to contain a game')
    }
    game = parsed.accept(new BlackVariationsOnly())
    this.assertEqual(
      game.accept(new pgn.StringExporter({ headers: false })),
      expected,
    )
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

  testUtf8Bom(): void {
    const source = readFileSync(
      resolve(__dirname, '../../python-chess/data/pgn/utf8-bom.pgn'),
      'utf8',
    )
    const handle = new pgn.StringIO(source)

    let game = pgn.readGame(handle)
    if (game === null) {
      throw new Error('Expected the PGN to contain the first game')
    }
    this.assertEqual(game.headers.get('Event'), 'A')

    game = pgn.readGame(handle)
    if (game === null) {
      throw new Error('Expected the PGN to contain the second game')
    }
    this.assertEqual(game.headers.get('Event'), 'B')

    game = pgn.readGame(handle)
    this.assertEqual(game, null)
  }
}

registerTestCase('PgnTestCase', PgnTestCase, {
  lines: {
    testExporter: 2097,
    testSetup: 2159,
    testPromoteToMain: 2198,
    testReadGame: 2210,
    testReadGameWithLeadingWhitespaceBeforeHeader: 2236,
    testReadGameWithMulticommentMove: 2254,
    testCommentAtEol: 2262,
    testVariationStack: 2341,
    testGameStartingComment: 2361,
    testGameStartingVariation: 2371,
    testAnnotationSymbols: 2389,
    testVisitBoard: 2587,
    testBlackToMove: 2631,
    testErrors: 2709,
    testSemicolonComment: 2797,
    testNoMovetext: 2809,
    testSubgame: 2824,
    testTreeTraversal: 2411,
    testPromoteDemote: 2442,
    testAddLine: 2723,
    testMainline: 2740,
    testAnnotations: 2865,
    testFloatEmt: 2916,
    testFloatClk: 2929,
    testNodeTurn: 2942,
    testSkipInnerVariation: 2958,
    testUtf8Bom: 2984,
  },
})

describe('GameNode parity characterizations not covered upstream', () => {
  test('parent and move identity are getter-only', () => {
    const game = new pgn.Game()
    const move = chess.Move.fromUci('e2e4')
    const child = game.addVariation(move)

    if (false) {
      // @ts-expect-error The root identity is immutable.
      game.parent = child
      // @ts-expect-error Child ancestry is immutable.
      child.parent = game
      // @ts-expect-error The move identifying a child node is immutable.
      child.move = chess.Move.fromUci('d2d4')
    }

    expect(() => {
      ;(child as unknown as { parent: pgn.GameNode | null }).parent = null
    }).toThrow(TypeError)
    expect(() => {
      ;(child as unknown as { move: chess.Move | null }).move = null
    }).toThrow(TypeError)
    expect(child.parent).toBe(game)
    expect(child.move).toBe(move)
  })

  test('builders preserve concrete Game and Headers subclasses', () => {
    class CustomGame extends pgn.Game {
      gameMarker = 'custom game'
    }

    class CustomHeaders extends pgn.Headers {
      headersMarker = 'custom headers'
    }

    if (false) {
      // A specialized builder must be told which concrete class to create.
      // @ts-expect-error CustomGame cannot use the base Game default.
      new pgn.GameBuilder<CustomGame>()
      // @ts-expect-error CustomHeaders cannot use the base Headers default.
      new pgn.HeadersBuilder<CustomHeaders>()
    }

    const gameBuilder = new pgn.GameBuilder({ Game_: CustomGame })
    gameBuilder.beginGame()
    const game = gameBuilder.result()
    expectTypeOf(game).toEqualTypeOf<CustomGame>()
    expect(game).toBeInstanceOf(CustomGame)
    expect(game.gameMarker).toBe('custom game')

    const emptyCustomGame = gameBuilder.Game_.withoutTagRoster()
    expectTypeOf(emptyCustomGame).toEqualTypeOf<CustomGame>()
    expect(emptyCustomGame).toBeInstanceOf(CustomGame)

    const staticGameBuilder = CustomGame.builder()
    expectTypeOf(staticGameBuilder).toEqualTypeOf<
      pgn.GameBuilder<CustomGame>
    >()
    staticGameBuilder.beginGame()
    expect(staticGameBuilder.result()).toBeInstanceOf(CustomGame)

    const headersBuilder = new pgn.HeadersBuilder({
      Headers_: CustomHeaders,
    })
    headersBuilder.beginHeaders()
    const headers = headersBuilder.result()
    expectTypeOf(headers).toEqualTypeOf<CustomHeaders>()
    expect(headers).toBeInstanceOf(CustomHeaders)
    expect(headers.headersMarker).toBe('custom headers')

    const nestedHeadersBuilder = headersBuilder.Headers_.builder()
    expectTypeOf(nestedHeadersBuilder).toEqualTypeOf<
      pgn.HeadersBuilder<CustomHeaders>
    >()

    const staticHeadersBuilder = CustomHeaders.builder()
    expectTypeOf(staticHeadersBuilder).toEqualTypeOf<
      pgn.HeadersBuilder<CustomHeaders>
    >()
    staticHeadersBuilder.beginHeaders()
    expect(staticHeadersBuilder.result()).toBeInstanceOf(CustomHeaders)
  })

  test('next returns null when a node has no mainline child', () => {
    const game = new pgn.Game()
    expect(game.next()).toBeNull()

    const child = game.addVariation(chess.Move.fromUci('e2e4'))
    expect(game.next()).toBe(child)
    expect(child.next()).toBeNull()
  })

  test('comment normalization preserves aliases and visitor boundary shapes', () => {
    class CommentBoundaryVisitor extends pgn.BaseVisitor<
      Array<string | string[]>
    > {
      seen: Array<string | string[]> = []

      visitComment(comment: string | string[]): void {
        this.seen.push(comment)
      }

      result(): Array<string | string[]> {
        return this.seen
      }
    }

    const empty: string[] = []
    expect(pgn._standardizeComments(empty)).toEqual([])
    expect(pgn._standardizeComments(empty)).not.toBe(empty)

    const suppliedComments = ['tree comment']
    expect(pgn._standardizeComments(suppliedComments)).toBe(suppliedComments)

    const parsedComments = pgn.readGame(
      new pgn.StringIO('1. e4 {parser comment}'),
      { Visitor: CommentBoundaryVisitor },
    )
    expect(parsedComments).toEqual(['parser comment'])
    expect(typeof parsedComments?.[0]).toBe('string')

    const game = new pgn.Game()
    game.comments = []
    const suppliedStartingComments = ['starting tree comment']
    const node = game.addVariation(chess.Move.fromUci('e2e4'), {
      comment: suppliedComments,
      startingComment: suppliedStartingComments,
    })
    expect(node.comments).toBe(suppliedComments)
    expect(node.startingComments).toBe(suppliedStartingComments)

    node.startingComments = []

    const traversedComments = game.accept(new CommentBoundaryVisitor())
    expect(traversedComments).toEqual([['tree comment']])
    expect(traversedComments[0]).toBe(node.comments)
  })

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
        node.comments,
      ]),
    ).toEqual([
      ['e7e5', ['open']],
      ['c7c5', ['sicilian']],
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
    expect(game.variations.map(node => node.comments)).toEqual([
      ['first'],
      ['second'],
    ])

    const exported = game.toString()
    const parsed = pgn.readGame(new pgn.StringIO(exported))
    expect(parsed?.errors).toEqual([])
    expect(
      parsed?.variations.map(node => ({
        move: node.move.uci(),
        comments: node.comments,
        child: node.variations[0]?.move.uci(),
        childComments: node.variations[0]?.comments,
      })),
    ).toEqual([
      {
        move: 'e2e4',
        comments: ['first'],
        child: 'e7e5',
        childComments: ['first child'],
      },
      {
        move: 'e2e4',
        comments: ['second'],
        child: 'c7c5',
        childComments: ['second child'],
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
      game.comments = []
      game.setClock(seconds)
      expect(game.comments).toEqual([`[%clk 0:00:${formatted}]`])

      game.comments = []
      game.setEmt(seconds)
      expect(game.comments).toEqual([`[%emt 0:00:${formatted}]`])
    }
  })

  test('export wrapping counts Unicode code points', () => {
    const game = new pgn.Game()
    const comment = `${'x'.repeat(72)}😀`
    game.comments = [comment]

    expect(
      game.accept(new pgn.StringExporter({ headers: false, columns: 80 })),
    ).toBe(`{ ${comment} } *`)
  })

  test('export removes every brace from comments', () => {
    const game = new pgn.Game()
    game.comments = ['{a}b{c}']

    expect(
      game.accept(new pgn.StringExporter({ headers: false, columns: null })),
    ).toBe('{ abc } *')
  })

  test('repeated initial BOM markers are removed before headers', () => {
    const game = pgn.readGame(
      new pgn.StringIO('\ufeff\ufeff[Event "BOM"]\n\n1. e4 *'),
    )

    expect(game?.headers.get('Event')).toBe('BOM')
    expect(game?.next()?.move).toEqual(chess.Move.fromUci('e2e4'))
  })

  test('header probing does not strip the raw movetext line', () => {
    const game = pgn.readGame(
      new pgn.StringIO('  % remains movetext 1. e4 *'),
    )

    expect(game?.next()?.move).toEqual(chess.Move.fromUci('e2e4'))
  })
})
