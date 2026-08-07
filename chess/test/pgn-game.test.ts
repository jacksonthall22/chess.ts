import { describe, expect, test } from 'vitest'

import * as chess from '../index'
import * as pgn from '../pgn'

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
