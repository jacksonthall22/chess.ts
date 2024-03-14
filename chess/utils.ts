/**
 * A mirror of Python's `collections.Counter` class.
 */
export class Counter<T> extends Map<T, number> {
  constructor(iterable?: Iterable<readonly [T, number]>) {
    super(iterable)
    if (iterable) {
      // Set initial counts
      for (const [key, value] of iterable) {
        this.set(key, value)
      }
    }
  }

  update(iterable: Iterable<T>): void {
    for (const item of iterable) {
      this.set(item, (this.get(item) || 0) + 1)
    }
  }
}

/**
 * Return a global version of the given regex pattern.
 */
export const toGlobal = (pat: RegExp): RegExp => {
  return pat.global ? pat : new RegExp(pat.source, pat.flags + 'g')
}

/**
 * Parse a string to an integer, throwing an error if the entire string
 * is not formatted as an integer.
 */
export const parseIntStrict = (str: string): number => {
  if (str.match(/^-?(0|[1-9]\d*)$/) === null) {
    throw new Error(`ValueError: ${str} is not an integer`)
  }
  return parseInt(str, 10)
}

/**
 * Replace the first `count` instanaces of `pat` in `inputStr` with `repl`,
 * which may either be a new string, or a function that takes the matched
 * string and returns a new string. Converts `regex` to a global regex if
 * it is not already so that all instances could be replaced.
 */
export const subn = (
  regex: RegExp,
  replacer: (substring: string, ...args: any[]) => string,
  str: string,
  count: number = 0,
): [string, number] => {
  let found = 0
  regex = toGlobal(regex)
  const result = str.replace(regex, (...args) => {
    if (count === 0 || found < count) {
      found++
      return replacer(...args)
    }
    return args[0] // return the match itself
  })
  return [result, found]
}

export const sub = (
  regex: RegExp,
  replacer: (substring: string, ...args: any[]) => string,
  str: string,
): string => {
  return subn(regex, replacer, str)[0]
}

/**
 * A mirror of Python's `str.isspace()` method.
 */
export const isspace = (s: string): boolean => {
  return s !== '' && s.trim() === ''
}

/**
 * Return `!!x`.
 */
export const bool = (x: any) => !!x

/**
 * Convert a boolean to 1 if true, 0 if false.
 */
export const boolToNumber = (b: boolean): 1 | 0 => (b ? 1 : 0)

/**
 * Return the quotient and remainder of the division of `x` by `y`.
 *
 * A mirror of Python's `divmod()` function.
 */
export const divmod = (x: number, y: number): [number, number] => {
  const quotient = Math.floor(x / y)
  const remainder = x % y
  return [quotient, remainder]
}

/**
 * Get the number of bits necessary to represent `n` in binary.
 *
 * A mirror of Python's `int.bit_length()` method.
 */
export const bitLength = (n: number | bigint): number => {
  let length = 0
  if (typeof n === 'number') {
    while (n) {
      n >>= 1
      length++
    }
  } else {
    while (n) {
      n >>= 1n
      length++
    }
  }
  return length
}

/**
 * Number of ones in the binary representation of the absolute value of `n`.
 * Also known as the population count.
 *
 * A mirror of Python's `int.bit_count()` method.
 */
export const bitCount = (n: number | bigint): number => {
  let count = 0
  if (typeof n === 'number') {
    while (n) {
      n &= n - 1
      count++
    }
  } else {
    while (n) {
      n &= n - 1n
      count++
    }
  }
  return count
}

/**
 * A mirror of Python's `range()` function.
 */
export function* range(
  start: number,
  stop?: number,
  step?: number,
): IterableIterator<number> {
  if (stop === undefined) {
    stop = start
    start = 0
  }
  if (step === undefined) {
    step = 1
  }
  for (let i = start; i < stop; i += step) {
    yield i
  }
}

/**
 * A mirror of Python's `enumerate()` function.
 */
export function* enumerate<T>(
  iterable: Iterable<T>,
  start = 0,
): IterableIterator<[number, T]> {
  for (const value of iterable) {
    yield [start++, value]
  }
}

/**
 * A mirror of Python's `itertools.chain` function.
 */
export function* iterChain<T>(
  ...iterables: Iterable<T>[]
): IterableIterator<T> {
  for (const iterable of iterables) {
    yield* iterable
  }
}

/**
 * A mirror of Python's `itertools.islice` function.
 */
export function* islice<T>(
  iterable: Iterable<T>,
  start: number | null,
  stop: number | null,
  step: number = 1,
): IterableIterator<T> {
  if (start === null) {
    start = 0
  }
  let i = 0
  for (const item of iterable) {
    if (i < start) {
      i++
      continue
    }
    if (stop !== null && i >= stop) {
      break
    }
    if ((i - start) % step === 0) {
      yield item
    }
    i++
  }
}

/**
 * A mirror of Python's `StopIteration` error.
 */
export class StopIteration extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'StopIteration'
    Object.setPrototypeOf(this, StopIteration.prototype)
  }
}

/**
 * A mirror of Python's `next()` function. Throws `StopIteration` if the
 * iterable is exhausted.
 */
export const iterNext = <T>(iterable: IterableIterator<T>): T => {
  const next = iterable.next()
  if (next.done) {
    throw new StopIteration()
  }
  return next.value
}

/**
 * Return `true` if `value` is an element in the iterable.
 */
export const iterIncludes = <T>(iterable: Iterable<T>, value: T): boolean => {
  for (const item of iterable) {
    if (item === value) {
      return true
    }
  }
  return false
}

/**
 * Return `true` if any element of the iterable is truthy according to `isTruthy`.
 * If none are true or the iterable is empty, return `false`.
 */
export const iterAny = <T>(
  iterable: Iterable<T>,
  isTruthy: (value: T) => boolean = bool,
): boolean => {
  for (const item of iterable) {
    if (isTruthy(item)) {
      return true
    }
  }
  return false
}

/**
 * Return `true` if all elements of the iterable are truthy according to `isTruthy`.
 * Returns `true` for an empty iterable.
 */
export const iterAll = <T>(
  iterable: Iterable<T>,
  isTruthy: (value: T) => boolean = bool,
): boolean => {
  for (const item of iterable) {
    if (!isTruthy(item)) {
      return false
    }
  }
  return true
}

/**
 * Yield the elements of `iterable` that are truthy against `predicate`.
 */
export function* iterFilter<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => boolean = bool,
): IterableIterator<T> {
  for (const item of iterable) {
    if (predicate(item)) {
      yield item
    }
  }
}

/**
 * Maps each element of `iterable` to a new value using `callback`.
 */
export function* iterMap<T1, T2>(
  iterable: IterableIterator<T1>,
  callback: (value: T1) => T2,
): IterableIterator<T2> {
  for (let x of iterable) {
    yield callback(x)
  }
}

/**
 * Remove the first occurrence of `element` from `src` in-place.
 */
export const remove = <T>(src: T[], element: T): void => {
  const index: number = src.indexOf(element)
  if (index === -1) return
  src.splice(index, 1)
}

export default {
  Counter,
  toGlobal,
  parseIntStrict,
  subn,
  sub,
  isspace,
  bool,
  boolToNumber,
  divmod,
  bitLength,
  bitCount,
  range,
  enumerate,
  iterChain,
  islice,
  StopIteration,
  iterNext,
  iterIncludes,
  iterAny,
  iterAll,
  iterFilter,
  iterMap,
  remove,
}
