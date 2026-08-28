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

  test('readGame accepts explicit visitor factories', () => {
    class CustomGame extends pgn.Game {
      marker = 'custom'
    }

    const game = pgn.readGame(new pgn.StringIO('*'), {
      Visitor: () => CustomGame.builder(),
    })
    expect(game).toBeInstanceOf(CustomGame)
    expect(game?.marker).toBe('custom')

    const headers = pgn.readGame(
      new pgn.StringIO('[Event "Factories"]\n\n*'),
      { Visitor: () => new pgn.HeadersBuilder() },
    )
    expect(headers?.get('Event')).toBe('Factories')

    if (false) {
      // @ts-expect-error Visitor must be an explicit factory.
      pgn.readGame(new pgn.StringIO('*'), {})
    }
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
