import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { StringIO } from '../pgn'
import { PYTHON_ASSERTION_ORACLE } from './python-assertion-oracle.generated'
import {
  AssertionOracleCatalog,
  AssertionOracleCursor,
} from './python-assertion-oracle'

type Constructor<T> = new () => T
type Equality<Actual, Expected> = (
  actual: Actual,
  expected: Expected,
) => boolean
type Containment<Member, Container> = (
  container: Container,
  member: Member,
) => boolean
const ASSERTION_ORACLES = new AssertionOracleCatalog(PYTHON_ASSERTION_ORACLE)

/** Opens a pinned UTF-8 Python test fixture as the target in-memory stream. */
export const openTextFixture = (relativePath: string): StringIO => {
  return new StringIO(
    readFileSync(resolve(__dirname, '../../python-chess', relativePath), 'utf8'),
  )
}

interface InvocationResult {
  readonly didThrow: boolean
  readonly thrown: unknown
}

const invokeOnce = (callback: () => unknown): InvocationResult => {
  try {
    callback()
    return { didThrow: false, thrown: undefined }
  } catch (thrown) {
    return { didThrow: true, thrown }
  }
}

/**
 * Small compatibility layer for mechanically translated `unittest.TestCase`
 * classes. Keeping the upstream class/method shape makes source comparison and
 * one-commit-at-a-time synchronization substantially easier than rewriting the
 * suite into an unrelated test style.
 */
export abstract class TestCase {
  #assertionOracle: AssertionOracleCursor | null | undefined

  setUp(): void | Promise<void> {}

  tearDown(): void | Promise<void> {}

  beginAssertionOracle(method: string): void {
    if (this.#assertionOracle !== undefined) {
      throw new Error('assertion oracle was initialized more than once')
    }
    this.#assertionOracle = ASSERTION_ORACLES.cursor(method)
  }

  finishAssertionOracle(): void {
    this.#assertionOracle?.finish()
    this.#assertionOracle = undefined
  }

  #unsupportedOracleAssertion(assertion: string): void {
    this.#assertionOracle?.unsupported(assertion)
  }

  /**
   * Retains Python's missing-argument failure for the upstream regression that
   * deliberately places a malformed assertion after an expected exception.
   * Complete assertions are compiled to the explicit `*Using` methods below.
   */
  assertEqual(_actual: unknown): never {
    throw new TypeError('assertEqual() missing required expected argument')
  }

  assertEqualUsing<Actual, Expected>(
    actual: Actual,
    expected: Expected,
    equals: Equality<Actual, Expected>,
    message?: string,
  ): void {
    const equal = equals(actual, expected)
    expect(equal, message).toBe(true)
    this.#assertionOracle?.equal(actual, expected)
  }

  assertNotEqualUsing<Actual, Expected>(
    actual: Actual,
    expected: Expected,
    equals: Equality<Actual, Expected>,
    message?: string,
  ): void {
    const equal = equals(actual, expected)
    expect(equal, message).toBe(false)
    this.#assertionOracle?.notEqual(actual, expected)
  }

  assertEqualRepresentationsUsing<
    ActualRepresentation,
    ExpectedRepresentation,
  >(
    actualRepresentation: ActualRepresentation,
    expectedRepresentation: ExpectedRepresentation,
    equals: Equality<ActualRepresentation, ExpectedRepresentation>,
    actual: unknown,
    expected: unknown,
    message?: string,
  ): void {
    const equal = equals(actualRepresentation, expectedRepresentation)
    expect(equal, message).toBe(true)
    this.#assertionOracle?.equal(actual, expected)
  }

  assertNotEqualRepresentationsUsing<
    ActualRepresentation,
    ExpectedRepresentation,
  >(
    actualRepresentation: ActualRepresentation,
    expectedRepresentation: ExpectedRepresentation,
    equals: Equality<ActualRepresentation, ExpectedRepresentation>,
    actual: unknown,
    expected: unknown,
    message?: string,
  ): void {
    const equal = equals(actualRepresentation, expectedRepresentation)
    expect(equal, message).toBe(false)
    this.#assertionOracle?.notEqual(actual, expected)
  }

  assertTrue(value: boolean, message?: string): void {
    expect(value, message).toBe(true)
    this.#assertionOracle?.truth(value)
  }

  assertFalse(value: boolean, message?: string): void {
    expect(value, message).toBe(false)
    this.#assertionOracle?.truth(value)
  }

  assertIs(actual: unknown, expected: unknown, message?: string): void {
    this.#unsupportedOracleAssertion('assertIs')
    expect(actual, message).toBe(expected)
  }

  assertIsNot(actual: unknown, expected: unknown, message?: string): void {
    this.#unsupportedOracleAssertion('assertIsNot')
    expect(actual, message).not.toBe(expected)
  }

  assertIsNone(actual: unknown, message?: string): void {
    this.#unsupportedOracleAssertion('assertIsNone')
    expect(actual, message).toBeNull()
  }

  assertIsNotNone(actual: unknown, message?: string): void {
    this.#unsupportedOracleAssertion('assertIsNotNone')
    expect(actual, message).not.toBeNull()
  }

  assertContainsUsing<Member, Container>(
    member: Member,
    container: Container,
    contains: Containment<Member, Container>,
    message?: string,
  ): void {
    const result = contains(container, member)
    expect(result, message).toBe(true)
    this.#assertionOracle?.contains(member, container, result)
  }

  assertNotContainsUsing<Member, Container>(
    member: Member,
    container: Container,
    contains: Containment<Member, Container>,
    message?: string,
  ): void {
    const result = contains(container, member)
    expect(result, message).toBe(false)
    this.#assertionOracle?.contains(member, container, result)
  }

  assertLess(
    actual: number | bigint,
    expected: number | bigint,
    message?: string,
  ): void {
    this.#unsupportedOracleAssertion('assertLess')
    expect(actual, message).toBeLessThan(expected)
  }

  assertLessEqual(
    actual: number | bigint,
    expected: number | bigint,
    message?: string,
  ): void {
    expect(actual, message).toBeLessThanOrEqual(expected)
    this.#assertionOracle?.lessEqual(actual, expected)
  }

  assertGreater(
    actual: number | bigint,
    expected: number | bigint,
    message?: string,
  ): void {
    this.#unsupportedOracleAssertion('assertGreater')
    expect(actual, message).toBeGreaterThan(expected)
  }

  assertGreaterEqual(
    actual: number | bigint,
    expected: number | bigint,
    message?: string,
  ): void {
    this.#unsupportedOracleAssertion('assertGreaterEqual')
    expect(actual, message).toBeGreaterThanOrEqual(expected)
  }

  assertAlmostEqual(actual: number, expected: number, digits = 7): void {
    this.#unsupportedOracleAssertion('assertAlmostEqual')
    expect(actual).toBeCloseTo(expected, digits)
  }

  assertRaises(error: Constructor<Error>, callback: () => unknown): void {
    const result = invokeOnce(callback)
    expect(result.didThrow).toBe(true)
    expect(result.thrown).toBeInstanceOf(error)
    this.#assertionOracle?.raises(error, result.thrown)
  }

  captureRaises(error: Constructor<Error>, callback: () => unknown): Error {
    const result = invokeOnce(callback)
    expect(result.didThrow).toBe(true)
    expect(result.thrown).toBeInstanceOf(error)
    this.#assertionOracle?.raises(error, result.thrown)
    return result.thrown as Error
  }

  assertRaisesRegex(
    error: Constructor<Error>,
    pattern: RegExp,
    callback: () => unknown,
  ): void {
    this.#unsupportedOracleAssertion('assertRaisesRegex')
    let thrown: unknown
    try {
      callback()
    } catch (caught) {
      thrown = caught
    }

    expect(thrown).toBeInstanceOf(error)
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toMatch(pattern)
  }

  /**
   * Requires the exact upstream assertion to remain a mismatch. An exception
   * raised while evaluating its operands is not accepted as an assertion gap.
   */
  assertKnownAssertionFailure(gapId: string, callback: () => unknown): void {
    this.#unsupportedOracleAssertion('assertKnownAssertionFailure')
    let thrown: unknown
    try {
      callback()
    } catch (caught) {
      thrown = caught
    }
    expect(
      thrown,
      `${gapId}: upstream assertion must currently fail`,
    ).toBeInstanceOf(Error)
    expect(
      (thrown as Error).name,
      `${gapId}: operation threw before assertion`,
    ).toBe('AssertionError')
  }

  assertKnownError(
    gapId: string,
    callback: () => unknown,
    error: Constructor<Error>,
    pattern: RegExp,
  ): void {
    this.#unsupportedOracleAssertion('assertKnownError')
    let thrown: unknown
    let didThrow = false
    try {
      callback()
    } catch (caught) {
      didThrow = true
      thrown = caught
    }

    if (!didThrow) {
      throw new Error(
        `${gapId}: parity gap no longer throws; restore upstream behavior`,
      )
    }
    expect(thrown).toBeInstanceOf(error)
    expect((thrown as Error).message).toMatch(pattern)
  }
}

interface TestCaseMetadata {
  /** Upstream one-based source line for each camel-cased test method. */
  lines: Readonly<Record<string, number>>
}

export const registerTestCase = <T extends TestCase>(
  name: string,
  TestCaseClass: Constructor<T>,
  metadata: TestCaseMetadata,
): void => {
  const methods = Object.getOwnPropertyNames(TestCaseClass.prototype).filter(
    method => method.startsWith('test') && method !== 'constructor',
  )
  const methodSet = new Set(methods)
  const missingLines = methods.filter(
    method => metadata.lines[method] === undefined,
  )
  const staleLines = Object.keys(metadata.lines).filter(
    method => !methodSet.has(method),
  )

  if (missingLines.length > 0 || staleLines.length > 0) {
    throw new Error(
      `${name} has inconsistent upstream metadata: ` +
        JSON.stringify({ missingLines, staleLines }),
    )
  }

  describe(name, () => {
    for (const method of methods) {
      const sourceLine = metadata.lines[method]
      test(`${method} (python-chess test.py:${sourceLine})`, async () => {
        const instance = new TestCaseClass()
        const testMethod = instance[method as keyof T]
        if (typeof testMethod !== 'function') {
          throw new TypeError(`${name}.${method} is not callable`)
        }
        instance.beginAssertionOracle(`${name}.${method}`)
        await instance.setUp()
        try {
          await testMethod.call(instance)
        } finally {
          await instance.tearDown()
        }
        instance.finishAssertionOracle()
      })
    }
  })
}
