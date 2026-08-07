import { describe, expect, test } from 'vitest'

import chessDefault, * as chess from '../index'
import * as pgn from '../pgn'
import { findVariant } from '../variant'

describe('Python-compatible error families', () => {
  test('exports concrete classes with native inheritance', () => {
    const valueError = new chess.ValueError('invalid value')
    expect(chessDefault.ValueError).toBe(chess.ValueError)
    expect(valueError).toBeInstanceOf(Error)
    expect(valueError).not.toBeInstanceOf(RangeError)
    expect(valueError.name).toBe('ValueError')
    expect(valueError.message).toBe('invalid value')

    const keyError = new chess.KeyError('missing key')
    expect(chessDefault.KeyError).toBe(chess.KeyError)
    expect(keyError).toBeInstanceOf(Error)
    expect(keyError).not.toBeInstanceOf(RangeError)
    expect(keyError.name).toBe('KeyError')
    expect(keyError.message).toBe('missing key')
  })

  test('move errors retain their precise names under ValueError', () => {
    const errors = [
      new chess.InvalidMoveError('invalid move'),
      new chess.IllegalMoveError('illegal move'),
      new chess.AmbiguousMoveError('ambiguous move'),
    ]

    for (const error of errors) {
      expect(error).toBeInstanceOf(chess.ValueError)
      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBeInstanceOf(RangeError)
      expect(error.name).toBe(error.constructor.name)
    }
  })

  const valueErrorCases: ReadonlyArray<readonly [string, () => unknown]> = [
    [
      'invalid board FEN',
      () => chess.BaseBoard.empty().setBoardFen('8/8'),
    ],
    ['invalid Chess960 index', () => chess.BaseBoard.fromChess960Pos(-1)],
    [
      'invalid PGN header name',
      () => new pgn.Headers().set('not a tag', 'value'),
    ],
    [
      'multiline PGN header value',
      () => new pgn.Headers().set('CustomTag', 'first\nsecond'),
    ],
    ['unsupported variant', () => findVariant('not-a-variant')],
  ]

  for (const [name, callback] of valueErrorCases) {
    test(name, () => {
      expect(callback).toThrow(chess.ValueError)
    })
  }

  test('missing PGN variation', () => {
    expect(() => new pgn.Game().getitem(chess.Move.null())).toThrow(
      chess.KeyError,
    )
  })
})
