/**
 * The runtime equivalent of Python's `ValueError`.
 *
 * The named class preserves the error family used by python-chess without
 * claiming the narrower semantics of JavaScript's `RangeError`.
 */
export class ValueError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'ValueError'
  }
}

/** The runtime equivalent of Python's `KeyError`. */
export class KeyError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'KeyError'
  }
}
