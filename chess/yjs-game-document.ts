import * as Y from 'yjs'

import {
  type GameDocument,
  type GameDocumentAddNodeInput,
  type GameDocumentAddNodeOptions,
  type GameDocumentChangeCategory,
  type GameDocumentChangeEvent,
  type GameDocumentChangeListener,
  type GameDocumentTransactionCallback,
  type GameDocumentTransactionOptions,
  type MemoryGameDocumentOptions,
} from './game-document'
import {
  parseGameMoveUci,
  parsePgnHeaderName,
  parsePgnHeaderValue,
} from './game-document-values'
import { parseGameNodeId, type GameNodeId } from './game-node-id'

export const YJS_GAME_DOCUMENT_SCHEMA_VERSION = 1 as const

const ROOT_TYPE_NAME = 'chess.ts/game-document'
const LOCAL_ORIGIN = Object.freeze({ kind: 'chess.ts/yjs-game-document' })
const CANDIDATE_ORIGIN = Object.freeze({
  kind: 'chess.ts/yjs-game-document-candidate',
})

const yjsOrigin = (origin: unknown): unknown =>
  origin === undefined ? LOCAL_ORIGIN : origin

const CHANGE_CATEGORY_ORDER: readonly GameDocumentChangeCategory[] = [
  'structure',
  'comments',
  'starting-comments',
  'nags',
  'headers',
]

const ROOT_KEYS = new Set([
  'schemaVersion',
  'rootId',
  'nodes',
  'headers',
  'tombstones',
])
const NODE_KEYS = new Set([
  'parentId',
  'moveUci',
  'childPlacements',
  'comments',
  'startingComments',
  'nags',
])
const COMMENT_KEYS = new Set(['text'])
const HEADER_KEYS = new Set(['name', 'value'])

export interface YjsGameDocumentOptions extends MemoryGameDocumentOptions {}

export interface YjsGameDocumentUpdateBoundaryOptions {
  /** Maximum accepted encoded update size at this trust boundary. */
  readonly maxBytes: number
}

export interface YjsGameDocumentApplyOptions extends YjsGameDocumentUpdateBoundaryOptions {
  /** Forwarded to the live Yjs transaction and public notifications. */
  readonly origin?: unknown
}

export interface YjsGameDocumentUpdateEvent {
  /** A defensive copy of the incremental Yjs update. */
  readonly update: Uint8Array
  /** The exact public transaction origin, or `undefined` for the default. */
  readonly origin: unknown
}

export type YjsGameDocumentUpdateListener = (
  event: YjsGameDocumentUpdateEvent,
) => void

/** An update was well-formed binary data but depends on unavailable structs. */
export class YjsGameDocumentDependencyError extends Error {
  constructor() {
    super('Yjs update has unresolved struct dependencies')
    this.name = 'YjsGameDocumentDependencyError'
  }
}

interface ParsedNode {
  readonly nodeId: GameNodeId
  readonly parentId: GameNodeId | null
  readonly moveUci: string | null
  readonly map: Y.Map<unknown>
  readonly childPlacements: Y.Array<string>
  readonly comments: Y.Array<Y.Map<unknown>>
  readonly startingComments: Y.Array<Y.Map<unknown>>
  readonly nags: Y.Map<boolean>
}

interface ParsedHeader {
  readonly name: string
  readonly value: string
  readonly map: Y.Map<unknown>
  readonly rawIndex: number
}

interface ParsedDocument {
  readonly root: Y.Map<unknown>
  readonly rootId: GameNodeId
  readonly nodesType: Y.Map<Y.Map<unknown>>
  readonly nodes: ReadonlyMap<GameNodeId, ParsedNode>
  readonly headersType: Y.Array<Y.Map<unknown>>
  readonly headers: readonly ParsedHeader[]
  readonly tombstonesType: Y.Map<boolean>
  /** Raw, explicitly synchronized delete-wins branch-root tombstones. */
  readonly tombstones: ReadonlySet<GameNodeId>
  /** Raw tombstones plus every transitively removed descendant. */
  readonly removed: ReadonlySet<GameNodeId>
}

interface SemanticNodeSnapshot {
  readonly parentId: GameNodeId | null
  readonly moveUci: string | null
  readonly childIds: readonly GameNodeId[]
  readonly comments: readonly string[]
  readonly startingComments: readonly string[]
  readonly nags: readonly number[]
  readonly removed: boolean
}

interface SemanticSnapshot {
  readonly nodes: ReadonlyMap<GameNodeId, SemanticNodeSnapshot>
  readonly headers: readonly (readonly [string, string])[]
}

interface PendingSemanticChanges {
  readonly categories: Set<GameDocumentChangeCategory>
  readonly nodeIds: Set<GameNodeId>
  readonly headerNames: Set<string>
}

interface PendingUpdate {
  readonly update: Uint8Array
  readonly origin: unknown
}

type QueuedNotification =
  | {
      readonly kind: 'change'
      readonly event: GameDocumentChangeEvent
    }
  | {
      readonly kind: 'update'
      readonly event: PendingUpdate
    }

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const freezeArray = <T>(values: readonly T[]): readonly T[] =>
  Object.freeze([...values])

const equalArrays = <T>(left: readonly T[], right: readonly T[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

const assertUint8Array = (value: unknown, description: string): Uint8Array => {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${description} must be a Uint8Array`)
  }
  return value
}

const parseMaxBytes = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError('maxBytes must be a positive safe integer')
  }
  return value as number
}

const parseBoundedUpdate = (update: unknown, maxBytes: unknown): Uint8Array => {
  const parsed = assertUint8Array(update, 'Yjs game document update')
  const parsedMaxBytes = parseMaxBytes(maxBytes)
  if (parsed.byteLength > parsedMaxBytes) {
    throw new RangeError(
      `Yjs game document update exceeds maxBytes (${parsed.byteLength} > ${parsedMaxBytes})`,
    )
  }
  return parsed
}

const parseStringArray = (
  values: readonly unknown[],
  description: string,
): string[] => {
  const parsed: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') {
      throw new TypeError(`${description} must contain only strings`)
    }
    parsed.push(value)
  }
  return parsed
}

const parseNags = (values: Iterable<number>): number[] => {
  const parsed = new Set<number>()
  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError('NAGs must be safe integers')
    }
    parsed.add(value)
  }
  return [...parsed].sort((left, right) => left - right)
}

const parseNagKey = (key: string): number => {
  const value = Number(key)
  if (!Number.isSafeInteger(value) || String(value) !== key) {
    throw new TypeError(`Invalid NAG key: ${key}`)
  }
  return value
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

const assertKnownKeys = (
  map: Y.Map<unknown>,
  expected: ReadonlySet<string>,
  description: string,
): void => {
  for (const key of map.keys()) {
    if (!expected.has(key)) {
      throw new TypeError(`${description} contains unknown field ${key}`)
    }
  }
}

const requireMapValue = <T>(
  map: Y.Map<unknown>,
  key: string,
  constructor: new () => Y.Map<T>,
  description: string,
): Y.Map<T> => {
  const value = map.get(key)
  if (!(value instanceof constructor)) {
    throw new TypeError(`${description} must be a Y.Map`)
  }
  return value
}

const requireArrayValue = <T>(
  map: Y.Map<unknown>,
  key: string,
  constructor: new () => Y.Array<T>,
  description: string,
): Y.Array<T> => {
  const value = map.get(key)
  if (!(value instanceof constructor)) {
    throw new TypeError(`${description} must be a Y.Array`)
  }
  return value
}

const makeCommentMap = (text: string): Y.Map<unknown> => {
  const map = new Y.Map<unknown>()
  map.set('text', text)
  return map
}

const makeCommentArray = (
  comments: readonly string[],
): Y.Array<Y.Map<unknown>> => {
  const array = new Y.Array<Y.Map<unknown>>()
  if (comments.length !== 0) {
    array.insert(0, comments.map(makeCommentMap))
  }
  return array
}

const makeNagsMap = (nags: readonly number[]): Y.Map<boolean> => {
  const map = new Y.Map<boolean>()
  for (const nag of nags) {
    map.set(String(nag), true)
  }
  return map
}

const makeNodeMap = (
  parentId: GameNodeId | null,
  moveUci: string | null,
  comments: readonly string[],
  startingComments: readonly string[],
  nags: readonly number[],
): Y.Map<unknown> => {
  const node = new Y.Map<unknown>()
  node.set('parentId', parentId)
  node.set('moveUci', moveUci)
  node.set('childPlacements', new Y.Array<string>())
  node.set('comments', makeCommentArray(comments))
  node.set('startingComments', makeCommentArray(startingComments))
  node.set('nags', makeNagsMap(nags))
  return node
}

const parsedNodeFromTrustedLocalMap = (
  nodeId: GameNodeId,
  parentId: GameNodeId | null,
  moveUci: string | null,
  map: Y.Map<unknown>,
): ParsedNode => ({
  nodeId,
  parentId,
  moveUci,
  map,
  childPlacements: map.get('childPlacements') as Y.Array<string>,
  comments: map.get('comments') as Y.Array<Y.Map<unknown>>,
  startingComments: map.get('startingComments') as Y.Array<Y.Map<unknown>>,
  nags: map.get('nags') as Y.Map<boolean>,
})

const makeHeaderMap = (name: string, value: string): Y.Map<unknown> => {
  const map = new Y.Map<unknown>()
  map.set('name', name)
  map.set('value', value)
  return map
}

const canonicalLastOccurrences = <T, Key>(
  values: readonly T[],
  keyOf: (value: T) => Key,
): readonly { readonly value: T; readonly rawIndex: number }[] => {
  const lastIndexes = new Map<Key, number>()
  values.forEach((value, index) => {
    lastIndexes.set(keyOf(value), index)
  })
  const result: { value: T; rawIndex: number }[] = []
  values.forEach((value, index) => {
    if (lastIndexes.get(keyOf(value)) === index) {
      result.push({ value, rawIndex: index })
    }
  })
  return result
}

const parseCommentArray = (
  array: Y.Array<Y.Map<unknown>>,
  description: string,
): string[] =>
  array.toArray().map((entry, index) => {
    if (!(entry instanceof Y.Map)) {
      throw new TypeError(`${description}[${index}] must be a Y.Map`)
    }
    assertKnownKeys(entry, COMMENT_KEYS, `${description}[${index}]`)
    const text = entry.get('text')
    if (typeof text !== 'string') {
      throw new TypeError(`${description}[${index}].text must be a string`)
    }
    return text
  })

const parseHeaders = (
  headersType: Y.Array<Y.Map<unknown>>,
): readonly ParsedHeader[] => {
  const raw = headersType.toArray().map((entry, rawIndex) => {
    if (!(entry instanceof Y.Map)) {
      throw new TypeError(`Header entry ${rawIndex} must be a Y.Map`)
    }
    assertKnownKeys(entry, HEADER_KEYS, `Header entry ${rawIndex}`)
    const name = parsePgnHeaderName(entry.get('name'))
    const value = parsePgnHeaderValue(entry.get('value'))
    return { name, value, map: entry, rawIndex }
  })
  return canonicalLastOccurrences(raw, entry => entry.name).map(
    ({ value }) => value,
  )
}

const assertResolvedUpdate = (document: Y.Doc): void => {
  // These fields are part of the pinned Yjs 13.6.31 StructStore contract. A
  // non-null value means the update referenced structs or delete ranges that
  // were not present, so accepting it would defer validation until later.
  if (
    document.store.pendingStructs !== null ||
    document.store.pendingDs !== null
  ) {
    throw new YjsGameDocumentDependencyError()
  }
}

const createEmptyYDocument = (): Y.Doc => {
  const document = new Y.Doc({ gc: false })
  // Top-level Yjs shared-type constructors are selected by the consumer and
  // are not encoded in an update. Pin this namespace to Y.Map before applying
  // any untrusted bytes.
  document.getMap<unknown>(ROOT_TYPE_NAME)
  return document
}

const getRootMap = (document: Y.Doc): Y.Map<unknown> => {
  const shared = document.share.get(ROOT_TYPE_NAME)
  if (!(shared instanceof Y.Map)) {
    throw new TypeError(
      `Yjs update must contain the ${ROOT_TYPE_NAME} root Y.Map`,
    )
  }
  return shared as Y.Map<unknown>
}

const assertSingleRootedAcyclicAncestry = (
  nodes: ReadonlyMap<GameNodeId, ParsedNode>,
  rootId: GameNodeId,
): void => {
  // Parent pointers form a functional graph. Three-color iteration validates
  // each edge at most once without recursion or restarting at every node.
  const states = new Map<GameNodeId, 'visiting' | 'complete'>()
  for (const start of nodes.values()) {
    if (states.get(start.nodeId) === 'complete') {
      continue
    }
    const path: ParsedNode[] = []
    let cursor = start
    while (states.get(cursor.nodeId) !== 'complete') {
      if (states.get(cursor.nodeId) === 'visiting') {
        throw new Error(
          `Game document contains a node cycle at ${cursor.nodeId}`,
        )
      }
      states.set(cursor.nodeId, 'visiting')
      path.push(cursor)
      if (cursor.parentId === null) {
        if (cursor.nodeId !== rootId) {
          throw new Error(
            `Game node ${start.nodeId} does not descend from root ${rootId}`,
          )
        }
        break
      }
      cursor = nodes.get(cursor.parentId) as ParsedNode
    }
    for (const node of path) {
      states.set(node.nodeId, 'complete')
    }
  }
}

const deriveEffectiveTombstones = (
  nodes: ReadonlyMap<GameNodeId, ParsedNode>,
  rootId: GameNodeId,
  tombstones: ReadonlySet<GameNodeId>,
): ReadonlySet<GameNodeId> => {
  const children = new Map<GameNodeId, GameNodeId[]>()
  for (const node of nodes.values()) {
    if (node.parentId !== null) {
      const siblings = children.get(node.parentId) ?? []
      siblings.push(node.nodeId)
      children.set(node.parentId, siblings)
    }
  }

  const removed = new Set<GameNodeId>()
  const stack: readonly [GameNodeId, boolean][] = [[rootId, false]]
  const work = [...stack]
  while (work.length !== 0) {
    const [nodeId, ancestorRemoved] = work.pop() as [GameNodeId, boolean]
    const nodeRemoved = ancestorRemoved || tombstones.has(nodeId)
    if (nodeRemoved) {
      removed.add(nodeId)
    }
    for (const childId of children.get(nodeId) ?? []) {
      work.push([childId, nodeRemoved])
    }
  }
  return removed
}

const parseDocument = (document: Y.Doc): ParsedDocument => {
  assertResolvedUpdate(document)
  for (const name of document.share.keys()) {
    if (name !== ROOT_TYPE_NAME) {
      throw new TypeError(`Unknown top-level Yjs shared type: ${name}`)
    }
  }
  const root = getRootMap(document)
  assertKnownKeys(root, ROOT_KEYS, 'Game document root')

  if (root.get('schemaVersion') !== YJS_GAME_DOCUMENT_SCHEMA_VERSION) {
    throw new TypeError(
      `Unsupported Yjs game document schema version: ${String(root.get('schemaVersion'))}`,
    )
  }
  const rootId = parseGameNodeId(root.get('rootId'))
  const nodesType = requireMapValue(
    root,
    'nodes',
    Y.Map,
    'Game document nodes',
  ) as Y.Map<Y.Map<unknown>>
  const headersType = requireArrayValue(
    root,
    'headers',
    Y.Array,
    'Game document headers',
  ) as Y.Array<Y.Map<unknown>>
  const tombstonesType = requireMapValue(
    root,
    'tombstones',
    Y.Map,
    'Game document tombstones',
  ) as Y.Map<boolean>

  const nodes = new Map<GameNodeId, ParsedNode>()
  for (const [rawNodeId, rawNode] of nodesType.entries()) {
    const nodeId = parseGameNodeId(rawNodeId)
    if (!(rawNode instanceof Y.Map)) {
      throw new TypeError(`Game node ${nodeId} must be a Y.Map`)
    }
    assertKnownKeys(rawNode, NODE_KEYS, `Game node ${nodeId}`)

    const rawParentId = rawNode.get('parentId')
    const rawMoveUci = rawNode.get('moveUci')
    const parentId = rawParentId === null ? null : parseGameNodeId(rawParentId)
    const moveUci = rawMoveUci === null ? null : parseGameMoveUci(rawMoveUci)
    const childPlacements = requireArrayValue(
      rawNode,
      'childPlacements',
      Y.Array,
      `Game node ${nodeId} childPlacements`,
    ) as Y.Array<string>
    const comments = requireArrayValue(
      rawNode,
      'comments',
      Y.Array,
      `Game node ${nodeId} comments`,
    ) as Y.Array<Y.Map<unknown>>
    const startingComments = requireArrayValue(
      rawNode,
      'startingComments',
      Y.Array,
      `Game node ${nodeId} startingComments`,
    ) as Y.Array<Y.Map<unknown>>
    const nags = requireMapValue(
      rawNode,
      'nags',
      Y.Map,
      `Game node ${nodeId} nags`,
    ) as Y.Map<boolean>

    for (const childId of childPlacements.toArray()) {
      parseGameNodeId(childId)
    }
    parseCommentArray(comments, `Game node ${nodeId} comments`)
    parseCommentArray(startingComments, `Game node ${nodeId} startingComments`)
    for (const [key, value] of nags.entries()) {
      parseNagKey(key)
      if (value !== true) {
        throw new TypeError(`Game node ${nodeId} NAG ${key} must equal true`)
      }
    }

    nodes.set(nodeId, {
      nodeId,
      parentId,
      moveUci,
      map: rawNode,
      childPlacements,
      comments,
      startingComments,
      nags,
    })
  }

  const rootNode = nodes.get(rootId)
  if (!rootNode) {
    throw new Error(`Game document is missing root node ${rootId}`)
  }
  if (rootNode.parentId !== null || rootNode.moveUci !== null) {
    throw new Error('The root node must have null parentId and moveUci')
  }

  for (const node of nodes.values()) {
    if (node.nodeId === rootId) {
      continue
    }
    if (node.parentId === null || node.moveUci === null) {
      throw new Error(
        `Non-root game node ${node.nodeId} must have parentId and moveUci`,
      )
    }
    if (!nodes.has(node.parentId)) {
      throw new Error(
        `Game node ${node.nodeId} has unknown parent ${node.parentId}`,
      )
    }
  }

  assertSingleRootedAcyclicAncestry(nodes, rootId)

  for (const parent of nodes.values()) {
    for (const childId of parent.childPlacements.toArray()) {
      const child = nodes.get(parseGameNodeId(childId))
      if (!child) {
        throw new Error(
          `Game node ${parent.nodeId} places unknown child ${childId}`,
        )
      }
      if (child.parentId !== parent.nodeId) {
        throw new Error(
          `Game node ${parent.nodeId} places ${child.nodeId}, whose parent is ${String(child.parentId)}`,
        )
      }
    }
  }

  const tombstones = new Set<GameNodeId>()
  for (const [rawNodeId, value] of tombstonesType.entries()) {
    const nodeId = parseGameNodeId(rawNodeId)
    if (!nodes.has(nodeId)) {
      throw new Error(`Tombstone references unknown game node ${nodeId}`)
    }
    if (value !== true) {
      throw new TypeError(`Game node ${nodeId} tombstone must equal true`)
    }
    tombstones.add(nodeId)
  }
  if (tombstones.has(rootId)) {
    throw new Error('The root game node cannot be tombstoned')
  }
  const removed = deriveEffectiveTombstones(nodes, rootId, tombstones)

  return {
    root,
    rootId,
    nodesType,
    nodes,
    headersType,
    headers: parseHeaders(headersType),
    tombstonesType,
    tombstones,
    removed,
  }
}

interface YjsItemIdentity {
  readonly client: number
  readonly clock: number
}

const integratedTypeIdentity = (
  type: Y.AbstractType<any>,
  description: string,
): YjsItemIdentity => {
  const item = type._item
  if (item === null) {
    throw new Error(`${description} is not an integrated nested Yjs type`)
  }
  return item.id
}

const mapFieldIdentity = (
  map: Y.Map<unknown>,
  key: string,
  description: string,
): YjsItemIdentity => {
  // Pinned Yjs 13.6.31 compatibility seam: Y.Map's winning field Item and a
  // nested shared type's _item preserve the originating (client, clock) ID
  // when encoded into a candidate clone. Semantic equality is insufficient
  // here: replacing a container would orphan concurrent history.
  const item = map._map.get(key)
  if (!item || item.deleted) {
    throw new Error(`${description} has no live Yjs field item`)
  }
  return item.id
}

const equalYjsItemIdentity = (
  left: YjsItemIdentity,
  right: YjsItemIdentity,
): boolean => left.client === right.client && left.clock === right.clock

const assertSameYjsItemIdentity = (
  prior: YjsItemIdentity,
  candidate: YjsItemIdentity,
  description: string,
): void => {
  if (!equalYjsItemIdentity(prior, candidate)) {
    throw new Error(`A Yjs update cannot replace write-once ${description}`)
  }
}

const assertSameIntegratedType = (
  prior: Y.AbstractType<any>,
  candidate: Y.AbstractType<any>,
  description: string,
): void => {
  assertSameYjsItemIdentity(
    integratedTypeIdentity(prior, description),
    integratedTypeIdentity(candidate, description),
    description,
  )
}

type YjsHistoryRole =
  | { readonly kind: 'root' }
  | { readonly kind: 'nodes' }
  | { readonly kind: 'headers' }
  | { readonly kind: 'tombstones' }
  | { readonly kind: 'node'; readonly nodeId: GameNodeId }
  | {
      readonly kind: 'child-placements'
      readonly nodeId: GameNodeId
    }
  | {
      readonly kind: 'comments'
      readonly nodeId: GameNodeId
      readonly starting: boolean
    }
  | {
      readonly kind: 'comment'
      readonly nodeId: GameNodeId
      readonly starting: boolean
    }
  | { readonly kind: 'nags'; readonly nodeId: GameNodeId }
  | { readonly kind: 'header' }

const requireHistoryMapItem = (item: Y.Item, description: string): string => {
  if (item.parentSub === null) {
    throw new TypeError(`${description} must be a Y.Map field operation`)
  }
  return item.parentSub
}

const requireHistorySequenceItem = (
  item: Y.Item,
  description: string,
): void => {
  if (item.parentSub !== null) {
    throw new TypeError(`${description} must be a Y.Array sequence operation`)
  }
}

const requireHistoryScalars = (
  item: Y.Item,
  description: string,
): readonly unknown[] => {
  if (!(item.content instanceof Y.ContentAny)) {
    throw new TypeError(`${description} must contain a scalar Yjs value`)
  }
  const values = item.content.getContent()
  if (values.length === 0) {
    throw new TypeError(`${description} must contain at least one value`)
  }
  return values
}

const requireHistoryNestedType = <Type extends Y.AbstractType<any>>(
  item: Y.Item,
  constructor: new (...args: any[]) => Type,
  description: string,
): Type => {
  if (!(item.content instanceof Y.ContentType)) {
    throw new TypeError(`${description} must contain a nested Yjs type`)
  }
  const type = item.content.type
  if (!(type instanceof constructor)) {
    throw new TypeError(`${description} contains the wrong nested Yjs type`)
  }
  const values = item.content.getContent()
  if (values.length !== 1 || values[0] !== type) {
    throw new TypeError(`${description} must contain exactly one nested type`)
  }
  return type
}

const assertWriteOnceHistory = (
  counts: ReadonlyMap<string, number>,
  requiredKeys: ReadonlySet<string>,
  description: string,
): void => {
  for (const key of requiredKeys) {
    const count = counts.get(key) ?? 0
    if (count !== 1) {
      throw new Error(
        `${description} write-once field ${key} must have exactly one historical assignment`,
      )
    }
  }
}

const validateRetainedYjsHistory = (
  document: Y.Doc,
  parsed: ParsedDocument,
): void => {
  // Pinned Yjs 13.6.31 compatibility seam. With gc:false, StructStore keeps
  // deleted Items and their ContentType ancestry. Walking that retained graph
  // prevents final-state parsing from accepting insert-then-delete junk,
  // hidden replacement containers, or losing duplicate node definitions.
  const itemsByParent = new Map<Y.AbstractType<any>, Y.Item[]>()
  const allItems: Y.Item[] = []
  for (const structs of document.store.clients.values()) {
    for (const struct of structs) {
      if (struct instanceof Y.GC) {
        throw new Error(
          'Yjs game documents cannot contain garbage-collected structs',
        )
      }
      if (!(struct instanceof Y.Item)) {
        throw new Error('Yjs game document contains an unclassified struct')
      }
      if (!(struct.parent instanceof Y.AbstractType)) {
        throw new Error('Yjs game document Item has an unresolved parent type')
      }
      const parent = struct.parent as Y.AbstractType<any>
      const siblings = itemsByParent.get(parent) ?? []
      siblings.push(struct)
      itemsByParent.set(parent, siblings)
      allItems.push(struct)
    }
  }

  const roles = new Map<Y.AbstractType<any>, YjsHistoryRole>()
  const queue: Y.AbstractType<any>[] = []
  const historicallyPlacedNodeIds = new Set<GameNodeId>()
  const historicallyRemovedPlacementNodeIds = new Set<GameNodeId>()
  const register = (type: Y.AbstractType<any>, role: YjsHistoryRole): void => {
    if (roles.has(type)) {
      throw new Error(
        'A nested Yjs type is assigned to more than one schema role',
      )
    }
    roles.set(type, role)
    queue.push(type)
  }
  register(parsed.root, { kind: 'root' })

  let queueIndex = 0
  while (queueIndex < queue.length) {
    const type = queue[queueIndex] as Y.AbstractType<any>
    queueIndex += 1
    const role = roles.get(type) as YjsHistoryRole
    const items = itemsByParent.get(type) ?? []

    if (role.kind === 'root') {
      const counts = new Map<string, number>()
      for (const item of items) {
        const key = requireHistoryMapItem(item, 'Game document root history')
        if (!ROOT_KEYS.has(key)) {
          throw new TypeError(
            `Game document root history contains unknown field ${key}`,
          )
        }
        counts.set(key, (counts.get(key) ?? 0) + 1)
        if (key === 'schemaVersion') {
          const values = requireHistoryScalars(item, 'schemaVersion history')
          counts.set(key, (counts.get(key) as number) + values.length - 1)
          for (const value of values) {
            if (value !== YJS_GAME_DOCUMENT_SCHEMA_VERSION) {
              throw new TypeError('Invalid historical schemaVersion value')
            }
          }
        } else if (key === 'rootId') {
          const values = requireHistoryScalars(item, 'rootId history')
          counts.set(key, (counts.get(key) as number) + values.length - 1)
          for (const value of values) {
            parseGameNodeId(value)
          }
        } else if (key === 'nodes') {
          register(requireHistoryNestedType(item, Y.Map, 'nodes history'), {
            kind: 'nodes',
          })
        } else if (key === 'headers') {
          register(requireHistoryNestedType(item, Y.Array, 'headers history'), {
            kind: 'headers',
          })
        } else {
          register(
            requireHistoryNestedType(item, Y.Map, 'tombstones history'),
            { kind: 'tombstones' },
          )
        }
      }
      assertWriteOnceHistory(counts, ROOT_KEYS, 'Game document root')
    } else if (role.kind === 'nodes') {
      const counts = new Map<GameNodeId, number>()
      for (const item of items) {
        const nodeId = parseGameNodeId(
          requireHistoryMapItem(item, 'Game nodes history'),
        )
        counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1)
        if ((counts.get(nodeId) as number) !== 1) {
          throw new Error(
            `Game node ${nodeId} must have exactly one historical record definition`,
          )
        }
        if (item.deleted) {
          throw new Error(`Game node record ${nodeId} cannot be deleted`)
        }
        register(
          requireHistoryNestedType(item, Y.Map, `game node ${nodeId} history`),
          { kind: 'node', nodeId },
        )
      }
    } else if (role.kind === 'node') {
      const counts = new Map<string, number>()
      for (const item of items) {
        const key = requireHistoryMapItem(
          item,
          `Game node ${role.nodeId} history`,
        )
        if (!NODE_KEYS.has(key)) {
          throw new TypeError(
            `Game node ${role.nodeId} history contains unknown field ${key}`,
          )
        }
        counts.set(key, (counts.get(key) ?? 0) + 1)
        if (key === 'parentId') {
          const values = requireHistoryScalars(
            item,
            `${role.nodeId} parentId history`,
          )
          counts.set(key, (counts.get(key) as number) + values.length - 1)
          for (const value of values) {
            if (value !== null) {
              parseGameNodeId(value)
            }
          }
        } else if (key === 'moveUci') {
          const values = requireHistoryScalars(
            item,
            `${role.nodeId} moveUci history`,
          )
          counts.set(key, (counts.get(key) as number) + values.length - 1)
          for (const value of values) {
            if (value !== null) {
              parseGameMoveUci(value)
            }
          }
        } else if (key === 'childPlacements') {
          register(
            requireHistoryNestedType(
              item,
              Y.Array,
              `${role.nodeId} childPlacements history`,
            ),
            { kind: 'child-placements', nodeId: role.nodeId },
          )
        } else if (key === 'comments' || key === 'startingComments') {
          register(
            requireHistoryNestedType(
              item,
              Y.Array,
              `${role.nodeId} ${key} history`,
            ),
            {
              kind: 'comments',
              nodeId: role.nodeId,
              starting: key === 'startingComments',
            },
          )
        } else {
          register(
            requireHistoryNestedType(
              item,
              Y.Map,
              `${role.nodeId} nags history`,
            ),
            { kind: 'nags', nodeId: role.nodeId },
          )
        }
      }
      assertWriteOnceHistory(counts, NODE_KEYS, `Game node ${role.nodeId}`)
    } else if (role.kind === 'child-placements') {
      for (const item of items) {
        requireHistorySequenceItem(
          item,
          `${role.nodeId} child placements history`,
        )
        if (!(item.content instanceof Y.ContentAny)) {
          throw new TypeError(
            'Child placement history must contain scalar values',
          )
        }
        for (const value of item.content.getContent()) {
          const childId = parseGameNodeId(value)
          const child = parsed.nodes.get(childId)
          if (!child) {
            throw new Error(
              `Child placement history references unknown game node ${childId}`,
            )
          }
          if (child.parentId !== role.nodeId) {
            throw new Error(
              `Child placement history under ${role.nodeId} references ${childId}, whose immutable parent is ${String(child.parentId)}`,
            )
          }
          historicallyPlacedNodeIds.add(childId)
          if (item.deleted) {
            historicallyRemovedPlacementNodeIds.add(childId)
          }
        }
      }
    } else if (role.kind === 'comments') {
      for (const item of items) {
        requireHistorySequenceItem(item, `${role.nodeId} comments history`)
        register(
          requireHistoryNestedType(
            item,
            Y.Map,
            `${role.nodeId} comment history`,
          ),
          {
            kind: 'comment',
            nodeId: role.nodeId,
            starting: role.starting,
          },
        )
      }
    } else if (role.kind === 'comment') {
      let textAssignments = 0
      for (const item of items) {
        const key = requireHistoryMapItem(
          item,
          `${role.nodeId} comment entry history`,
        )
        if (key !== 'text') {
          throw new TypeError(`Comment history contains unknown field ${key}`)
        }
        const values = requireHistoryScalars(item, 'Comment text history')
        textAssignments += values.length
        for (const value of values) {
          if (typeof value !== 'string') {
            throw new TypeError('Comment text history must contain strings')
          }
        }
      }
      if (textAssignments === 0) {
        throw new Error('Comment history must define text')
      }
    } else if (role.kind === 'nags') {
      for (const item of items) {
        parseNagKey(requireHistoryMapItem(item, `${role.nodeId} NAG history`))
        for (const value of requireHistoryScalars(item, 'NAG history')) {
          if (value !== true) {
            throw new TypeError('NAG history values must equal true')
          }
        }
      }
    } else if (role.kind === 'headers') {
      for (const item of items) {
        requireHistorySequenceItem(item, 'Header sequence history')
        register(
          requireHistoryNestedType(item, Y.Map, 'Header entry history'),
          { kind: 'header' },
        )
      }
    } else if (role.kind === 'header') {
      const counts = new Map<string, number>()
      for (const item of items) {
        const key = requireHistoryMapItem(item, 'Header entry history')
        if (!HEADER_KEYS.has(key)) {
          throw new TypeError(`Header history contains unknown field ${key}`)
        }
        counts.set(key, (counts.get(key) ?? 0) + 1)
        const values = requireHistoryScalars(item, `Header ${key} history`)
        counts.set(key, (counts.get(key) as number) + values.length - 1)
        if (key === 'name') {
          for (const value of values) {
            parsePgnHeaderName(value)
          }
        } else {
          for (const value of values) {
            parsePgnHeaderValue(value)
          }
        }
      }
      if ((counts.get('name') ?? 0) !== 1) {
        throw new Error(
          'Header name must have exactly one historical assignment',
        )
      }
      if ((counts.get('value') ?? 0) === 0) {
        throw new Error('Header value history is missing')
      }
    } else {
      for (const item of items) {
        const nodeId = parseGameNodeId(
          requireHistoryMapItem(item, 'Tombstone history'),
        )
        if (!parsed.nodes.has(nodeId)) {
          throw new Error(
            `Tombstone history references unknown game node ${nodeId}`,
          )
        }
        for (const value of requireHistoryScalars(
          item,
          `Tombstone ${nodeId} history`,
        )) {
          if (value !== true) {
            throw new TypeError(`Tombstone ${nodeId} history must equal true`)
          }
        }
        if (!parsed.tombstones.has(nodeId)) {
          throw new Error(`Tombstone ${nodeId} cannot be cleared`)
        }
      }
    }
  }

  for (const node of parsed.nodes.values()) {
    if (
      node.nodeId !== parsed.rootId &&
      !historicallyPlacedNodeIds.has(node.nodeId)
    ) {
      throw new Error(
        `Game node ${node.nodeId} has no historical placement under its immutable parent ${String(node.parentId)}`,
      )
    }
  }
  for (const nodeId of parsed.tombstones) {
    if (!historicallyRemovedPlacementNodeIds.has(nodeId)) {
      throw new Error(
        `Tombstoned game node ${nodeId} has no deleted correct-parent placement history`,
      )
    }
  }

  const classifiedItems = new Set(
    [...roles.keys()].flatMap(type => itemsByParent.get(type) ?? []),
  )
  if (classifiedItems.size !== allItems.length) {
    throw new Error('Yjs game document contains unclassified retained history')
  }
}

const assertImmutableState = (
  prior: ParsedDocument,
  candidate: ParsedDocument,
): void => {
  if (candidate.rootId !== prior.rootId) {
    throw new Error('A Yjs update cannot replace the game document root ID')
  }
  for (const key of ['schemaVersion', 'rootId'] as const) {
    assertSameYjsItemIdentity(
      mapFieldIdentity(prior.root, key, `root ${key}`),
      mapFieldIdentity(candidate.root, key, `root ${key}`),
      `root ${key} field`,
    )
  }
  assertSameIntegratedType(
    prior.nodesType as Y.Map<unknown>,
    candidate.nodesType as Y.Map<unknown>,
    'root nodes map',
  )
  assertSameIntegratedType(
    prior.headersType as Y.Array<unknown>,
    candidate.headersType as Y.Array<unknown>,
    'root headers array',
  )
  assertSameIntegratedType(
    prior.tombstonesType as Y.Map<unknown>,
    candidate.tombstonesType as Y.Map<unknown>,
    'root tombstones map',
  )
  for (const [nodeId, priorNode] of prior.nodes) {
    const candidateNode = candidate.nodes.get(nodeId)
    if (!candidateNode) {
      throw new Error(`A Yjs update cannot delete game node ${nodeId}`)
    }
    if (
      candidateNode.parentId !== priorNode.parentId ||
      candidateNode.moveUci !== priorNode.moveUci
    ) {
      throw new Error(
        `A Yjs update cannot change parentId or moveUci for game node ${nodeId}`,
      )
    }
    assertSameIntegratedType(
      priorNode.map,
      candidateNode.map,
      `game node ${nodeId} record`,
    )
    for (const key of ['parentId', 'moveUci'] as const) {
      assertSameYjsItemIdentity(
        mapFieldIdentity(priorNode.map, key, `game node ${nodeId} ${key}`),
        mapFieldIdentity(candidateNode.map, key, `game node ${nodeId} ${key}`),
        `game node ${nodeId} ${key} field`,
      )
    }
    assertSameIntegratedType(
      priorNode.childPlacements,
      candidateNode.childPlacements,
      `game node ${nodeId} childPlacements array`,
    )
    assertSameIntegratedType(
      priorNode.comments as Y.Array<unknown>,
      candidateNode.comments as Y.Array<unknown>,
      `game node ${nodeId} comments array`,
    )
    assertSameIntegratedType(
      priorNode.startingComments as Y.Array<unknown>,
      candidateNode.startingComments as Y.Array<unknown>,
      `game node ${nodeId} startingComments array`,
    )
    assertSameIntegratedType(
      priorNode.nags as Y.Map<unknown>,
      candidateNode.nags as Y.Map<unknown>,
      `game node ${nodeId} nags map`,
    )
  }
  for (const nodeId of prior.tombstones) {
    if (!candidate.tombstones.has(nodeId)) {
      throw new Error(`A Yjs update cannot clear tombstone ${nodeId}`)
    }
  }
}

const canonicalChildPlacements = (
  node: ParsedNode,
): readonly { readonly childId: GameNodeId; readonly rawIndex: number }[] =>
  canonicalLastOccurrences(
    node.childPlacements.toArray().map(parseGameNodeId),
    childId => childId,
  ).map(({ value, rawIndex }) => ({ childId: value, rawIndex }))

const validateLiveMembership = (parsed: ParsedDocument): void => {
  const canonicalMemberships = new Map<GameNodeId, ReadonlySet<GameNodeId>>()
  for (const parent of parsed.nodes.values()) {
    canonicalMemberships.set(
      parent.nodeId,
      new Set(canonicalChildPlacements(parent).map(({ childId }) => childId)),
    )
  }
  for (const node of parsed.nodes.values()) {
    if (node.nodeId === parsed.rootId || parsed.removed.has(node.nodeId)) {
      continue
    }
    const memberships = canonicalMemberships.get(
      node.parentId as GameNodeId,
    ) as ReadonlySet<GameNodeId>
    if (!memberships.has(node.nodeId)) {
      throw new Error(
        `Live game node ${node.nodeId} must have exactly one canonical parent placement`,
      )
    }
  }
}

const validateDocument = (
  document: Y.Doc,
  prior?: ParsedDocument,
  validateHistory = true,
): ParsedDocument => {
  const parsed = parseDocument(document)
  if (prior) {
    assertImmutableState(prior, parsed)
  }
  if (validateHistory) {
    validateRetainedYjsHistory(document, parsed)
  }
  validateLiveMembership(parsed)
  return parsed
}

const canonicalHeaderEntries = (
  parsed: ParsedDocument,
): readonly (readonly [string, string])[] =>
  parsed.headers.map(({ name, value }) => [name, value] as const)

const semanticSnapshot = (parsed: ParsedDocument): SemanticSnapshot => {
  const nodes = new Map<GameNodeId, SemanticNodeSnapshot>()
  for (const node of parsed.nodes.values()) {
    const parentRemoved = parsed.removed.has(node.nodeId)
    const childIds = canonicalChildPlacements(node)
      .map(({ childId }) => childId)
      .filter(childId => parentRemoved || !parsed.removed.has(childId))
    const nags = [...node.nags.keys()]
      .map(parseNagKey)
      .sort((left, right) => left - right)
    nodes.set(node.nodeId, {
      parentId: node.parentId,
      moveUci: node.moveUci,
      childIds,
      comments: parseCommentArray(
        node.comments,
        `Game node ${node.nodeId} comments`,
      ),
      startingComments: parseCommentArray(
        node.startingComments,
        `Game node ${node.nodeId} startingComments`,
      ),
      nags,
      removed: parsed.removed.has(node.nodeId),
    })
  }
  return { nodes, headers: canonicalHeaderEntries(parsed) }
}

const deriveSemanticChanges = (
  before: SemanticSnapshot,
  after: SemanticSnapshot,
): PendingSemanticChanges => {
  const changes: PendingSemanticChanges = {
    categories: new Set<GameDocumentChangeCategory>(),
    nodeIds: new Set<GameNodeId>(),
    headerNames: new Set<string>(),
  }
  const nodeIds = new Set([...before.nodes.keys(), ...after.nodes.keys()])
  for (const nodeId of nodeIds) {
    const previous = before.nodes.get(nodeId)
    const next = after.nodes.get(nodeId)
    if (
      !previous ||
      !next ||
      previous.parentId !== next.parentId ||
      previous.moveUci !== next.moveUci ||
      previous.removed !== next.removed ||
      !equalArrays(previous.childIds, next.childIds)
    ) {
      changes.categories.add('structure')
      changes.nodeIds.add(nodeId)
    }
    const previousComments = previous?.comments ?? []
    const nextComments = next?.comments ?? []
    if (!equalArrays(previousComments, nextComments)) {
      changes.categories.add('comments')
      changes.nodeIds.add(nodeId)
    }
    const previousStarting = previous?.startingComments ?? []
    const nextStarting = next?.startingComments ?? []
    if (!equalArrays(previousStarting, nextStarting)) {
      changes.categories.add('starting-comments')
      changes.nodeIds.add(nodeId)
    }
    const previousNags = previous?.nags ?? []
    const nextNags = next?.nags ?? []
    if (!equalArrays(previousNags, nextNags)) {
      changes.categories.add('nags')
      changes.nodeIds.add(nodeId)
    }
  }

  const beforeHeaderValues = new Map(before.headers)
  const afterHeaderValues = new Map(after.headers)
  const headerNames = new Set([
    ...beforeHeaderValues.keys(),
    ...afterHeaderValues.keys(),
  ])
  for (const name of headerNames) {
    if (
      beforeHeaderValues.has(name) !== afterHeaderValues.has(name) ||
      beforeHeaderValues.get(name) !== afterHeaderValues.get(name)
    ) {
      changes.headerNames.add(name)
    }
  }
  const beforeHeaderOrder = before.headers.map(([name]) => name)
  const afterHeaderOrder = after.headers.map(([name]) => name)
  const orderChanged = !equalArrays(beforeHeaderOrder, afterHeaderOrder)
  if (changes.headerNames.size !== 0 || orderChanged) {
    changes.categories.add('headers')
    // A pure order change has no changed value to identify it, so invalidate
    // precisely the names whose canonical positions moved.
    if (changes.headerNames.size === 0) {
      for (const name of headerNames) {
        if (
          beforeHeaderOrder.indexOf(name) !== afterHeaderOrder.indexOf(name)
        ) {
          changes.headerNames.add(name)
        }
      }
    }
  }
  return changes
}

const createYDocument = (
  rootId: GameNodeId,
  options: YjsGameDocumentOptions,
): Y.Doc => {
  rootId = parseGameNodeId(rootId)
  const comments = parseStringArray(options.comments ?? [], 'Comments')
  const startingComments = parseStringArray(
    options.startingComments ?? [],
    'Starting comments',
  )
  const nags = parseNags(options.nags ?? [])
  const headerValues = new Map<string, string>()
  for (const entry of options.headers ?? []) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new TypeError('Headers must contain [name, value] entries')
    }
    headerValues.set(
      parsePgnHeaderName(entry[0]),
      parsePgnHeaderValue(entry[1]),
    )
  }
  const headers = [...headerValues.entries()]

  const document = createEmptyYDocument()
  try {
    document.transact(() => {
      const root = document.getMap<unknown>(ROOT_TYPE_NAME)
      const nodes = new Y.Map<Y.Map<unknown>>()
      const headerArray = new Y.Array<Y.Map<unknown>>()
      const tombstones = new Y.Map<boolean>()
      nodes.set(
        rootId,
        makeNodeMap(null, null, comments, startingComments, nags),
      )
      if (headers.length !== 0) {
        headerArray.insert(
          0,
          headers.map(([name, value]) => makeHeaderMap(name, value)),
        )
      }
      root.set('schemaVersion', YJS_GAME_DOCUMENT_SCHEMA_VERSION)
      root.set('rootId', rootId)
      root.set('nodes', nodes)
      root.set('headers', headerArray)
      root.set('tombstones', tombstones)
    }, CANDIDATE_ORIGIN)
    validateDocument(document)
    return document
  } catch (error) {
    document.destroy()
    throw error
  }
}

/**
 * A Yjs-backed canonical structured game document.
 *
 * The Y.Doc is deliberately private. Remote updates are first applied to a
 * complete candidate clone, parsed, and structurally checked; only a valid,
 * dependency-complete candidate can become observable through this facade.
 */
export class YjsGameDocument implements GameDocument {
  #document: Y.Doc
  #parsedDocument: ParsedDocument
  #cacheNeedsRefresh = false
  #revision = 0
  #destroyed = false
  #listeners = new Set<GameDocumentChangeListener>()
  #updateListeners = new Set<YjsGameDocumentUpdateListener>()
  #transactionDepth = 0
  #transactionOrigin: unknown
  #pendingUpdates: PendingUpdate[] = []
  #notificationQueue: QueuedNotification[] = []
  #isDispatchingNotifications = false

  readonly #handleYjsUpdate = (update: Uint8Array, origin: unknown): void => {
    if (this.#transactionDepth === 0) {
      throw new Error('Yjs game document mutation escaped its transaction')
    }
    this.#pendingUpdates.push({
      update: update.slice(),
      origin: origin === LOCAL_ORIGIN ? undefined : origin,
    })
  }

  private constructor(document: Y.Doc, parsed: ParsedDocument) {
    this.#document = document
    this.#parsedDocument = parsed
    this.#document.on('update', this.#handleYjsUpdate)
  }

  /**
   * Starts a new synchronization lineage.
   *
   * Replicas must receive this document's exact genesis update and load it
   * with {@link YjsGameDocument.fromUpdate}. Independently calling `create()`
   * with the same root ID creates different write-once Yjs history and is not
   * a supported way to initialize replicas.
   */
  static create(
    rootId: GameNodeId,
    options: YjsGameDocumentOptions = {},
  ): YjsGameDocument {
    const document = createYDocument(rootId, options)
    return new YjsGameDocument(document, validateDocument(document))
  }

  static fromUpdate(
    update: Uint8Array,
    { maxBytes }: YjsGameDocumentUpdateBoundaryOptions,
  ): YjsGameDocument {
    update = parseBoundedUpdate(update, maxBytes)
    const document = createEmptyYDocument()
    try {
      Y.applyUpdate(document, update, CANDIDATE_ORIGIN)
      const parsed = validateDocument(document)
      return new YjsGameDocument(document, parsed)
    } catch (error) {
      document.destroy()
      throw error
    }
  }

  get revision(): number {
    return this.#revision
  }

  get rootId(): GameNodeId {
    return this.#parsedDocument.rootId
  }

  encodeStateVector(): Uint8Array {
    this.#assertActive()
    return Y.encodeStateVector(this.#document)
  }

  /** Encodes the complete trusted document for persistence or genesis. */
  encodeStateAsUpdate(): Uint8Array
  /**
   * Encodes the differential update missing from an external state vector.
   * Both the vector and generated response are bounded by `maxBytes`.
   */
  encodeStateAsUpdate(
    stateVector: Uint8Array,
    options: YjsGameDocumentUpdateBoundaryOptions,
  ): Uint8Array
  encodeStateAsUpdate(
    stateVector?: Uint8Array,
    options?: YjsGameDocumentUpdateBoundaryOptions,
  ): Uint8Array {
    this.#assertActive()
    if (stateVector === undefined) {
      if (options !== undefined) {
        throw new TypeError(
          'A state vector is required when differential update options are supplied',
        )
      }
      return Y.encodeStateAsUpdate(this.#document)
    }
    if (options === undefined || options === null) {
      throw new TypeError(
        'Differential updates require an options object with maxBytes',
      )
    }
    const maxBytes = parseMaxBytes(options.maxBytes)
    stateVector = assertUint8Array(stateVector, 'Yjs state vector')
    if (stateVector.byteLength > maxBytes) {
      throw new RangeError(
        `Yjs state vector exceeds maxBytes (${stateVector.byteLength} > ${maxBytes})`,
      )
    }
    const update = Y.encodeStateAsUpdate(this.#document, stateVector)
    if (update.byteLength > maxBytes) {
      throw new RangeError(
        `Generated Yjs differential update exceeds maxBytes (${update.byteLength} > ${maxBytes})`,
      )
    }
    return update
  }

  applyUpdate(
    update: Uint8Array,
    { origin, maxBytes }: YjsGameDocumentApplyOptions,
  ): void {
    this.#assertActive()
    update = parseBoundedUpdate(update, maxBytes)

    const prior = this.#parsed()
    const candidate = createEmptyYDocument()
    try {
      Y.applyUpdate(
        candidate,
        Y.encodeStateAsUpdate(this.#document),
        CANDIDATE_ORIGIN,
      )
      assertResolvedUpdate(candidate)
      Y.applyUpdate(candidate, update, CANDIDATE_ORIGIN)
      validateDocument(candidate, prior)
      this.transact(
        () => {
          Y.applyUpdate(this.#document, update, yjsOrigin(origin))
          this.#cacheNeedsRefresh = true
        },
        { origin },
      )
    } finally {
      candidate.destroy()
    }
  }

  subscribeUpdates(listener: YjsGameDocumentUpdateListener): () => void {
    this.#assertActive()
    if (typeof listener !== 'function') {
      throw new TypeError('Update listener must be a function')
    }
    this.#updateListeners.add(listener)
    return () => {
      this.#updateListeners.delete(listener)
    }
  }

  destroy(): void {
    if (this.#destroyed) {
      return
    }
    this.#destroyed = true
    this.#document.off('update', this.#handleYjsUpdate)
    this.#document.destroy()
    this.#listeners.clear()
    this.#updateListeners.clear()
    this.#notificationQueue = []
    this.#pendingUpdates = []
  }

  transact<Callback extends () => unknown>(
    callback: GameDocumentTransactionCallback<Callback>,
    { origin }: GameDocumentTransactionOptions = {},
  ): ReturnType<Callback> {
    this.#assertActive()
    if (typeof callback !== 'function') {
      throw new TypeError('Transaction callback must be a function')
    }

    if (this.#transactionDepth !== 0) {
      this.#transactionDepth += 1
      try {
        const nestedResult = callback()
        if (isThenable(nestedResult)) {
          throw new TypeError(
            'Transaction callback must complete synchronously and must not return a promise or thenable',
          )
        }
        return nestedResult as ReturnType<Callback>
      } finally {
        this.#transactionDepth -= 1
        // Mutations persist when a nested callback throws. Refresh from the
        // trusted private document before its caller can issue another command.
        this.#refreshParsedDocument()
      }
    }

    const before = semanticSnapshot(this.#parsed())
    this.#transactionOrigin = origin
    this.#pendingUpdates = []
    this.#transactionDepth = 1
    let callbackFailed = false
    let callbackFailure: unknown
    let result: unknown
    try {
      this.#document.transact(() => {
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
        }
      }, yjsOrigin(origin))
    } catch (error) {
      callbackFailed = true
      callbackFailure = error
    } finally {
      this.#transactionDepth = 0
    }

    let listenerFailures: readonly unknown[] = []
    try {
      this.#refreshParsedDocument()
      const after = semanticSnapshot(this.#parsedDocument)
      listenerFailures = this.#flushNotifications(
        deriveSemanticChanges(before, after),
      )
    } catch (error) {
      if (callbackFailed) {
        throw new AggregateError(
          [callbackFailure, error],
          'Game document transaction callback and publication failed',
          { cause: callbackFailure },
        )
      }
      throw error
    } finally {
      this.#transactionOrigin = undefined
      this.#pendingUpdates = []
    }

    throwTransactionFailures(callbackFailed, callbackFailure, listenerFailures)
    return result as ReturnType<Callback>
  }

  subscribe(listener: GameDocumentChangeListener): () => void {
    this.#assertActive()
    if (typeof listener !== 'function') {
      throw new TypeError('Change listener must be a function')
    }
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  hasNode(nodeId: GameNodeId): boolean {
    this.#assertActive()
    nodeId = parseGameNodeId(nodeId)
    return this.#nodesType().has(nodeId)
  }

  getParentId(nodeId: GameNodeId): GameNodeId | null {
    return this.#requireNode(nodeId).parentId
  }

  getMoveUci(nodeId: GameNodeId): string | null {
    return this.#requireNode(nodeId).moveUci
  }

  getChildIds(nodeId: GameNodeId): readonly GameNodeId[] {
    const parsed = this.#parsed()
    nodeId = parseGameNodeId(nodeId)
    const node = parsed.nodes.get(nodeId)
    if (!node) {
      throw new Error(`Unknown game node ID: ${nodeId}`)
    }
    const parentRemoved = parsed.removed.has(nodeId)
    return freezeArray(
      canonicalChildPlacements(node)
        .map(({ childId }) => childId)
        .filter(childId => parentRemoved || !parsed.removed.has(childId)),
    )
  }

  isRemoved(nodeId: GameNodeId): boolean {
    const parsed = this.#parsed()
    nodeId = parseGameNodeId(nodeId)
    if (!parsed.nodes.has(nodeId)) {
      throw new Error(`Unknown game node ID: ${nodeId}`)
    }
    return parsed.removed.has(nodeId)
  }

  addNode(
    input: GameDocumentAddNodeInput,
    { index }: GameDocumentAddNodeOptions = {},
  ): void {
    this.#assertActive()
    const nodeId = parseGameNodeId(input.nodeId)
    const parentId = parseGameNodeId(input.parentId)
    if (nodeId === this.rootId) {
      throw new Error('The root node cannot be added as a child')
    }
    if (this.#nodesType().has(nodeId)) {
      throw new Error(`Duplicate game node ID: ${nodeId}`)
    }
    const parent = this.#requireNode(parentId)
    if (this.isRemoved(parentId)) {
      throw new Error(`Cannot add a child below removed game node ${parentId}`)
    }
    const moveUci = parseGameMoveUci(input.moveUci)
    const comments = parseStringArray(input.comments, 'Comments')
    const startingComments = parseStringArray(
      input.startingComments,
      'Starting comments',
    )
    const nags = parseNags(input.nags)
    const placements = canonicalChildPlacements(parent)
    const insertionIndex = index ?? placements.length
    assertInsertionIndex(insertionIndex, placements.length)
    const parsedDocument = this.#parsed()
    const nodesType = parsedDocument.nodesType
    const nodeMap = makeNodeMap(
      parentId,
      moveUci,
      comments,
      startingComments,
      nags,
    )

    this.transact(() => {
      this.#cacheNeedsRefresh = true
      nodesType.set(nodeId, nodeMap)
      this.#insertPlacement(
        parent.childPlacements,
        placements,
        insertionIndex,
        nodeId,
      )
      ;(parsedDocument.nodes as Map<GameNodeId, ParsedNode>).set(
        nodeId,
        parsedNodeFromTrustedLocalMap(nodeId, parentId, moveUci, nodeMap),
      )
      this.#cacheNeedsRefresh = false
    })
  }

  removeChild(parentId: GameNodeId, nodeId: GameNodeId): boolean {
    const parsed = this.#parsed()
    parentId = parseGameNodeId(parentId)
    nodeId = parseGameNodeId(nodeId)
    if (nodeId === this.rootId) {
      throw new Error('The root node cannot be attached, removed, or moved')
    }
    const parent = parsed.nodes.get(parentId)
    const node = parsed.nodes.get(nodeId)
    if (!parent) {
      throw new Error(`Unknown game node ID: ${parentId}`)
    }
    if (!node) {
      throw new Error(`Unknown game node ID: ${nodeId}`)
    }
    if (node.parentId !== parentId) {
      throw new Error(
        `Game node ${nodeId} belongs to ${String(node.parentId)}, not ${parentId}`,
      )
    }
    if (parsed.removed.has(nodeId)) {
      return false
    }
    if (
      !canonicalChildPlacements(parent).some(entry => entry.childId === nodeId)
    ) {
      throw new Error(`Live game node ${nodeId} is not attached to ${parentId}`)
    }

    this.transact(() => {
      this.#cacheNeedsRefresh = true
      this.#deletePlacements(parent.childPlacements, nodeId)
      parsed.tombstonesType.set(nodeId, true)
      const tombstones = new Set(parsed.tombstones)
      tombstones.add(nodeId)
      this.#parsedDocument = {
        ...parsed,
        tombstones,
        removed: deriveEffectiveTombstones(
          parsed.nodes,
          parsed.rootId,
          tombstones,
        ),
      }
      this.#cacheNeedsRefresh = false
    })
    return true
  }

  moveChild(parentId: GameNodeId, nodeId: GameNodeId, index: number): void {
    parentId = parseGameNodeId(parentId)
    nodeId = parseGameNodeId(nodeId)
    if (nodeId === this.rootId) {
      throw new Error('The root node cannot be attached, removed, or moved')
    }
    const parent = this.#requireNode(parentId)
    const node = this.#requireNode(nodeId)
    if (node.parentId !== parentId) {
      throw new Error(
        `Game node ${nodeId} belongs to ${String(node.parentId)}, not ${parentId}`,
      )
    }
    if (this.isRemoved(parentId)) {
      throw new Error(`Removed game node ${parentId} cannot be reordered`)
    }
    if (this.isRemoved(nodeId)) {
      throw new Error(`Removed game node ${nodeId} cannot be reordered`)
    }
    const placements = canonicalChildPlacements(parent)
    const currentIndex = placements.findIndex(entry => entry.childId === nodeId)
    if (currentIndex === -1) {
      throw new Error(`Game node ${nodeId} is not attached to ${parentId}`)
    }
    assertExistingIndex(index, placements.length)
    if (currentIndex === index) {
      return
    }

    const desired = placements.map(({ childId }) => childId)
    desired.splice(currentIndex, 1)
    desired.splice(index, 0, nodeId)
    this.transact(() => {
      this.#cacheNeedsRefresh = true
      this.#deletePlacements(parent.childPlacements, nodeId)
      const remaining = canonicalChildPlacements(parent)
      const desiredIndex = desired.indexOf(nodeId)
      this.#insertPlacement(
        parent.childPlacements,
        remaining,
        desiredIndex,
        nodeId,
      )
      // Parsed nodes retain the live child-placement Y.Array by identity.
      this.#cacheNeedsRefresh = false
    })
  }

  getComments(nodeId: GameNodeId): readonly string[] {
    const node = this.#requireNode(nodeId)
    return freezeArray(
      parseCommentArray(node.comments, `Game node ${node.nodeId} comments`),
    )
  }

  setComments(nodeId: GameNodeId, comments: readonly string[]): void {
    const node = this.#requireNode(nodeId)
    const parsed = parseStringArray(comments, 'Comments')
    if (equalArrays(this.getComments(nodeId), parsed)) {
      return
    }
    this.transact(() => {
      if (node.comments.length !== 0) {
        node.comments.delete(0, node.comments.length)
      }
      if (parsed.length !== 0) {
        node.comments.insert(0, parsed.map(makeCommentMap))
      }
    })
  }

  insertComment(nodeId: GameNodeId, index: number, comment: string): void {
    const node = this.#requireNode(nodeId)
    const [parsed] = parseStringArray([comment], 'Comments')
    assertInsertionIndex(index, node.comments.length)
    this.transact(() => {
      node.comments.insert(index, [makeCommentMap(parsed)])
    })
  }

  editComment(nodeId: GameNodeId, index: number, comment: string): void {
    const node = this.#requireNode(nodeId)
    const [parsed] = parseStringArray([comment], 'Comments')
    assertExistingIndex(index, node.comments.length)
    const entry = node.comments.get(index)
    if (entry.get('text') === parsed) {
      return
    }
    this.transact(() => {
      entry.set('text', parsed)
    })
  }

  removeComment(nodeId: GameNodeId, index: number): string {
    const node = this.#requireNode(nodeId)
    assertExistingIndex(index, node.comments.length)
    const entry = node.comments.get(index)
    const text = entry.get('text')
    if (typeof text !== 'string') {
      throw new TypeError('Comment text must be a string')
    }
    this.transact(() => {
      node.comments.delete(index, 1)
    })
    return text
  }

  getStartingComments(nodeId: GameNodeId): readonly string[] {
    const node = this.#requireNode(nodeId)
    return freezeArray(
      parseCommentArray(
        node.startingComments,
        `Game node ${node.nodeId} startingComments`,
      ),
    )
  }

  setStartingComments(
    nodeId: GameNodeId,
    startingComments: readonly string[],
  ): void {
    const node = this.#requireNode(nodeId)
    const parsed = parseStringArray(startingComments, 'Starting comments')
    if (equalArrays(this.getStartingComments(nodeId), parsed)) {
      return
    }
    this.transact(() => {
      if (node.startingComments.length !== 0) {
        node.startingComments.delete(0, node.startingComments.length)
      }
      if (parsed.length !== 0) {
        node.startingComments.insert(0, parsed.map(makeCommentMap))
      }
    })
  }

  insertStartingComment(
    nodeId: GameNodeId,
    index: number,
    comment: string,
  ): void {
    const node = this.#requireNode(nodeId)
    const [parsed] = parseStringArray([comment], 'Starting comments')
    assertInsertionIndex(index, node.startingComments.length)
    this.transact(() => {
      node.startingComments.insert(index, [makeCommentMap(parsed)])
    })
  }

  editStartingComment(
    nodeId: GameNodeId,
    index: number,
    comment: string,
  ): void {
    const node = this.#requireNode(nodeId)
    const [parsed] = parseStringArray([comment], 'Starting comments')
    assertExistingIndex(index, node.startingComments.length)
    const entry = node.startingComments.get(index)
    if (entry.get('text') === parsed) {
      return
    }
    this.transact(() => {
      entry.set('text', parsed)
    })
  }

  removeStartingComment(nodeId: GameNodeId, index: number): string {
    const node = this.#requireNode(nodeId)
    assertExistingIndex(index, node.startingComments.length)
    const entry = node.startingComments.get(index)
    const text = entry.get('text')
    if (typeof text !== 'string') {
      throw new TypeError('Starting comment text must be a string')
    }
    this.transact(() => {
      node.startingComments.delete(index, 1)
    })
    return text
  }

  getNags(nodeId: GameNodeId): readonly number[] {
    const node = this.#requireNode(nodeId)
    return freezeArray(
      [...node.nags.keys()]
        .map(parseNagKey)
        .sort((left, right) => left - right),
    )
  }

  setNags(nodeId: GameNodeId, nags: Iterable<number>): void {
    const node = this.#requireNode(nodeId)
    const parsed = parseNags(nags)
    if (equalArrays(this.getNags(nodeId), parsed)) {
      return
    }
    this.transact(() => {
      for (const key of [...node.nags.keys()]) {
        node.nags.delete(key)
      }
      for (const nag of parsed) {
        node.nags.set(String(nag), true)
      }
    })
  }

  addNag(nodeId: GameNodeId, nag: number): boolean {
    const node = this.#requireNode(nodeId)
    const [parsed] = parseNags([nag])
    const key = String(parsed)
    if (node.nags.has(key)) {
      return false
    }
    this.transact(() => {
      node.nags.set(key, true)
    })
    return true
  }

  removeNag(nodeId: GameNodeId, nag: number): boolean {
    const node = this.#requireNode(nodeId)
    const [parsed] = parseNags([nag])
    const key = String(parsed)
    if (!node.nags.has(key)) {
      return false
    }
    this.transact(() => {
      node.nags.delete(key)
    })
    return true
  }

  clearNags(nodeId: GameNodeId): void {
    const node = this.#requireNode(nodeId)
    if (node.nags.size === 0) {
      return
    }
    this.transact(() => {
      for (const key of [...node.nags.keys()]) {
        node.nags.delete(key)
      }
    })
  }

  getHeader(name: string): string | undefined {
    this.#assertActive()
    name = parsePgnHeaderName(name)
    const parsed = this.#parsed()
    return parsed.headers.find(entry => entry.name === name)?.value
  }

  setHeader(name: string, value: string): void {
    this.#assertActive()
    name = parsePgnHeaderName(name)
    value = parsePgnHeaderValue(value)
    const parsed = this.#parsed()
    const existing = parsed.headers.find(entry => entry.name === name)
    if (existing?.value === value) {
      return
    }
    this.transact(() => {
      this.#cacheNeedsRefresh = true
      if (existing) {
        existing.map.set('value', value)
      } else {
        parsed.headersType.push([makeHeaderMap(name, value)])
      }
      this.#parsedDocument = {
        ...parsed,
        headers: parseHeaders(parsed.headersType),
      }
      this.#cacheNeedsRefresh = false
    })
  }

  deleteHeader(name: string): boolean {
    this.#assertActive()
    name = parsePgnHeaderName(name)
    const parsed = this.#parsed()
    if (!parsed.headers.some(entry => entry.name === name)) {
      return false
    }
    this.transact(() => {
      this.#cacheNeedsRefresh = true
      const raw = parsed.headersType.toArray()
      for (let index = raw.length - 1; index >= 0; index -= 1) {
        if (raw[index]?.get('name') === name) {
          parsed.headersType.delete(index, 1)
        }
      }
      this.#parsedDocument = {
        ...parsed,
        headers: parseHeaders(parsed.headersType),
      }
      this.#cacheNeedsRefresh = false
    })
    return true
  }

  getHeaderEntries(): readonly (readonly [string, string])[] {
    this.#assertActive()
    return Object.freeze(
      canonicalHeaderEntries(this.#parsed()).map(([name, value]) =>
        Object.freeze([name, value] as const),
      ),
    )
  }

  #assertActive(): void {
    if (this.#destroyed) {
      throw new Error('Yjs game document has been destroyed')
    }
  }

  #parsed(): ParsedDocument {
    this.#assertActive()
    this.#refreshParsedDocument()
    return this.#parsedDocument
  }

  #refreshParsedDocument(): void {
    if (!this.#cacheNeedsRefresh) {
      return
    }
    this.#parsedDocument = validateDocument(this.#document, undefined, false)
    this.#cacheNeedsRefresh = false
  }

  #nodesType(): Y.Map<Y.Map<unknown>> {
    return this.#parsed().nodesType
  }

  #requireNode(nodeId: GameNodeId): ParsedNode {
    const parsed = this.#parsed()
    nodeId = parseGameNodeId(nodeId)
    const node = parsed.nodes.get(nodeId)
    if (!node) {
      throw new Error(`Unknown game node ID: ${nodeId}`)
    }
    return node
  }

  #insertPlacement(
    placements: Y.Array<string>,
    canonical: readonly {
      readonly childId: GameNodeId
      readonly rawIndex: number
    }[],
    index: number,
    nodeId: GameNodeId,
  ): void {
    const rawIndex =
      index === canonical.length
        ? placements.length
        : (canonical[index] as { readonly rawIndex: number }).rawIndex
    placements.insert(rawIndex, [nodeId])
  }

  #deletePlacements(placements: Y.Array<string>, nodeId: GameNodeId): void {
    const raw = placements.toArray()
    for (let index = raw.length - 1; index >= 0; index -= 1) {
      if (raw[index] === nodeId) {
        placements.delete(index, 1)
      }
    }
  }

  #flushNotifications(changes: PendingSemanticChanges): readonly unknown[] {
    if (changes.categories.size !== 0) {
      this.#revision += 1
      const event: GameDocumentChangeEvent = Object.freeze({
        revision: this.#revision,
        origin: this.#transactionOrigin,
        categories: Object.freeze(
          CHANGE_CATEGORY_ORDER.filter(category =>
            changes.categories.has(category),
          ),
        ),
        changedNodeIds: Object.freeze(
          [...changes.nodeIds].sort(compareStrings),
        ),
        changedHeaderNames: Object.freeze(
          [...changes.headerNames].sort(compareStrings),
        ),
      })
      this.#notificationQueue.push({ kind: 'change', event })
    }
    for (const event of this.#pendingUpdates) {
      this.#notificationQueue.push({ kind: 'update', event })
    }

    if (this.#isDispatchingNotifications) {
      return []
    }
    const failures: unknown[] = []
    this.#isDispatchingNotifications = true
    let nextIndex = 0
    try {
      while (nextIndex < this.#notificationQueue.length) {
        const queued = this.#notificationQueue[nextIndex] as QueuedNotification
        nextIndex += 1
        if (queued.kind === 'change') {
          for (const listener of [...this.#listeners]) {
            try {
              listener(queued.event)
            } catch (error) {
              failures.push(error)
            }
          }
        } else {
          for (const listener of [...this.#updateListeners]) {
            try {
              listener(
                Object.freeze({
                  update: queued.event.update.slice(),
                  origin: queued.event.origin,
                }),
              )
            } catch (error) {
              failures.push(error)
            }
          }
        }
      }
    } finally {
      this.#notificationQueue.splice(0, nextIndex)
      this.#isDispatchingNotifications = false
    }
    return failures
  }
}
