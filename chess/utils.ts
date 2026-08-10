import { ValueError } from './errors'

/** Python 3.12 / Unicode 15.0 whitespace used by `str` and `re`. */
export const PYTHON_WHITESPACE_SOURCE =
  '[\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]'

const PYTHON_WHITESPACE_ONLY = new RegExp(
  `^(?:${PYTHON_WHITESPACE_SOURCE})+$`,
)
export const PYTHON_LEADING_WHITESPACE = new RegExp(
  `^(?:${PYTHON_WHITESPACE_SOURCE})+`,
)
export const PYTHON_TRAILING_WHITESPACE = new RegExp(
  `(?:${PYTHON_WHITESPACE_SOURCE})+$`,
)
export const PYTHON_WHITESPACE_RUN = new RegExp(
  `${PYTHON_WHITESPACE_SOURCE}+`,
)
const PYTHON_WHITESPACE_RUNS = new RegExp(
  `${PYTHON_WHITESPACE_SOURCE}+`,
  'g',
)

const PYTHON_INTEGER = /^[+-]?[0-9](?:_?[0-9])*$/
const PYTHON_FLOAT =
  /^[+-]?(?:(?:[0-9](?:_?[0-9])*(?:\.[0-9](?:_?[0-9])*)?)|(?:[0-9](?:_?[0-9])*\.)|(?:\.[0-9](?:_?[0-9])*))(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/

/**
 * Decimal-zero code points from Unicode 15.0, the character database used by
 * the Python 3.12 reference runtime in CI. Each zero begins one contiguous
 * ten-character decimal digit set.
 */
const PYTHON_DECIMAL_ZERO_CODE_POINTS = [
  0x30, 0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6,
  0xc66, 0xce6, 0xd66, 0xde6, 0xe50, 0xed0, 0xf20, 0x1040, 0x1090,
  0x17e0, 0x1810, 0x1946, 0x19d0, 0x1a80, 0x1a90, 0x1b50, 0x1bb0,
  0x1c40, 0x1c50, 0xa620, 0xa8d0, 0xa900, 0xa9d0, 0xa9f0, 0xaa50,
  0xabf0, 0xff10, 0x104a0, 0x10d30, 0x11066, 0x110f0, 0x11136,
  0x111d0, 0x112f0, 0x11450, 0x114d0, 0x11650, 0x116c0, 0x11730,
  0x118e0, 0x11950, 0x11c50, 0x11d50, 0x11da0, 0x11f50, 0x16a60,
  0x16ac0, 0x16b50, 0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec, 0x1d7f6,
  0x1e140, 0x1e2f0, 0x1e4f0, 0x1e950, 0x1fbf0,
] as const

const regexBmpCodePoint = (codePoint: number): string =>
  `\\u${codePoint.toString(16).padStart(4, '0')}`

const pythonBmpDecimalRanges = PYTHON_DECIMAL_ZERO_CODE_POINTS.filter(
  zero => zero <= 0xffff,
)
  .map(zero => `${regexBmpCodePoint(zero)}-${regexBmpCodePoint(zero + 9)}`)
  .join('')
const pythonAstralDecimalDigits = PYTHON_DECIMAL_ZERO_CODE_POINTS.filter(
  zero => zero > 0xffff,
).flatMap(zero =>
  Array.from({ length: 10 }, (_, digit) => String.fromCodePoint(zero + digit)),
)

/** Python 3.12 / Unicode 15.0 `re` decimal-digit atom (`\\d`). */
export const PYTHON_DECIMAL_DIGIT_SOURCE =
  `(?:[${pythonBmpDecimalRanges}]|` + pythonAstralDecimalDigits.join('|') + ')'

/** Direct equivalent of Python's acceptance of Unicode decimal digits. */
export const normalizePythonDecimalDigits = (value: string): string =>
  Array.from(value, character => {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined) {
      throw new Error('a Unicode character must contain one code point')
    }

    const zero = PYTHON_DECIMAL_ZERO_CODE_POINTS.find(
      candidate => candidate <= codePoint && codePoint < candidate + 10,
    )
    return zero === undefined ? character : String(codePoint - zero)
  }).join('')

/** Direct equivalents of Python's strict `int()` and `float()` string parsing. */
export const parsePythonInt = (value: string): number | bigint => {
  const normalized = normalizePythonDecimalDigits(
    value
      .replace(PYTHON_LEADING_WHITESPACE, '')
      .replace(PYTHON_TRAILING_WHITESPACE, ''),
  )
  if (!PYTHON_INTEGER.test(normalized)) {
    throw new ValueError(`invalid literal for int(): ${JSON.stringify(value)}`)
  }

  const parsed = BigInt(normalized.replaceAll('_', ''))
  if (
    parsed <= BigInt(Number.MAX_SAFE_INTEGER) &&
    parsed >= BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return Number(parsed)
  }
  return parsed
}

export const parsePythonFloat = (value: string): number => {
  const normalized = normalizePythonDecimalDigits(
    value
      .replace(PYTHON_LEADING_WHITESPACE, '')
      .replace(PYTHON_TRAILING_WHITESPACE, ''),
  )
  if (!PYTHON_FLOAT.test(normalized)) {
    throw new ValueError(`could not convert string to float: ${value}`)
  }
  return Number(normalized.replaceAll('_', ''))
}

/** Direct equivalent of Python's shortest finite `str(float)` formatting. */
export const formatPythonFloat = (value: number): string => {
  if (!Number.isFinite(value)) {
    throw new ValueError(`expected a finite float, got: ${value}`)
  }
  if (Object.is(value, -0)) {
    return '-0.0'
  }

  const negative = value < 0
  const source = Math.abs(value).toString()
  const [coefficient, sourceExponent] = source.split('e')
  const decimalIndex = coefficient.includes('.')
    ? coefficient.indexOf('.')
    : coefficient.length
  const rawDigits = coefficient.replace('.', '')
  const leadingZeroes = rawDigits.length - rawDigits.replace(/^0+/, '').length
  const digits = rawDigits
    .slice(leadingZeroes)
    .replace(/0+$/, '') || '0'
  const exponent =
    sourceExponent === undefined
      ? decimalIndex - leadingZeroes - 1
      : Number(sourceExponent)
  const sign = negative ? '-' : ''

  if (exponent < -4 || exponent >= 16) {
    const mantissa =
      digits.length === 1 ? digits : `${digits[0]}.${digits.slice(1)}`
    const exponentSign = exponent >= 0 ? '+' : '-'
    return (
      `${sign}${mantissa}e${exponentSign}` +
      Math.abs(exponent).toString().padStart(2, '0')
    )
  }

  const targetDecimalIndex = exponent + 1
  if (targetDecimalIndex <= 0) {
    return `${sign}0.${'0'.repeat(-targetDecimalIndex)}${digits}`
  }
  if (targetDecimalIndex >= digits.length) {
    return (
      `${sign}${digits}${'0'.repeat(targetDecimalIndex - digits.length)}` +
      '.0'
    )
  }
  return (
    `${sign}${digits.slice(0, targetDecimalIndex)}.` +
    digits.slice(targetDecimalIndex)
  )
}

/** Direct equivalent of `str.split(None, maxsplit)`. */
export const splitWhitespaceWithMax = (
  value: string,
  maxSplit: number,
): string[] => {
  const normalized = value
    .replace(PYTHON_LEADING_WHITESPACE, '')
    .replace(PYTHON_TRAILING_WHITESPACE, '')
  if (!normalized) {
    return []
  }
  const parts: string[] = []
  let start = 0
  for (const match of normalized.matchAll(PYTHON_WHITESPACE_RUNS)) {
    if (parts.length === maxSplit) {
      break
    }
    parts.push(normalized.slice(start, match.index))
    start = match.index + match[0].length
  }
  parts.push(normalized.slice(start))
  return parts
}

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
    throw new ValueError(`${str} is not an integer`)
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
 * Remove the leading characters that Python treats as Unicode whitespace.
 *
 * This is intentionally not implemented with JavaScript's `trimStart()`:
 * ECMAScript strips U+FEFF but Python does not, while Python strips the
 * information separators U+001C–U+001F and ECMAScript does not.
 */
export const lstrip = (s: string): string => {
  return s.replace(PYTHON_LEADING_WHITESPACE, '')
}

/**
 * A mirror of Python's `str.isspace()` method.
 */
export const isspace = (s: string): boolean => {
  return PYTHON_WHITESPACE_ONLY.test(s)
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
 * Return `true` if `value` is equal to any element in the iterable according to `equalityCheck`.
 */
export const iterIncludes = <T>(
    iterable: Iterable<T>,
    value: T,
    equalityCheck: (a: T, b: T) => boolean = (a, b) => a === b,
  ): boolean => {
  for (const item of iterable) {
    if (equalityCheck(item, value)) {
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
  lstrip,
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
