import { describe, expect, expectTypeOf, test } from 'vitest'

import * as chess from '../index'
import * as pgn from '../pgn'
import * as utils from '../utils'

describe('TypeScript-native PGN parity contracts', () => {
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

    class OptionalGame extends pgn.Game {
      constructor(readonly theme = 'standard') {
        super()
      }
    }

    class CustomHeaders extends pgn.Headers {
      headersMarker = 'custom headers'
    }

    class RequiredHeaders extends pgn.Headers {
      constructor(data: Map<string, string>) {
        super(data)
      }
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

    const optionalGameBuilder = new pgn.GameBuilder({ Game_: OptionalGame })
    optionalGameBuilder.beginGame()
    expect(optionalGameBuilder.result()).toBeInstanceOf(OptionalGame)
    expect(optionalGameBuilder.result().theme).toBe('standard')

    const staticOptionalGameBuilder = OptionalGame.builder()
    staticOptionalGameBuilder.beginGame()
    expect(staticOptionalGameBuilder.result()).toBeInstanceOf(OptionalGame)

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

    const requiredHeadersBuilder = new pgn.HeadersBuilder({
      Headers_: RequiredHeaders,
    })
    requiredHeadersBuilder.beginHeaders()
    expect(requiredHeadersBuilder.result()).toBeInstanceOf(RequiredHeaders)

    const staticRequiredHeadersBuilder = RequiredHeaders.builder()
    staticRequiredHeadersBuilder.beginHeaders()
    expect(staticRequiredHeadersBuilder.result()).toBeInstanceOf(
      RequiredHeaders,
    )
  })

  test('builders default their classes when options omit them', () => {
    for (const options of [{}, { Game_: undefined }]) {
      const builder = new pgn.GameBuilder(options)
      builder.beginGame()
      expect(builder.result()).toBeInstanceOf(pgn.Game)
    }

    for (const options of [{}, { Headers_: undefined }]) {
      const builder = new pgn.HeadersBuilder(options)
      builder.beginHeaders()
      expect(builder.result()).toBeInstanceOf(pgn.Headers)
    }
  })

  test('next returns null when a node has no mainline child', () => {
    const game = new pgn.Game()
    expect(game.next()).toBeNull()

    const child = game.addVariation(chess.Move.fromUci('e2e4'))
    expect(game.next()).toBe(child)
    expect(child.next()).toBeNull()
  })

  test('array truthiness follows Python in PGN paths', () => {
    const game = new pgn.Game()
    const child = game.addVariation(chess.Move.fromUci('e2e4'))
    game.variations = []
    expect(child.isMainline()).toBe(false)

    const parsed = pgn.readGame(new pgn.StringIO('( 1. e4 ) *'))
    expect(Array.from(parsed!.mainlineMoves(), move => move.uci())).toEqual([
      'e2e4',
    ])

    expect(pgn.parseTimeControl('60').parts[0]).toMatchObject({
      moves: 0,
      time: 60,
    })
    expect(pgn.parseTimeControl('40/300').parts[0]).toMatchObject({
      moves: 40,
      time: 300,
    })
  })

  test('visitors observe the board and move trace through parsing and traversal', () => {
    class TraceVisitor extends pgn.BaseVisitor<string[]> {
      trace: string[]

      constructor() {
        super()
        this.trace = []
      }

      override visitBoard(board: chess.Board): void {
        this.trace.push(board.fen())
      }

      override visitMove(board: chess.Board, move: chess.Move): void {
        this.trace.push(board.san(move))
      }

      override result(): string[] {
        return this.trace
      }
    }

    const handle = new pgn.StringIO(`[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]

1... e5 (1... d5 2. exd5) (1... c5) 2. Nf3 Nc6
`)
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

    expect(trace).toEqual(
      pgn.readGame<string[]>(handle, {
        Visitor: TraceVisitor,
      }),
    )

    handle.seek(0)
    expect(trace).toEqual(
      pgn.readGame(handle)!.accept(new TraceVisitor()),
    )

    handle.seek(0)
    const board = pgn.readGame<chess.Board>(handle, {
      Visitor: pgn.BoardBuilder,
    })
    expect(new chess.Board(trace.at(-1)!).equals(board!)).toBe(true)
  })

  test('visitors can skip nested variations through parsing and traversal', () => {
    class BlackVariationsOnly extends pgn.GameBuilder {
      skipping!: boolean

      override beginVariation(): pgn.SkipType | void {
        this.skipping = this.variationStack.at(-1)!.turn() !== chess.WHITE
        if (this.skipping) {
          return pgn.SKIP
        } else {
          return super.beginVariation()
        }
      }

      override endVariation(): void {
        if (this.skipping) {
          this.skipping = false
        } else {
          return super.endVariation()
        }
      }
    }

    const source =
      '1. e4 e5 ( 1... d5 2. exd5 Qxd5 3. Nc3 ( 3. c4 ) 3... Qa5 ) *'
    const expectedPgn = '1. e4 e5 ( 1... d5 2. exd5 Qxd5 3. Nc3 Qa5 ) *'

    // Driven by parser.
    let game = pgn.readGame<pgn.Game>(new pgn.StringIO(source), {
      Visitor: BlackVariationsOnly,
    })!
    expect(
      game.accept(new pgn.StringExporter({ headers: false })),
    ).toBe(expectedPgn)

    // Driven by game tree traversal.
    game = pgn
      .readGame(new pgn.StringIO(source))!
      .accept(new BlackVariationsOnly())
    expect(
      game.accept(new pgn.StringExporter({ headers: false })),
    ).toBe(expectedPgn)
  })

  test('StringIO seek preserves Python writes and errors', () => {
    const stream = new pgn.StringIO('abc')
    stream.seek(5)
    expect(stream.write('x')).toBe(1)
    expect(stream.getValue()).toBe('abc\0\0x')
    expect(() => stream.seek(-1)).toThrow(chess.ValueError)
    expect(() => stream.seek(1, 1)).toThrow(chess.OSError)

    const largeGap = new pgn.StringIO()
    largeGap.seek(125_000)
    expect(largeGap.write('x')).toBe(1)
    expect(largeGap.getValue()).toHaveLength(125_001)
    expect(largeGap.getValue().at(-1)).toBe('x')

    const emptyWrite = new pgn.StringIO('abc')
    emptyWrite.seek(5)
    expect(emptyWrite.write('')).toBe(0)
    expect(emptyWrite.getValue()).toBe('abc')
    expect(emptyWrite.read()).toBe('')
    expect(emptyWrite.write('x')).toBe(1)
    expect(emptyWrite.getValue()).toBe('abc\0\0x')
  })

  test('readGame strips every leading BOM like Python lstrip', () => {
    const game = pgn.readGame(
      new pgn.StringIO('\ufeff\ufeff[Event "BOM"]\n\n*'),
    )

    expect(game?.headers.get('Event')).toBe('BOM')
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
    first.addVariation(chess.Move.fromUci('e7e5'), {
      comment: 'first child',
    })
    second.addVariation(chess.Move.fromUci('c7c5'), {
      comment: 'second child',
    })

    expect(game.variations).toHaveLength(2)
    expect(first).not.toBe(second)
    expect(game.variation(move)).toBe(first)
    expect(game.variation(first)).toBe(first)
    expect(game.variation(second)).toBe(second)

    const parsed = pgn.readGame(new pgn.StringIO(game.toString()))
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
  })

  test('duplicate variations can be removed independently by node and move', () => {
    const game = new pgn.Game()
    const move = chess.Move.fromUci('e2e4')

    const first = game.addVariation(move, { comment: 'first' })
    const second = game.addVariation(move.copy(), { comment: 'second' })

    game.removeVariation(second)
    expect(game.variations).toEqual([first])
    expect(game.variation(move)).toBe(first)

    game.removeVariation(move)
    expect(game.variations).toEqual([])
  })

  test('clock annotations use Python binary-float formatting', () => {
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

    expect(() => game.setClock(Number.POSITIVE_INFINITY)).toThrow(
      chess.ValueError,
    )
    expect(() => game.setEmt(Number.POSITIVE_INFINITY)).toThrow(
      chess.ValueError,
    )
  })

  test('clock annotations reject integers too large for a Python float', () => {
    const game = new pgn.Game()
    const hours = '9'.repeat(310)

    game.comments = [`[%clk ${hours}:00:00]`]
    expect(() => game.clock()).toThrow(chess.OverflowError)

    game.comments = [`[%emt ${hours}:00:00]`]
    expect(() => game.emt()).toThrow(chess.OverflowError)
  })

  test('export wrapping counts Unicode code points', () => {
    const game = new pgn.Game()
    const comment = `${'x'.repeat(72)}😀`
    game.comments = [comment]

    expect(
      game.accept(new pgn.StringExporter({ headers: false, columns: 80 })),
    ).toBe(`{ ${comment} } *`)
  })

  test('export removes every closing brace from comments', () => {
    const game = new pgn.Game()
    game.comments = ['a}b}c']

    expect(
      game.accept(new pgn.StringExporter({ headers: false, columns: null })),
    ).toBe('{ abc } *')
  })

  test('annotation affixes use Python exact Unicode whitespace', () => {
    const game = new pgn.Game()
    const cases: [string, (node: pgn.Game) => void][] = [
      ['[%cal Ra1a2]', node => node.setArrows([])],
      ['[%eval 0.00]', node => node.setEval(null)],
      ['[%clk 0:00:01]', node => node.setClock(null)],
      ['[%emt 0:00:01]', node => node.setEmt(null)],
    ]

    for (const [annotation, remove] of cases) {
      game.comments = [`\ufeff${annotation}\ufefffoo`]
      remove(game)
      expect(game.comments).toEqual(['\ufeff\ufefffoo'])
    }

    expect(pgn.TAG_REGEX.test('[Event "x"]\ufeff')).toBe(false)
    expect(pgn.TAG_REGEX.test('[Event "x"]\u001c')).toBe(true)
    expect(utils.isspace('\ufeff')).toBe(false)
    expect(utils.isspace('\u001c')).toBe(true)
  })
})
