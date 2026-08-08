import { describe, expect, test } from 'vitest'

import * as chess from '../index'
import * as pgn from '../pgn'

import {
  AssertionOracleCatalog,
  AssertionOracleCursor,
  AssertionValueCanonicalizer,
  PythonAssertionOracleArtifact,
} from './python-assertion-oracle'
import { TestCase } from './unittest'

describe('Python assertion oracle', () => {
  test('canonicalizes only the explicit cross-runtime value vocabulary', () => {
    const values = new AssertionValueCanonicalizer()
    const move = chess.Move.fromUci('e2e4')

    expect(values.value(null)).toEqual(['none'])
    expect(values.value(true)).toEqual(['bool', true])
    expect(values.value(42)).toEqual(['int', '42'])
    expect(values.value(42n)).toEqual(['int', '42'])
    expect(values.value('x')).toEqual(['str', 'x'])
    expect(values.value(move)).toEqual(['move', 'e2e4'])
    expect(values.value(chess.Piece.fromSymbol('N'))).toEqual(['piece', 'N'])
    expect(values.value(new chess.SquareSet(chess.BB_E4))).toEqual([
      'int',
      chess.BB_E4.toString(),
    ])
    expect(values.value([move, 3])).toEqual([
      'sequence',
      [
        ['move', 'e2e4'],
        ['int', '3'],
      ],
    ])
    expect(values.value(new Set([3, 1]))).toEqual([
      'set',
      [
        ['int', '1'],
        ['int', '3'],
      ],
    ])
    expect(() => values.value({ value: 1 })).toThrow(
      'unsupported TypeScript assertion value Object',
    )
    expect(() => values.value(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      'requires a safe integer',
    )
    expect(values.value(Number.NaN)).toEqual([
      'number',
      '7ff8000000000000',
    ])
    expect(values.value(Number.POSITIVE_INFINITY)).toEqual([
      'number',
      '7ff0000000000000',
    ])
    expect(values.value(Number.NEGATIVE_INFINITY)).toEqual([
      'number',
      'fff0000000000000',
    ])
  })

  test('assigns deterministic per-test identities to PGN nodes', () => {
    const values = new AssertionValueCanonicalizer()
    const game = new pgn.Game()
    const child = game.addVariation(chess.Move.fromUci('e2e4'))

    expect(values.value(game)).toEqual(['pgn-node', 1])
    expect(values.value(child)).toEqual(['pgn-node', 2])
    expect(values.value(game)).toEqual(['pgn-node', 1])
  })

  test('requires exact event order and complete consumption', () => {
    const cursor = new AssertionOracleCursor('Example.testMethod', [
      ['equal', ['int', '1'], ['int', '1']],
      ['truth', true],
    ])
    cursor.equal(1, 1n)
    cursor.truth(true)
    expect(() => cursor.finish()).not.toThrow()

    const incomplete = new AssertionOracleCursor('Example.incomplete', [
      ['truth', true],
    ])
    expect(() => incomplete.finish()).toThrow('consumed 0 of 1 events')

    const different = new AssertionOracleCursor('Example.different', [
      ['truth', true],
    ])
    expect(() => different.truth(false)).toThrow('event 1 differs')
  })

  test('validates and classifies the complete method partition', () => {
    const artifact: PythonAssertionOracleArtifact = {
      schemaVersion: 1,
      translatedMethodCount: 2,
      tracedMethodCount: 1,
      eventCount: 1,
      excludedMethods: ['Example.testGap'],
      methods: {
        'Example.testTraced': [['truth', true]],
      },
    }
    const catalog = new AssertionOracleCatalog(artifact)
    expect(catalog.cursor('Example.testTraced')).toBeInstanceOf(
      AssertionOracleCursor,
    )
    expect(catalog.cursor('Example.testGap')).toBeNull()
    expect(() => catalog.cursor('Example.testMissing')).toThrow(
      'does not classify',
    )
  })

  test('runs raises callbacks once and classifies concrete error families', () => {
    class Harness extends TestCase {}
    const harness = new Harness()
    const values = new AssertionValueCanonicalizer()

    expect(values.expectedErrorFamily(chess.ValueError)).toBe('ValueError')
    expect(values.expectedErrorFamily(chess.KeyError)).toBe('KeyError')
    expect(values.actualErrorFamily(new chess.ValueError())).toBe('ValueError')
    expect(values.actualErrorFamily(new chess.KeyError())).toBe('KeyError')
    expect(values.actualErrorFamily(new chess.InvalidMoveError())).toBe(
      'InvalidMoveError',
    )

    let equalityCalls = 0
    harness.assertEqualUsing(3, 3n, (actual, expected) => {
      equalityCalls += 1
      return BigInt(actual) === expected
    })
    expect(equalityCalls).toBe(1)

    let containmentCalls = 0
    harness.assertContainsUsing(2, new Set([1, 2]), (container, member) => {
      containmentCalls += 1
      return container.has(member)
    })
    expect(containmentCalls).toBe(1)

    let ordinaryCalls = 0
    harness.assertRaises(chess.InvalidMoveError, () => {
      ordinaryCalls += 1
      throw new chess.InvalidMoveError('invalid')
    })
    expect(ordinaryCalls).toBe(1)

    let capturedCalls = 0
    const captured = harness.captureRaises(chess.IllegalMoveError, () => {
      capturedCalls += 1
      throw new chess.IllegalMoveError('illegal')
    })
    expect(capturedCalls).toBe(1)
    expect(captured).toBeInstanceOf(chess.IllegalMoveError)

    let valueErrorCalls = 0
    harness.assertRaises(chess.ValueError, () => {
      valueErrorCalls += 1
      throw new chess.ValueError('invalid square name: z9')
    })
    expect(valueErrorCalls).toBe(1)

    let keyErrorCalls = 0
    harness.assertRaises(chess.KeyError, () => {
      keyErrorCalls += 1
      throw new chess.KeyError('missing square')
    })
    expect(keyErrorCalls).toBe(1)

    let typeErrorCalls = 0
    expect(() =>
      harness.assertRaises(chess.ValueError, () => {
        typeErrorCalls += 1
        harness.assertEqual(1)
      }),
    ).toThrow()
    expect(typeErrorCalls).toBe(1)
  })
})
