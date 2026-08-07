import { describe, expect, test } from 'vitest'

import * as chess from '../index'

describe('SquareSet bigint operand characterization', () => {
  test('keeps every immutable set operation correct for the supported mask path', () => {
    const examples = [
      chess.BB_EMPTY,
      chess.BB_A1,
      chess.BB_A2,
      chess.BB_RANK_1,
      chess.BB_RANK_2,
      chess.BB_FILE_A,
      chess.BB_FILE_E,
    ]

    for (const leftMask of examples) {
      const left = new chess.SquareSet(leftMask)
      for (const rightMask of examples) {
        expect(left.isdisjoint(rightMask)).toBe(
          (leftMask & rightMask) === chess.BB_EMPTY,
        )
        expect(left.issubset(rightMask)).toBe(
          (leftMask & ~rightMask) === chess.BB_EMPTY,
        )
        expect(left.issuperset(rightMask)).toBe(
          (~leftMask & rightMask) === chess.BB_EMPTY,
        )
        expect(left.union(rightMask).int()).toBe(leftMask | rightMask)
        expect(left.intersection(rightMask).int()).toBe(leftMask & rightMask)
        expect(left.difference(rightMask).int()).toBe(leftMask & ~rightMask)
        expect(left.symmetricDifference(rightMask)).toBe(leftMask ^ rightMask)
      }
    }
  })
})
