import { expect, test } from 'vitest'

import { Cp, Mate, MateGiven, PovWdl, Score, Wdl, WdlModel } from '../engine'
import { registerTestCase, TestCase } from './unittest'

/** Mechanical translation of python-chess `EngineTestCase` at 8e91525e. */
class EngineTestCase extends TestCase {
  testScoreOrdering(): void {
    const order: Score[] = [
      new Mate(-0),
      new Mate(-1),
      new Mate(-99),
      new Cp(-123),
      new Cp(-50),
      new Cp(0),
      new Cp(+30),
      new Cp(+800),
      new Mate(+77),
      new Mate(+1),
      MateGiven,
    ]

    for (const [i, a] of order.entries()) {
      for (const [j, b] of order.entries()) {
        this.assertEqual(i < j, a.lt(b), `${String(a)} < ${String(b)}`)
        this.assertEqual(i === j, a.equals(b), `${String(a)} == ${String(b)}`)
        this.assertEqual(i <= j, a.le(b))
        this.assertEqual(i !== j, !a.equals(b))
        this.assertEqual(i > j, a.gt(b))
        this.assertEqual(i >= j, a.ge(b))
        this.assertEqual(
          i < j,
          (a.score({ mateScore: 100000 }) as number) <
            (b.score({ mateScore: 100000 }) as number),
        )

        const models: WdlModel[] = [
          'sf12',
          'sf14',
          'sf15',
          'sf15.1',
          'sf16',
          'sf16.1',
        ]
        for (const model of models) {
          this.assertTrue(
            !(i < j) ||
              a.wdl({ model }).expectation() <= b.wdl({ model }).expectation(),
          )
          this.assertTrue(
            !(i < j) ||
              a.wdl({ model }).winningChance() <=
                b.wdl({ model }).winningChance(),
          )
          this.assertTrue(
            !(i < j) ||
              a.wdl({ model }).losingChance() >=
                b.wdl({ model }).losingChance(),
          )
        }
      }
    }
  }

  testWdlModel(): void {
    this.assertEqual(
      new Cp(131).wdl({ model: 'sf12', ply: 25 }),
      new Wdl(524, 467, 9),
    )
    this.assertEqual(
      new Cp(146).wdl({ model: 'sf14', ply: 25 }),
      new Wdl(601, 398, 1),
    )
    this.assertEqual(
      new Cp(40).wdl({ model: 'sf15', ply: 25 }),
      new Wdl(58, 937, 5),
    )
    this.assertEqual(
      new Cp(100).wdl({ model: 'sf15.1', ply: 64 }),
      new Wdl(497, 503, 0),
    )
    this.assertEqual(
      new Cp(-52).wdl({ model: 'sf16', ply: 63 }),
      new Wdl(0, 932, 68),
    )
    this.assertEqual(
      new Cp(51).wdl({ model: 'sf16.1', ply: 158 }),
      new Wdl(36, 964, 0),
    )
  }
}

registerTestCase('EngineTestCase', EngineTestCase, {
  lines: {
    testScoreOrdering: 3029,
    testWdlModel: 3088,
  },
})

test('Wdl values use dataclass equality without deprecated tuple behavior', () => {
  class DerivedWdl extends Wdl {}
  class DerivedPovWdl extends PovWdl {}

  const value = new Wdl(249, 747, 4)
  expect(value.equals(new Wdl(249, 747, 4))).toBe(true)
  expect(value.equals(new Wdl(249, 746, 5))).toBe(false)
  expect(value.equals(new DerivedWdl(249, 747, 4))).toBe(false)
  expect(
    new DerivedWdl(249, 747, 4).equals(new DerivedWdl(249, 747, 4)),
  ).toBe(true)

  const pov = new PovWdl(value, true)
  expect(pov.equals(new PovWdl(new Wdl(249, 747, 4), true))).toBe(true)
  expect(pov.equals(new PovWdl(new Wdl(4, 747, 249), false))).toBe(false)
  expect(
    pov.equals(new DerivedPovWdl(new Wdl(249, 747, 4), true)),
  ).toBe(false)
  expect(
    new DerivedPovWdl(new Wdl(249, 747, 4), true).equals(
      new DerivedPovWdl(new Wdl(249, 747, 4), true),
    ),
  ).toBe(true)

  expect('iter' in value).toBe(false)
  expect('reversed' in value).toBe(false)
  expect('iter' in pov).toBe(false)
  expect('len' in pov).toBe(false)
  expect('getitem' in pov).toBe(false)
  expect(pov.equals([249, 747, 4])).toBe(false)
})
