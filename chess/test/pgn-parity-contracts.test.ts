import { describe, expect, test } from 'vitest'

import * as chess from '../index'
import * as pgn from '../pgn'

describe('TypeScript-native PGN parity contracts', () => {
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
