/**
 * A mirror of Python's `collections.Counter` class.
 */
export class Counter<T> extends Map<T, number> {
  constructor(iterable?: Iterable<readonly [T, number]>) {
    super(iterable);
    if (iterable) {
      // Set initial counts
      for (const [key, value] of iterable) {
        this.set(key, value);
      }
    }
  }

  update(iterable: Iterable<T>): void {
    for (const item of iterable) {
      this.set(item, (this.get(item) || 0) + 1);
    }
  }
}


/**
 * Return `!!x`.
 */
export const bool = (x: any) => !!x;


/**
 * Parse a string to an integer, throwing an error if the entire string
 * is not formatted as an integer.
 */
export const parseIntStrict = (str: string): number => {
  if (str.match(/^-?(0|[1-9]\d*)$/) === null) {
    throw new Error(`ValueError: ${str} is not an integer`);
  }
  return parseInt(str, 10);
};


/**
 * Convert a boolean to 1 if true, 0 if false.
 */
export const boolToNumber = (b: boolean): 1 | 0 => (b ? 1 : 0);


/**
 * Return the quotient and remainder of the division of `x` by `y`.
 *
 * A mirror of Python's `divmod()` function.
 */
export function divmod(x: number, y: number): [number, number] {
  const quotient = Math.floor(x / y);
  const remainder = x % y;
  return [quotient, remainder];
}


/**
 * Get the number of bits necessary to represent `n` in binary.
 * 
 * A mirror of Python's `int.bit_length()` function.
 */
export const bitLength = (n: number | bigint): number => {
  let length = 0;
  if (typeof n === 'number') {
    while (n) {
      n >>= 1;
      length++;
    }
  } else {
    while (n) {
      n >>= 1n;
      length++;
    }
  }
  return length;
};


/**
 * Number of ones in the binary representation of the absolute value of `n`.
 * Also known as the population count.
 * 
 * A mirror of Python's `int.bit_count()` function.
 */
export const bitCount = (n: number | bigint): number => {
  let count = 0;
  if (typeof n === 'number') {
    while (n) {
      n &= n - 1;
      count++;
    }
  } else {
    while (n) {
      n &= n - 1n;
      count++;
    }
  }
  return count;
};


/**
 * A mirror of Python's `range()` function.
 */
export function* range(
  start: number,
  stop?: number,
  step?: number,
): IterableIterator<number> {
  if (stop === undefined) {
    stop = start;
    start = 0;
  }
  if (step === undefined) {
    step = 1;
  }
  for (let i = start; i < stop; i += step) {
    yield i;
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
    yield [start++, value];
  }
}


/**
 * A mirror of Python's `StopIteration` error.
 */
export class StopIteration extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'StopIteration';
    Object.setPrototypeOf(this, StopIteration.prototype);
  }
}


/**
 * A mirror of Python's `next()` function. Throws `StopIteration` if the
 * iterable is exhausted.
 */
export const iterNext = <T>(iterable: IterableIterator<T>): T => {
  const next = iterable.next();
  if (next.done) {
    throw new StopIteration();
  }
  return next.value;
};


/**
 * Return `true` if `value` is an element in the iterable.
 */
export const iterIncludes = <T>(iterable: Iterable<T>, value: T): boolean => {
  for (const item of iterable) {
    if (item === value) {
      return true;
    }
  }
  return false;
};


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
      return true;
    }
  }
  return false;
};


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
      return false;
    }
  }
  return true;
};


/**
 * Yield the elements of `iterable` that are truthy against `predicate`.
 */
export function* iterFilter<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => boolean,
): IterableIterator<T> {
  for (const item of iterable) {
    if (predicate(item)) {
      yield item;
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
    yield callback(x);
  }
}
