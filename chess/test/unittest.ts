import { describe, expect, test } from 'vitest'

type Constructor<T> = new () => T
type Comparable = { equals(other: unknown): boolean }
type IterableValue = { [Symbol.iterator](): Iterator<unknown> }

const isComparable = (value: unknown): value is Comparable =>
  typeof value === 'object' &&
  value !== null &&
  'equals' in value &&
  typeof value.equals === 'function'

const isIterable = (value: unknown): value is IterableValue =>
  typeof value === 'object' &&
  value !== null &&
  Symbol.iterator in value &&
  typeof value[Symbol.iterator] === 'function'

const equalByValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true
  }

  if (isComparable(left)) {
    return left.equals(right)
  }

  if (isComparable(right)) {
    return right.equals(left)
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => equalByValue(value, right[index]))
    )
  }

  return false
}

const containsByValue = (container: unknown, member: unknown): boolean => {
  if (typeof container === 'string') {
    return container.includes(String(member))
  }

  if (Array.isArray(container)) {
    return container.some(value => equalByValue(value, member))
  }

  if (container instanceof Map) {
    return Array.from(container.keys()).some(value => equalByValue(value, member))
  }

  if (
    typeof container === 'object' &&
    container !== null &&
    'contains' in container &&
    typeof container.contains === 'function'
  ) {
    return container.contains(member)
  }

  // Python's `in` uses value equality while JavaScript collection methods
  // commonly use object identity. Prefer iteration so translated tests retain
  // Python membership semantics for Move generators, Sets, and similar types.
  if (isIterable(container)) {
    return Array.from(container).some(value => equalByValue(value, member))
  }

  if (
    typeof container === 'object' &&
    container !== null &&
    'includes' in container &&
    typeof container.includes === 'function'
  ) {
    return container.includes(member)
  }

  return false
}

/**
 * Small compatibility layer for mechanically translated `unittest.TestCase`
 * classes. Keeping the upstream class/method shape makes source comparison and
 * one-commit-at-a-time synchronization substantially easier than rewriting the
 * suite into an unrelated test style.
 */
export abstract class TestCase {
  setUp(): void | Promise<void> {}

  tearDown(): void | Promise<void> {}

  assertEqual(actual: unknown, expected: unknown, message?: string): void {
    if (isComparable(actual) || isComparable(expected)) {
      expect(equalByValue(actual, expected), message).toBe(true)
    } else {
      expect(actual, message).toEqual(expected)
    }
  }

  assertNotEqual(actual: unknown, expected: unknown, message?: string): void {
    if (isComparable(actual) || isComparable(expected)) {
      expect(equalByValue(actual, expected), message).toBe(false)
    } else {
      expect(actual, message).not.toEqual(expected)
    }
  }

  assertTrue(value: unknown, message?: string): void {
    expect(Boolean(value), message).toBe(true)
  }

  assertFalse(value: unknown, message?: string): void {
    expect(Boolean(value), message).toBe(false)
  }

  assertIs(actual: unknown, expected: unknown, message?: string): void {
    expect(actual, message).toBe(expected)
  }

  assertIsNot(actual: unknown, expected: unknown, message?: string): void {
    expect(actual, message).not.toBe(expected)
  }

  assertIsNone(actual: unknown, message?: string): void {
    expect(actual, message).toBeNull()
  }

  assertIsNotNone(actual: unknown, message?: string): void {
    expect(actual, message).not.toBeNull()
  }

  assertIn(member: unknown, container: unknown, message?: string): void {
    expect(containsByValue(container, member), message).toBe(true)
  }

  assertNotIn(member: unknown, container: unknown, message?: string): void {
    expect(containsByValue(container, member), message).toBe(false)
  }

  assertLess(actual: number | bigint, expected: number | bigint, message?: string): void {
    expect(actual, message).toBeLessThan(expected)
  }

  assertLessEqual(actual: number | bigint, expected: number | bigint, message?: string): void {
    expect(actual, message).toBeLessThanOrEqual(expected)
  }

  assertGreater(actual: number | bigint, expected: number | bigint, message?: string): void {
    expect(actual, message).toBeGreaterThan(expected)
  }

  assertGreaterEqual(actual: number | bigint, expected: number | bigint, message?: string): void {
    expect(actual, message).toBeGreaterThanOrEqual(expected)
  }

  assertAlmostEqual(actual: number, expected: number, digits = 7): void {
    expect(actual).toBeCloseTo(expected, digits)
  }

  assertRaises(error: Constructor<Error>, callback: () => unknown): void {
    expect(callback).toThrow(error)
  }

  assertRaisesRegex(
    error: Constructor<Error>,
    pattern: RegExp,
    callback: () => unknown,
  ): void {
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
}

interface TestCaseMetadata {
  /** Upstream one-based source line for each camel-cased test method. */
  lines: Readonly<Record<string, number>>
  /** Known chess.ts parity gaps. These must fail until a focused fix removes the marker. */
  expectedFailures?: ReadonlyArray<string>
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
  const missingLines = methods.filter(method => metadata.lines[method] === undefined)
  const staleLines = Object.keys(metadata.lines).filter(method => !methodSet.has(method))
  const staleExpectedFailures = (metadata.expectedFailures ?? []).filter(
    method => !methodSet.has(method),
  )

  if (missingLines.length > 0 || staleLines.length > 0 || staleExpectedFailures.length > 0) {
    throw new Error(
      `${name} has inconsistent upstream metadata: ` +
        JSON.stringify({ missingLines, staleLines, staleExpectedFailures }),
    )
  }

  describe(name, () => {
    for (const method of methods) {
      const sourceLine = metadata.lines[method]
      const register = metadata.expectedFailures?.includes(method)
        ? test.fails
        : test
      register(`${method} (python-chess test.py:${sourceLine})`, async () => {
        const instance = new TestCaseClass()
        const testMethod = instance[method as keyof T]
        if (typeof testMethod !== 'function') {
          throw new TypeError(`${name}.${method} is not callable`)
        }
        await instance.setUp()
        try {
          await testMethod.call(instance)
        } finally {
          await instance.tearDown()
        }
      })
    }
  })
}
