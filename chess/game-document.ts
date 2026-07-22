import { parseGameNodeId, type GameNodeId } from './game-node-id'
import {
  parseGameMoveUci,
  parsePgnHeaderName,
  parsePgnHeaderValue,
} from './game-document-values'

/** The independently observable parts of a structured game document. */
export type GameDocumentChangeCategory =
  | 'structure'
  | 'comments'
  | 'starting-comments'
  | 'nags'
  | 'headers'

const CHANGE_CATEGORY_ORDER: readonly GameDocumentChangeCategory[] = [
  'structure',
  'comments',
  'starting-comments',
  'nags',
  'headers',
]

/** A synchronous, final-state notification for one outer transaction. */
export interface GameDocumentChangeEvent {
  readonly revision: number
  readonly origin: unknown
  readonly categories: readonly GameDocumentChangeCategory[]
  /**
   * Parents whose visible ordered children changed, plus nodes whose own
   * existence, parent, incoming move, or removal status changed. Annotation
   * changes also include their owning node.
   */
  readonly changedNodeIds: readonly GameNodeId[]
  readonly changedHeaderNames: readonly string[]
}

export type GameDocumentChangeListener = (
  event: GameDocumentChangeEvent,
) => void

/**
 * A transaction callback whose result is known not to be promise-like.
 *
 * This conditional type rejects ordinary `async` and `PromiseLike` callbacks
 * while preserving the callback's exact synchronous return type.
 */
export type GameDocumentTransactionCallback<
  Callback extends () => unknown,
> = 0 extends 1 & ReturnType<Callback>
  ? Callback
  : [Extract<ReturnType<Callback>, PromiseLike<unknown>>] extends [never]
    ? Callback
    : never

export interface GameDocumentTransactionOptions {
  /**
   * Identifies the initiator of a change (for example, an undo manager or a
   * synchronization provider). Nested transactions inherit the outer origin.
   */
  readonly origin?: unknown
}

export interface GameDocumentAddNodeInput {
  readonly nodeId: GameNodeId
  readonly parentId: GameNodeId
  /** The immutable UCI description of the edge from the parent to this node. */
  readonly moveUci: string
  readonly comments: readonly string[]
  readonly startingComments: readonly string[]
  readonly nags: Iterable<number>
}

export interface GameDocumentAddNodeOptions {
  /** Insertion index in the parent's children. Defaults to the end. */
  readonly index?: number
}

export interface MemoryGameDocumentOptions {
  readonly headers?: Iterable<readonly [string, string]>
  readonly comments?: readonly string[]
  readonly startingComments?: readonly string[]
  readonly nags?: Iterable<number>
}

/**
 * Canonical storage operations for one structured chess game.
 *
 * Implementations own node identity, incoming moves, variation order,
 * annotations, and headers. Consumers should not maintain a second mutable
 * tree beside this document. Root identity, node ancestry, and incoming moves
 * are write-once. Node records remain addressable for the document lifetime;
 * removal applies a terminal visibility tombstone to the retained subtree
 * rather than physically deleting records.
 */
export interface GameDocument {
  readonly rootId: GameNodeId
  readonly revision: number

  /**
   * Batches mutations into one notification. Batching is intentionally not a
   * rollback boundary: mutations remain applied if the callback throws. The
   * callback must finish synchronously. Returning a promise or thenable is a
   * `TypeError` at runtime as well as a type error for normally typed callers.
   * Publication compares the final observable state with the start of the
   * outer transaction, so a transaction that restores every touched value
   * emits no event or revision.
   *
   * Listener failures are reported only after every listener and every queued
   * reentrant event has been delivered. One failure is rethrown unchanged;
   * multiple failures use `AggregateError` in delivery order. If the callback
   * and listeners both fail, the aggregate lists the callback failure first
   * and also exposes it as `cause`.
   */
  transact<Callback extends () => unknown>(
    callback: GameDocumentTransactionCallback<Callback>,
    options?: GameDocumentTransactionOptions,
  ): ReturnType<Callback>
  /**
   * Subscribes a synchronous observer. Observer exceptions never prevent later
   * observers from seeing the event. They are rethrown or aggregated by the
   * outer mutation only after the event queue has drained.
   */
  subscribe(listener: GameDocumentChangeListener): () => void

  hasNode(nodeId: GameNodeId): boolean
  getParentId(nodeId: GameNodeId): GameNodeId | null
  getMoveUci(nodeId: GameNodeId): string | null
  getChildIds(nodeId: GameNodeId): readonly GameNodeId[]
  /** True when this node or any ancestor has a terminal tombstone. */
  isRemoved(nodeId: GameNodeId): boolean

  addNode(
    input: GameDocumentAddNodeInput,
    options?: GameDocumentAddNodeOptions,
  ): void
  /**
   * Tombstones the retained subtree. Repeated removal is a no-op. A
   * synchronized implementation must also treat descendants first observed
   * after this operation as removed through their tombstoned ancestry.
   */
  removeChild(parentId: GameNodeId, nodeId: GameNodeId): boolean
  moveChild(parentId: GameNodeId, nodeId: GameNodeId, index: number): void

  getComments(nodeId: GameNodeId): readonly string[]
  setComments(nodeId: GameNodeId, comments: readonly string[]): void
  insertComment(nodeId: GameNodeId, index: number, comment: string): void
  editComment(nodeId: GameNodeId, index: number, comment: string): void
  removeComment(nodeId: GameNodeId, index: number): string
  getStartingComments(nodeId: GameNodeId): readonly string[]
  setStartingComments(
    nodeId: GameNodeId,
    startingComments: readonly string[],
  ): void
  insertStartingComment(
    nodeId: GameNodeId,
    index: number,
    comment: string,
  ): void
  editStartingComment(
    nodeId: GameNodeId,
    index: number,
    comment: string,
  ): void
  removeStartingComment(nodeId: GameNodeId, index: number): string
  /** Returns a frozen, numerically sorted snapshot. */
  getNags(nodeId: GameNodeId): readonly number[]
  setNags(nodeId: GameNodeId, nags: Iterable<number>): void
  addNag(nodeId: GameNodeId, nag: number): boolean
  removeNag(nodeId: GameNodeId, nag: number): boolean
  clearNags(nodeId: GameNodeId): void

  getHeader(name: string): string | undefined
  setHeader(name: string, value: string): void
  deleteHeader(name: string): boolean
  /** Returns a frozen snapshot in canonical insertion order. */
  getHeaderEntries(): readonly (readonly [string, string])[]
}

interface MemoryNodeRecord {
  readonly nodeId: GameNodeId
  readonly parentId: GameNodeId | null
  readonly moveUci: string | null
  readonly childIds: GameNodeId[]
  removed: boolean
  comments: string[]
  startingComments: string[]
  nags: number[]
}

interface MemoryNodeStructureSnapshot {
  readonly parentId: GameNodeId | null
  readonly moveUci: string | null
  readonly removed: boolean
}

interface PendingBeforeValues {
  /** `null` means the node did not exist when first touched. */
  readonly nodeStructures: Map<
    GameNodeId,
    MemoryNodeStructureSnapshot | null
  >
  readonly childIds: Map<GameNodeId, readonly GameNodeId[]>
  readonly comments: Map<GameNodeId, readonly string[]>
  readonly startingComments: Map<GameNodeId, readonly string[]>
  readonly nags: Map<GameNodeId, readonly number[]>
  /** `null` means headers were not touched by this transaction. */
  headers: readonly (readonly [string, string])[] | null
}

interface DerivedChanges {
  readonly categories: Set<GameDocumentChangeCategory>
  readonly nodeIds: Set<GameNodeId>
  readonly headerNames: Set<string>
}

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const freezeArray = <T>(values: readonly T[]): readonly T[] =>
  Object.freeze([...values])

const copyStrings = (
  values: readonly string[],
  description: string,
): string[] => {
  const copy = [...values]
  for (const value of copy) {
    if (typeof value !== 'string') {
      throw new TypeError(`${description} must contain only strings`)
    }
  }
  return copy
}

const copyNags = (values: Iterable<number>): number[] => {
  const unique = new Set<number>()
  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError('NAGs must be safe integers')
    }
    unique.add(value)
  }
  return [...unique].sort((left, right) => left - right)
}

const isThenable = (value: unknown): value is PromiseLike<unknown> => {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return false
  }

  return typeof (value as { readonly then?: unknown }).then === 'function'
}

const throwTransactionFailures = (
  callbackFailed: boolean,
  callbackFailure: unknown,
  listenerFailures: readonly unknown[],
): void => {
  if (callbackFailed && listenerFailures.length !== 0) {
    throw new AggregateError(
      [callbackFailure, ...listenerFailures],
      'Game document transaction callback and change listeners failed',
      { cause: callbackFailure },
    )
  }
  if (callbackFailed) {
    throw callbackFailure
  }
  if (listenerFailures.length === 1) {
    throw listenerFailures[0]
  }
  if (listenerFailures.length > 1) {
    throw new AggregateError(
      listenerFailures,
      'Game document change listeners failed',
    )
  }
}

const equalArrays = <T>(left: readonly T[], right: readonly T[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

const assertHeaderName = (name: string): void => {
  parsePgnHeaderName(name)
}

const assertHeaderValue = (value: string): void => {
  parsePgnHeaderValue(value)
}

const assertInsertionIndex = (index: number, length: number): void => {
  if (!Number.isSafeInteger(index) || index < 0 || index > length) {
    throw new RangeError(
      `Child insertion index must be an integer between 0 and ${length}`,
    )
  }
}

const assertExistingIndex = (index: number, length: number): void => {
  if (!Number.isSafeInteger(index) || index < 0 || index >= length) {
    throw new RangeError(
      `Child index must be an integer between 0 and ${Math.max(0, length - 1)}`,
    )
  }
}

/**
 * In-memory reference implementation of {@link GameDocument}.
 *
 * Nodes live in one flat map. Parent IDs and ordered child IDs describe the
 * tree; no `Game`, `GameNode`, or `Move` objects are mirrored here. This makes
 * the implementation useful both in production without collaboration and as
 * an executable contract for a future synchronized document adapter.
 */
export class MemoryGameDocument implements GameDocument {
  readonly #rootId: GameNodeId
  #revision = 0
  #nodes = new Map<GameNodeId, MemoryNodeRecord>()
  #headers = new Map<string, string>()
  #listeners = new Set<GameDocumentChangeListener>()
  #transactionDepth = 0
  #transactionOrigin: unknown
  #pendingBeforeValues: PendingBeforeValues | null = null
  #eventQueue: GameDocumentChangeEvent[] = []
  #isDispatchingEvents = false

  constructor(rootId: GameNodeId, options: MemoryGameDocumentOptions = {}) {
    rootId = parseGameNodeId(rootId)
    const comments = copyStrings(options.comments ?? [], 'Comments')
    const startingComments = copyStrings(
      options.startingComments ?? [],
      'Starting comments',
    )
    const nags = copyNags(options.nags ?? [])
    const headers = [...(options.headers ?? [])]

    for (const entry of headers) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new TypeError('Headers must contain [name, value] entries')
      }
      const [name, value] = entry
      assertHeaderName(name)
      assertHeaderValue(value)
      this.#headers.set(name, value)
    }

    this.#rootId = rootId
    this.#nodes.set(rootId, {
      nodeId: rootId,
      parentId: null,
      moveUci: null,
      childIds: [],
      removed: false,
      comments,
      startingComments,
      nags,
    })
  }

  get rootId(): GameNodeId {
    return this.#rootId
  }

  get revision(): number {
    return this.#revision
  }

  transact<Callback extends () => unknown>(
    callback: GameDocumentTransactionCallback<Callback>,
    { origin }: GameDocumentTransactionOptions = {},
  ): ReturnType<Callback> {
    if (typeof callback !== 'function') {
      throw new TypeError('Transaction callback must be a function')
    }

    const isOuterTransaction = this.#transactionDepth === 0
    if (isOuterTransaction) {
      this.#transactionOrigin = origin
      this.#pendingBeforeValues = {
        nodeStructures: new Map<
          GameNodeId,
          MemoryNodeStructureSnapshot | null
        >(),
        childIds: new Map<GameNodeId, readonly GameNodeId[]>(),
        comments: new Map<GameNodeId, readonly string[]>(),
        startingComments: new Map<GameNodeId, readonly string[]>(),
        nags: new Map<GameNodeId, readonly number[]>(),
        headers: null,
      }
    }

    this.#transactionDepth += 1
    let callbackFailed = false
    let callbackFailure: unknown
    let result: unknown
    try {
      result = callback()
      if (isThenable(result)) {
        throw new TypeError(
          'Transaction callback must complete synchronously and must not return a promise or thenable',
        )
      }
    } catch (error) {
      callbackFailed = true
      callbackFailure = error
    } finally {
      this.#transactionDepth -= 1
    }

    const listenerFailures = isOuterTransaction ? this.#flushChanges() : []
    throwTransactionFailures(
      callbackFailed,
      callbackFailure,
      listenerFailures,
    )
    return result as ReturnType<Callback>
  }

  subscribe(listener: GameDocumentChangeListener): () => void {
    if (typeof listener !== 'function') {
      throw new TypeError('Change listener must be a function')
    }
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  hasNode(nodeId: GameNodeId): boolean {
    return this.#nodes.has(parseGameNodeId(nodeId))
  }

  getParentId(nodeId: GameNodeId): GameNodeId | null {
    return this.#requireNode(nodeId).parentId
  }

  getMoveUci(nodeId: GameNodeId): string | null {
    return this.#requireNode(nodeId).moveUci
  }

  getChildIds(nodeId: GameNodeId): readonly GameNodeId[] {
    return freezeArray(this.#requireNode(nodeId).childIds)
  }

  isRemoved(nodeId: GameNodeId): boolean {
    return this.#requireNode(nodeId).removed
  }

  addNode(
    input: GameDocumentAddNodeInput,
    { index }: GameDocumentAddNodeOptions = {},
  ): void {
    const nodeId = parseGameNodeId(input.nodeId)
    const parentId = parseGameNodeId(input.parentId)
    if (nodeId === this.rootId) {
      throw new Error('The root node cannot be added as a child')
    }
    if (this.#nodes.has(nodeId)) {
      throw new Error(`Duplicate game node ID: ${nodeId}`)
    }
    const parent = this.#requireNode(parentId)
    if (parent.removed) {
      throw new Error(`Cannot add a child below removed game node ${parentId}`)
    }
    const moveUci = parseGameMoveUci(input.moveUci)
    const insertionIndex = index ?? parent.childIds.length
    assertInsertionIndex(insertionIndex, parent.childIds.length)

    // Copy every caller-owned collection before making any observable change.
    const comments = copyStrings(input.comments, 'Comments')
    const startingComments = copyStrings(
      input.startingComments,
      'Starting comments',
    )
    const nags = copyNags(input.nags)

    this.transact(() => {
      this.#touchNodeStructure(nodeId)
      this.#touchChildIds(parent)
      if (comments.length !== 0) {
        this.#touchComments(nodeId, [])
      }
      if (startingComments.length !== 0) {
        this.#touchStartingComments(nodeId, [])
      }
      if (nags.length !== 0) {
        this.#touchNags(nodeId, [])
      }
      this.#nodes.set(nodeId, {
        nodeId,
        parentId,
        moveUci,
        childIds: [],
        removed: false,
        comments,
        startingComments,
        nags,
      })
      parent.childIds.splice(insertionIndex, 0, nodeId)
    })
  }

  removeChild(parentId: GameNodeId, nodeId: GameNodeId): boolean {
    const parent = this.#requireNode(parentId)
    const node = this.#requireChildForParent(parentId, nodeId)
    if (node.removed) {
      return false
    }
    const index = parent.childIds.indexOf(nodeId)
    if (index === -1) {
      throw new Error(`Live game node ${nodeId} is not attached to ${parentId}`)
    }

    this.transact(() => {
      this.#touchChildIds(parent)
      parent.childIds.splice(index, 1)
      this.#tombstoneSubtree(node)
    })
    return true
  }

  moveChild(
    parentId: GameNodeId,
    nodeId: GameNodeId,
    index: number,
  ): void {
    const parent = this.#requireNode(parentId)
    if (parent.removed) {
      throw new Error(`Removed game node ${parentId} cannot be reordered`)
    }
    const node = this.#requireChildForParent(parentId, nodeId)
    if (node.removed) {
      throw new Error(`Removed game node ${nodeId} cannot be reordered`)
    }
    const currentIndex = parent.childIds.indexOf(nodeId)
    if (currentIndex === -1) {
      throw new Error(`Game node ${nodeId} is not attached to ${parentId}`)
    }
    assertExistingIndex(index, parent.childIds.length)
    if (currentIndex === index) {
      return
    }

    this.transact(() => {
      this.#touchChildIds(parent)
      parent.childIds.splice(currentIndex, 1)
      parent.childIds.splice(index, 0, nodeId)
    })
  }

  getComments(nodeId: GameNodeId): readonly string[] {
    return freezeArray(this.#requireNode(nodeId).comments)
  }

  setComments(nodeId: GameNodeId, comments: readonly string[]): void {
    const node = this.#requireNode(nodeId)
    const copy = copyStrings(comments, 'Comments')
    if (equalArrays(node.comments, copy)) {
      return
    }
    this.transact(() => {
      this.#touchComments(nodeId, node.comments)
      node.comments = copy
    })
  }

  insertComment(nodeId: GameNodeId, index: number, comment: string): void {
    const node = this.#requireNode(nodeId)
    const [copy] = copyStrings([comment], 'Comments')
    assertInsertionIndex(index, node.comments.length)
    this.transact(() => {
      this.#touchComments(nodeId, node.comments)
      node.comments.splice(index, 0, copy)
    })
  }

  editComment(nodeId: GameNodeId, index: number, comment: string): void {
    const node = this.#requireNode(nodeId)
    const [copy] = copyStrings([comment], 'Comments')
    assertExistingIndex(index, node.comments.length)
    if (node.comments[index] === copy) {
      return
    }
    this.transact(() => {
      this.#touchComments(nodeId, node.comments)
      node.comments[index] = copy
    })
  }

  removeComment(nodeId: GameNodeId, index: number): string {
    const node = this.#requireNode(nodeId)
    assertExistingIndex(index, node.comments.length)
    let removed = ''
    this.transact(() => {
      this.#touchComments(nodeId, node.comments)
      ;[removed] = node.comments.splice(index, 1)
    })
    return removed
  }

  getStartingComments(nodeId: GameNodeId): readonly string[] {
    return freezeArray(this.#requireNode(nodeId).startingComments)
  }

  setStartingComments(
    nodeId: GameNodeId,
    startingComments: readonly string[],
  ): void {
    const node = this.#requireNode(nodeId)
    const copy = copyStrings(startingComments, 'Starting comments')
    if (equalArrays(node.startingComments, copy)) {
      return
    }
    this.transact(() => {
      this.#touchStartingComments(nodeId, node.startingComments)
      node.startingComments = copy
    })
  }

  insertStartingComment(
    nodeId: GameNodeId,
    index: number,
    comment: string,
  ): void {
    const node = this.#requireNode(nodeId)
    const [copy] = copyStrings([comment], 'Starting comments')
    assertInsertionIndex(index, node.startingComments.length)
    this.transact(() => {
      this.#touchStartingComments(nodeId, node.startingComments)
      node.startingComments.splice(index, 0, copy)
    })
  }

  editStartingComment(
    nodeId: GameNodeId,
    index: number,
    comment: string,
  ): void {
    const node = this.#requireNode(nodeId)
    const [copy] = copyStrings([comment], 'Starting comments')
    assertExistingIndex(index, node.startingComments.length)
    if (node.startingComments[index] === copy) {
      return
    }
    this.transact(() => {
      this.#touchStartingComments(nodeId, node.startingComments)
      node.startingComments[index] = copy
    })
  }

  removeStartingComment(nodeId: GameNodeId, index: number): string {
    const node = this.#requireNode(nodeId)
    assertExistingIndex(index, node.startingComments.length)
    let removed = ''
    this.transact(() => {
      this.#touchStartingComments(nodeId, node.startingComments)
      ;[removed] = node.startingComments.splice(index, 1)
    })
    return removed
  }

  getNags(nodeId: GameNodeId): readonly number[] {
    return freezeArray(this.#requireNode(nodeId).nags)
  }

  setNags(nodeId: GameNodeId, nags: Iterable<number>): void {
    const node = this.#requireNode(nodeId)
    const copy = copyNags(nags)
    if (equalArrays(node.nags, copy)) {
      return
    }
    this.transact(() => {
      this.#touchNags(nodeId, node.nags)
      node.nags = copy
    })
  }

  addNag(nodeId: GameNodeId, nag: number): boolean {
    const node = this.#requireNode(nodeId)
    const [parsedNag] = copyNags([nag])
    if (node.nags.includes(parsedNag)) {
      return false
    }
    this.transact(() => {
      this.#touchNags(nodeId, node.nags)
      node.nags.push(parsedNag)
      node.nags.sort((left, right) => left - right)
    })
    return true
  }

  removeNag(nodeId: GameNodeId, nag: number): boolean {
    const node = this.#requireNode(nodeId)
    const [parsedNag] = copyNags([nag])
    const index = node.nags.indexOf(parsedNag)
    if (index === -1) {
      return false
    }
    this.transact(() => {
      this.#touchNags(nodeId, node.nags)
      node.nags.splice(index, 1)
    })
    return true
  }

  clearNags(nodeId: GameNodeId): void {
    const node = this.#requireNode(nodeId)
    if (node.nags.length === 0) {
      return
    }
    this.transact(() => {
      this.#touchNags(nodeId, node.nags)
      node.nags = []
    })
  }

  getHeader(name: string): string | undefined {
    assertHeaderName(name)
    return this.#headers.get(name)
  }

  setHeader(name: string, value: string): void {
    assertHeaderName(name)
    assertHeaderValue(value)
    if (this.#headers.get(name) === value && this.#headers.has(name)) {
      return
    }
    this.transact(() => {
      this.#touchHeaders()
      this.#headers.set(name, value)
    })
  }

  deleteHeader(name: string): boolean {
    assertHeaderName(name)
    if (!this.#headers.has(name)) {
      return false
    }
    this.transact(() => {
      this.#touchHeaders()
      this.#headers.delete(name)
    })
    return true
  }

  getHeaderEntries(): readonly (readonly [string, string])[] {
    const entries = [...this.#headers.entries()].map(([name, value]) =>
      Object.freeze([name, value] as const),
    )
    return Object.freeze(entries)
  }

  #requireNode(nodeId: GameNodeId): MemoryNodeRecord {
    nodeId = parseGameNodeId(nodeId)
    const node = this.#nodes.get(nodeId)
    if (!node) {
      throw new Error(`Unknown game node ID: ${nodeId}`)
    }
    return node
  }

  #requireChildForParent(
    parentId: GameNodeId,
    nodeId: GameNodeId,
  ): MemoryNodeRecord {
    if (nodeId === this.rootId) {
      throw new Error('The root node cannot be attached, removed, or moved')
    }
    const node = this.#requireNode(nodeId)
    if (node.parentId !== parentId) {
      throw new Error(
        `Game node ${nodeId} belongs to ${node.parentId}, not ${parentId}`,
      )
    }
    return node
  }

  #tombstoneSubtree(root: MemoryNodeRecord): void {
    const stack = [root]
    while (stack.length !== 0) {
      const node = stack.pop() as MemoryNodeRecord
      if (!node.removed) {
        this.#touchNodeStructure(node.nodeId)
        node.removed = true
      }
      for (const childId of node.childIds) {
        stack.push(this.#requireNode(childId))
      }
    }
  }

  #touchNodeStructure(nodeId: GameNodeId): void {
    const pending = this.#requirePendingBeforeValues()
    if (pending.nodeStructures.has(nodeId)) {
      return
    }
    const node = this.#nodes.get(nodeId)
    pending.nodeStructures.set(
      nodeId,
      node
        ? {
            parentId: node.parentId,
            moveUci: node.moveUci,
            removed: node.removed,
          }
        : null,
    )
  }

  #touchChildIds(node: MemoryNodeRecord): void {
    const pending = this.#requirePendingBeforeValues()
    if (!pending.childIds.has(node.nodeId)) {
      pending.childIds.set(node.nodeId, [...node.childIds])
    }
  }

  #touchComments(nodeId: GameNodeId, comments: readonly string[]): void {
    const pending = this.#requirePendingBeforeValues()
    if (!pending.comments.has(nodeId)) {
      pending.comments.set(nodeId, [...comments])
    }
  }

  #touchStartingComments(
    nodeId: GameNodeId,
    comments: readonly string[],
  ): void {
    const pending = this.#requirePendingBeforeValues()
    if (!pending.startingComments.has(nodeId)) {
      pending.startingComments.set(nodeId, [...comments])
    }
  }

  #touchNags(nodeId: GameNodeId, nags: readonly number[]): void {
    const pending = this.#requirePendingBeforeValues()
    if (!pending.nags.has(nodeId)) {
      pending.nags.set(nodeId, [...nags])
    }
  }

  #touchHeaders(): void {
    const pending = this.#requirePendingBeforeValues()
    if (pending.headers === null) {
      pending.headers = [...this.#headers.entries()]
    }
  }

  #requirePendingBeforeValues(): PendingBeforeValues {
    if (!this.#pendingBeforeValues || this.#transactionDepth === 0) {
      throw new Error('Game document mutation escaped its transaction')
    }
    return this.#pendingBeforeValues
  }

  #deriveChanges(pending: PendingBeforeValues): DerivedChanges {
    const changes: DerivedChanges = {
      categories: new Set<GameDocumentChangeCategory>(),
      nodeIds: new Set<GameNodeId>(),
      headerNames: new Set<string>(),
    }

    for (const [nodeId, before] of pending.nodeStructures) {
      const node = this.#nodes.get(nodeId)
      const changed =
        before === null
          ? node !== undefined
          : node === undefined ||
            node.parentId !== before.parentId ||
            node.moveUci !== before.moveUci ||
            node.removed !== before.removed
      if (changed) {
        changes.categories.add('structure')
        changes.nodeIds.add(nodeId)
      }
    }

    for (const [nodeId, before] of pending.childIds) {
      const node = this.#nodes.get(nodeId)
      if (!node || !equalArrays(before, node.childIds)) {
        changes.categories.add('structure')
        changes.nodeIds.add(nodeId)
      }
    }

    for (const [nodeId, before] of pending.comments) {
      const node = this.#nodes.get(nodeId)
      if (!node || !equalArrays(before, node.comments)) {
        changes.categories.add('comments')
        changes.nodeIds.add(nodeId)
      }
    }

    for (const [nodeId, before] of pending.startingComments) {
      const node = this.#nodes.get(nodeId)
      if (!node || !equalArrays(before, node.startingComments)) {
        changes.categories.add('starting-comments')
        changes.nodeIds.add(nodeId)
      }
    }

    for (const [nodeId, before] of pending.nags) {
      const node = this.#nodes.get(nodeId)
      if (!node || !equalArrays(before, node.nags)) {
        changes.categories.add('nags')
        changes.nodeIds.add(nodeId)
      }
    }

    if (pending.headers !== null) {
      const beforeValues = new Map(pending.headers)
      const afterEntries = [...this.#headers.entries()]
      const afterValues = new Map(afterEntries)
      const names = new Set([...beforeValues.keys(), ...afterValues.keys()])
      for (const name of names) {
        if (
          beforeValues.has(name) !== afterValues.has(name) ||
          beforeValues.get(name) !== afterValues.get(name)
        ) {
          changes.headerNames.add(name)
        }
      }

      const beforeOrder = pending.headers.map(([name]) => name)
      const afterOrder = afterEntries.map(([name]) => name)
      if (!equalArrays(beforeOrder, afterOrder)) {
        changes.categories.add('headers')
        // If values and membership are unchanged, identify the headers whose
        // canonical insertion positions moved.
        if (changes.headerNames.size === 0) {
          const beforeIndexes = new Map(
            beforeOrder.map((name, index) => [name, index] as const),
          )
          const afterIndexes = new Map(
            afterOrder.map((name, index) => [name, index] as const),
          )
          for (const name of names) {
            if (beforeIndexes.get(name) !== afterIndexes.get(name)) {
              changes.headerNames.add(name)
            }
          }
        }
      }
      if (changes.headerNames.size !== 0) {
        changes.categories.add('headers')
      }
    }

    return changes
  }

  #flushChanges(): readonly unknown[] {
    const pending = this.#pendingBeforeValues
    const origin = this.#transactionOrigin
    this.#pendingBeforeValues = null
    this.#transactionOrigin = undefined

    if (!pending) {
      return []
    }
    const changes = this.#deriveChanges(pending)
    if (changes.categories.size === 0) {
      return []
    }

    this.#revision += 1
    const categories = Object.freeze(
      CHANGE_CATEGORY_ORDER.filter((category) =>
        changes.categories.has(category),
      ),
    )
    const changedNodeIds = Object.freeze(
      [...changes.nodeIds].sort(compareStrings),
    )
    const changedHeaderNames = Object.freeze(
      [...changes.headerNames].sort(compareStrings),
    )
    const event: GameDocumentChangeEvent = Object.freeze({
      revision: this.#revision,
      origin,
      categories,
      changedNodeIds,
      changedHeaderNames,
    })

    this.#eventQueue.push(event)
    if (this.#isDispatchingEvents) {
      return []
    }

    const listenerFailures: unknown[] = []
    this.#isDispatchingEvents = true
    let nextEventIndex = 0
    try {
      while (nextEventIndex < this.#eventQueue.length) {
        const queuedEvent = this.#eventQueue[
          nextEventIndex
        ] as GameDocumentChangeEvent
        nextEventIndex += 1
        // Snapshot iteration makes subscribe/unsubscribe during delivery
        // precise: it takes effect for the next event, not midway through this
        // one. Reentrant mutations append newer revisions to the queue, so all
        // listeners finish this event before any listener sees the next one.
        for (const listener of [...this.#listeners]) {
          try {
            listener(queuedEvent)
          } catch (error) {
            listenerFailures.push(error)
          }
        }
      }
    } finally {
      this.#eventQueue.splice(0, nextEventIndex)
      this.#isDispatchingEvents = false
    }

    return listenerFailures
  }
}
