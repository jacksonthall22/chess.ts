import * as chess from '../index'
import * as engine from '../engine'
import * as pgn from '../pgn'

export type CanonicalValue =
  | readonly ['none']
  | readonly ['bool', boolean]
  | readonly ['int', string]
  | readonly ['number', string]
  | readonly ['str', string]
  | readonly ['move', string]
  | readonly ['piece', string]
  | readonly ['board', string]
  | readonly ['base-board', string]
  | readonly ['wdl', string, string, string]
  | readonly ['sequence', readonly CanonicalValue[]]
  | readonly ['set', readonly CanonicalValue[]]
  | readonly ['pgn-node', number]

export type AssertionTraceEvent =
  | readonly ['equal', CanonicalValue, CanonicalValue]
  | readonly ['not-equal', CanonicalValue, CanonicalValue]
  | readonly ['truth', boolean]
  | readonly ['contains', CanonicalValue, AssertionContainerKind, boolean]
  | readonly ['less-equal', CanonicalValue, CanonicalValue]
  | readonly ['raises', AssertionErrorFamily, AssertionErrorFamily]

export type AssertionContainerKind =
  'string' | 'set' | 'sequence' | 'legal-moves' | 'pseudo-legal-moves'

export type AssertionErrorFamily =
  | 'Error'
  | 'TypeError'
  | 'ValueError'
  | 'KeyError'
  | 'InvalidMoveError'
  | 'IllegalMoveError'
  | 'AmbiguousMoveError'

export interface PythonAssertionOracleArtifact {
  readonly schemaVersion: 1
  readonly translatedMethodCount: number
  readonly tracedMethodCount: number
  readonly eventCount: number
  readonly excludedMethods: readonly string[]
  readonly methods: Readonly<Record<string, readonly AssertionTraceEvent[]>>
}

type ErrorConstructor = new (...args: never[]) => Error

const canonicalJson = (value: CanonicalValue): string => JSON.stringify(value)

const compareCanonicalValues = (
  left: CanonicalValue,
  right: CanonicalValue,
): number => {
  const leftJson = canonicalJson(left)
  const rightJson = canonicalJson(right)
  return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0
}

/** A strict, finite value bridge shared by runtime assertion traces. */
export class AssertionValueCanonicalizer {
  readonly #objectIds = new WeakMap<object, number>()
  #nextObjectId = 1

  value(value: unknown): CanonicalValue {
    if (value === null) return ['none']
    if (typeof value === 'boolean') return ['bool', value]
    if (value instanceof chess.SquareSet) return ['int', value.int().toString()]
    if (typeof value === 'bigint') return ['int', value.toString()]
    if (typeof value === 'number') {
      if (!Number.isFinite(value))
        throw new TypeError(
          `assertion oracle requires a finite number, got ${String(value)}`,
        )
      if (Number.isSafeInteger(value)) return ['int', value.toString()]
      if (Number.isInteger(value))
        throw new TypeError(
          `assertion oracle requires a safe integer, got ${String(value)}`,
        )
      const bytes = new Uint8Array(8)
      new DataView(bytes.buffer).setFloat64(0, value, false)
      return [
        'number',
        Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''),
      ]
    }
    if (typeof value === 'string') return ['str', value]
    if (value instanceof chess.Move) return ['move', value.uci()]
    if (value instanceof chess.Piece) return ['piece', value.symbol()]
    if (value instanceof chess.Board) return ['board', value.fen()]
    if (value instanceof chess.BaseBoard)
      return ['base-board', value.boardFen()]
    if (value instanceof engine.Wdl)
      return [
        'wdl',
        value.wins.toString(),
        value.draws.toString(),
        value.losses.toString(),
      ]
    if (Array.isArray(value)) {
      return ['sequence', value.map(item => this.value(item))]
    }
    if (value instanceof Set) {
      const items = Array.from(value, item => this.value(item))
      items.sort(compareCanonicalValues)
      return ['set', items]
    }
    if (value instanceof pgn.GameNode) {
      return ['pgn-node', this.#identity(value)]
    }

    throw new TypeError(
      `unsupported TypeScript assertion value ${this.#describe(value)}`,
    )
  }

  containerKind(value: unknown): AssertionContainerKind {
    if (typeof value === 'string') return 'string'
    if (value instanceof Set) return 'set'
    if (Array.isArray(value)) return 'sequence'
    if (value instanceof chess.LegalMoveGenerator) return 'legal-moves'
    if (value instanceof chess.PseudoLegalMoveGenerator)
      return 'pseudo-legal-moves'

    throw new TypeError(
      `unsupported TypeScript assertion container ${this.#describe(value)}`,
    )
  }

  expectedErrorFamily(error: ErrorConstructor): AssertionErrorFamily {
    if (error === chess.InvalidMoveError) return 'InvalidMoveError'
    if (error === chess.IllegalMoveError) return 'IllegalMoveError'
    if (error === chess.AmbiguousMoveError) return 'AmbiguousMoveError'
    if (error === chess.ValueError) return 'ValueError'
    if (error === chess.KeyError) return 'KeyError'
    if (error === TypeError) return 'TypeError'
    if (error === Error) return 'Error'
    throw new TypeError(
      `unsupported TypeScript expected error ${error.name || '<anonymous>'}`,
    )
  }

  actualErrorFamily(error: unknown): AssertionErrorFamily {
    if (error instanceof chess.InvalidMoveError) return 'InvalidMoveError'
    if (error instanceof chess.IllegalMoveError) return 'IllegalMoveError'
    if (error instanceof chess.AmbiguousMoveError) return 'AmbiguousMoveError'
    if (error instanceof chess.ValueError) return 'ValueError'
    if (error instanceof chess.KeyError) return 'KeyError'
    if (error instanceof TypeError) return 'TypeError'
    if (error instanceof Error) return 'Error'
    throw new TypeError(
      `unsupported TypeScript thrown value ${this.#describe(error)}`,
    )
  }

  #identity(value: object): number {
    const known = this.#objectIds.get(value)
    if (known !== undefined) return known
    const identity = this.#nextObjectId
    this.#nextObjectId += 1
    this.#objectIds.set(value, identity)
    return identity
  }

  #describe(value: unknown): string {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'
    if (
      (typeof value === 'object' || typeof value === 'function') &&
      'constructor' in value
    ) {
      const constructor = value.constructor
      if (
        typeof constructor === 'function' &&
        typeof constructor.name === 'string'
      ) {
        return constructor.name
      }
    }
    return typeof value
  }
}

/** Consumes one method's trace in exact execution order. */
export class AssertionOracleCursor {
  readonly #canonicalizer = new AssertionValueCanonicalizer()
  #index = 0

  constructor(
    readonly method: string,
    readonly expected: readonly AssertionTraceEvent[],
  ) {}

  equal(actual: unknown, expected: unknown): void {
    this.#consume([
      'equal',
      this.#canonicalizer.value(actual),
      this.#canonicalizer.value(expected),
    ])
  }

  notEqual(actual: unknown, expected: unknown): void {
    this.#consume([
      'not-equal',
      this.#canonicalizer.value(actual),
      this.#canonicalizer.value(expected),
    ])
  }

  truth(value: boolean): void {
    this.#consume(['truth', value])
  }

  contains(member: unknown, container: unknown, result: boolean): void {
    this.#consume([
      'contains',
      this.#canonicalizer.value(member),
      this.#canonicalizer.containerKind(container),
      result,
    ])
  }

  lessEqual(actual: number | bigint, expected: number | bigint): void {
    this.#consume([
      'less-equal',
      this.#canonicalizer.value(actual),
      this.#canonicalizer.value(expected),
    ])
  }

  raises(error: ErrorConstructor, thrown: unknown): void {
    this.#consume([
      'raises',
      this.#canonicalizer.expectedErrorFamily(error),
      this.#canonicalizer.actualErrorFamily(thrown),
    ])
  }

  unsupported(assertion: string): never {
    throw new Error(
      `${this.method}: assertion oracle does not support ${assertion}`,
    )
  }

  finish(): void {
    if (this.#index !== this.expected.length) {
      throw new Error(
        `${this.method}: assertion oracle consumed ${this.#index} of ` +
          `${this.expected.length} events`,
      )
    }
  }

  #consume(actual: AssertionTraceEvent): void {
    const expected = this.expected[this.#index]
    const eventNumber = this.#index + 1
    if (expected === undefined) {
      throw new Error(
        `${this.method}: unexpected assertion-oracle event ${eventNumber}: ` +
          JSON.stringify(actual),
      )
    }
    const actualJson = JSON.stringify(actual)
    const expectedJson = JSON.stringify(expected)
    if (actualJson !== expectedJson) {
      throw new Error(
        `${this.method}: assertion-oracle event ${eventNumber} differs\n` +
          `expected ${expectedJson}\nactual   ${actualJson}`,
      )
    }
    this.#index += 1
  }
}

/** Validates the generated method partition before any test executes. */
export class AssertionOracleCatalog {
  readonly #excluded: ReadonlySet<string>

  constructor(readonly artifact: PythonAssertionOracleArtifact) {
    if (artifact.schemaVersion !== 1) {
      throw new Error(
        `unsupported assertion-oracle schema ${String(artifact.schemaVersion)}`,
      )
    }
    const traced = Object.keys(artifact.methods)
    const excluded = new Set(artifact.excludedMethods)
    if (excluded.size !== artifact.excludedMethods.length) {
      throw new Error('assertion oracle has duplicate excluded methods')
    }
    const overlap = traced.filter(method => excluded.has(method))
    if (overlap.length > 0) {
      throw new Error(
        `assertion-oracle methods are both traced and excluded: ${overlap.join(', ')}`,
      )
    }
    const eventCount = Object.values(artifact.methods).reduce(
      (total, events) => total + events.length,
      0,
    )
    if (traced.length !== artifact.tracedMethodCount) {
      throw new Error(
        `assertion-oracle traced count is ${traced.length}, ` +
          `metadata says ${artifact.tracedMethodCount}`,
      )
    }
    if (eventCount !== artifact.eventCount) {
      throw new Error(
        `assertion-oracle event count is ${eventCount}, ` +
          `metadata says ${artifact.eventCount}`,
      )
    }
    if (traced.length + excluded.size !== artifact.translatedMethodCount) {
      throw new Error(
        'assertion-oracle traced and excluded methods do not cover the ' +
          'translated selection',
      )
    }
    this.#excluded = excluded
  }

  cursor(method: string): AssertionOracleCursor | null {
    const events = this.artifact.methods[method]
    if (events !== undefined) return new AssertionOracleCursor(method, events)
    if (this.#excluded.has(method)) return null
    throw new Error(`assertion oracle does not classify ${method}`)
  }
}
