import { afterEach, describe, expect, test, vi } from 'vitest'
import * as Y from 'yjs'

import { Move } from '../index'
import * as pgn from '../pgn'
import type {
  GameDocumentChangeEvent,
  GameDocumentChangeCategory,
} from '../game-document'
import type { GameNodeId } from '../game-node-id'
import {
  YJS_GAME_DOCUMENT_SCHEMA_VERSION,
  YjsGameDocument,
} from '../yjs-game-document'

const MAX_UPDATE_BYTES = 64 * 1024 * 1024
const ROOT_TYPE_NAME = 'chess.ts/game-document'

const nodeId = (value: number): GameNodeId =>
  `00000000-0000-0000-0000-${String(value).padStart(12, '0')}` as GameNodeId

const ROOT_ID = nodeId(1)
const FIRST_ID = nodeId(2)
const SECOND_ID = nodeId(3)
const THIRD_ID = nodeId(4)
const GRANDCHILD_ID = nodeId(5)
const GREAT_GRANDCHILD_ID = nodeId(6)

const documents: YjsGameDocument[] = []

afterEach(() => {
  while (documents.length !== 0) {
    documents.pop()?.destroy()
  }
})

const createDocument = (
  options: pgn.MemoryGameDocumentOptions = {},
): YjsGameDocument => {
  const document = YjsGameDocument.create(ROOT_ID, options)
  documents.push(document)
  return document
}

const loadDocument = (update: Uint8Array): YjsGameDocument => {
  const document = YjsGameDocument.fromUpdate(update, {
    maxBytes: MAX_UPDATE_BYTES,
  })
  documents.push(document)
  return document
}

const forkDocument = (source: YjsGameDocument): YjsGameDocument =>
  loadDocument(source.encodeStateAsUpdate())

const addNode = (
  document: YjsGameDocument,
  id: GameNodeId,
  parentId: GameNodeId,
  moveUci: string,
  {
    comments = [],
    startingComments = [],
    nags = [],
    index,
  }: {
    comments?: readonly string[]
    startingComments?: readonly string[]
    nags?: Iterable<number>
    index?: number
  } = {},
): void => {
  document.addNode(
    {
      nodeId: id,
      parentId,
      moveUci,
      comments,
      startingComments,
      nags,
    },
    index === undefined ? undefined : { index },
  )
}

const apply = (
  document: YjsGameDocument,
  update: Uint8Array,
  origin?: unknown,
): void => {
  document.applyUpdate(update, {
    maxBytes: MAX_UPDATE_BYTES,
    origin,
  })
}

const differentialUpdate = (
  document: YjsGameDocument,
  baselineStateVector: Uint8Array,
): Uint8Array =>
  document.encodeStateAsUpdate(baselineStateVector, {
    maxBytes: MAX_UPDATE_BYTES,
  })

const synchronize = (
  source: YjsGameDocument,
  target: YjsGameDocument,
  origin?: unknown,
): void => {
  apply(target, differentialUpdate(source, target.encodeStateVector()), origin)
}

const captureSingleUpdate = (
  document: YjsGameDocument,
  operation: () => void,
): Uint8Array => {
  const updates: Uint8Array[] = []
  const unsubscribe = document.subscribeUpdates(({ update }) => {
    updates.push(update)
  })
  try {
    operation()
  } finally {
    unsubscribe()
  }
  expect(updates).toHaveLength(1)
  return updates[0] as Uint8Array
}

const bytes = (value: Uint8Array): readonly number[] => [...value]

const fingerprint = (
  document: YjsGameDocument,
  nodeIds: readonly GameNodeId[],
): string =>
  JSON.stringify({
    rootId: document.rootId,
    headers: document.getHeaderEntries(),
    nodes: nodeIds.map(id =>
      document.hasNode(id)
        ? {
            id,
            parentId: document.getParentId(id),
            moveUci: document.getMoveUci(id),
            childIds: document.getChildIds(id),
            comments: document.getComments(id),
            startingComments: document.getStartingComments(id),
            nags: document.getNags(id),
            removed: document.isRemoved(id),
          }
        : { id, missing: true },
    ),
  })

const convergedPair = (
  seed: YjsGameDocument,
  mutateFirst: (document: YjsGameDocument) => void,
  mutateSecond: (document: YjsGameDocument) => void,
): readonly [YjsGameDocument, YjsGameDocument] => {
  const baseline = seed.encodeStateVector()
  const first = forkDocument(seed)
  const second = forkDocument(seed)
  mutateFirst(first)
  mutateSecond(second)
  const firstUpdate = differentialUpdate(first, baseline)
  const secondUpdate = differentialUpdate(second, baseline)
  apply(first, secondUpdate)
  apply(second, firstUpdate)
  return [first, second]
}

const expectConverged = (
  first: YjsGameDocument,
  second: YjsGameDocument,
  nodeIds: readonly GameNodeId[],
): void => {
  expect(fingerprint(first, nodeIds)).toBe(fingerprint(second, nodeIds))
  expect(bytes(first.encodeStateVector())).toEqual(
    bytes(second.encodeStateVector()),
  )
}

interface MutableScalarHistoryCase {
  readonly name: string
  readonly options: pgn.MemoryGameDocumentOptions
  readonly mutate: (
    document: YjsGameDocument,
    actor: 'first' | 'second',
  ) => void
  readonly read: (document: YjsGameDocument) => unknown
}

const mutableScalarHistoryCases: readonly MutableScalarHistoryCase[] = [
  {
    name: 'header value',
    options: { headers: [['Event', 'base']] },
    mutate(document, actor): void {
      document.setHeader('Event', `${actor}-1`)
      document.setHeader('Event', `${actor}-2`)
    },
    read: document => document.getHeader('Event'),
  },
  {
    name: 'comment text',
    options: { comments: ['base'] },
    mutate(document, actor): void {
      document.editComment(ROOT_ID, 0, `${actor}-1`)
      document.editComment(ROOT_ID, 0, `${actor}-2`)
    },
    read: document => document.getComments(ROOT_ID),
  },
  {
    name: 'starting-comment text',
    options: { startingComments: ['base'] },
    mutate(document, actor): void {
      document.editStartingComment(ROOT_ID, 0, `${actor}-1`)
      document.editStartingComment(ROOT_ID, 0, `${actor}-2`)
    },
    read: document => document.getStartingComments(ROOT_ID),
  },
  {
    name: 'NAG value',
    options: { nags: [1] },
    mutate(document): void {
      document.removeNag(ROOT_ID, 1)
      document.addNag(ROOT_ID, 1)
      document.removeNag(ROOT_ID, 1)
      document.addNag(ROOT_ID, 1)
    },
    read: document => document.getNags(ROOT_ID),
  },
]

describe('YjsGameDocument updates and facade', () => {
  test('round-trips genesis, full state, differential state, and idempotent updates', () => {
    const source = createDocument({
      headers: [
        ['Event', 'Distributed analysis'],
        ['White', 'Alice'],
      ],
      comments: ['root comment'],
      nags: [3, 1, 3],
    })
    addNode(source, FIRST_ID, ROOT_ID, 'e2e4', {
      comments: ['candidate'],
      startingComments: ['main line'],
      nags: [5],
    })

    const fullUpdate = source.encodeStateAsUpdate()
    const replica = loadDocument(fullUpdate)
    expect(replica.revision).toBe(0)
    expectConverged(source, replica, [ROOT_ID, FIRST_ID])
    expect(replica.getHeaderEntries()).toEqual([
      ['Event', 'Distributed analysis'],
      ['White', 'Alice'],
    ])

    const replicaVector = replica.encodeStateVector()
    source.transact(() => {
      source.setHeader('Site', 'Online')
      source.insertComment(FIRST_ID, 1, 'follow-up')
    })
    const delta = differentialUpdate(source, replicaVector)
    expect(delta.byteLength).toBeLessThan(
      source.encodeStateAsUpdate().byteLength,
    )
    apply(replica, delta)
    expectConverged(source, replica, [ROOT_ID, FIRST_ID])

    const revision = replica.revision
    const changes = vi.fn()
    const updates = vi.fn()
    replica.subscribe(changes)
    replica.subscribeUpdates(updates)
    apply(replica, delta)
    expect(replica.revision).toBe(revision)
    expect(changes).not.toHaveBeenCalled()
    expect(updates).not.toHaveBeenCalled()
  })

  test('requires and enforces a byte budget for external state vectors', () => {
    const document = createDocument()
    const stateVector = document.encodeStateVector()

    expect(() =>
      Reflect.apply(document.encodeStateAsUpdate, document, [stateVector]),
    ).toThrow(/require an options object with maxBytes/)
    expect(stateVector.byteLength).toBeGreaterThan(1)
    expect(() =>
      document.encodeStateAsUpdate(stateVector, {
        maxBytes: stateVector.byteLength - 1,
      }),
    ).toThrow(/Yjs state vector exceeds maxBytes/)
  })

  test('rejects generated differential and full responses that exceed the byte budget', () => {
    const source = createDocument()
    const replica = forkDocument(source)
    const replicaVector = replica.encodeStateVector()
    source.insertComment(ROOT_ID, 0, 'analysis '.repeat(2_048))

    const differential = differentialUpdate(source, replicaVector)
    expect(differential.byteLength).toBeGreaterThan(replicaVector.byteLength)
    expect(() =>
      source.encodeStateAsUpdate(replicaVector, {
        maxBytes: differential.byteLength - 1,
      }),
    ).toThrow(/Generated Yjs differential update exceeds maxBytes/)

    const emptyDocument = new Y.Doc()
    const emptyVector = Y.encodeStateVector(emptyDocument)
    emptyDocument.destroy()
    const fullResponse = differentialUpdate(source, emptyVector)
    expectConverged(source, loadDocument(fullResponse), [ROOT_ID])
    expect(() =>
      source.encodeStateAsUpdate(emptyVector, {
        maxBytes: fullResponse.byteLength - 1,
      }),
    ).toThrow(/Generated Yjs differential update exceeds maxBytes/)
  })

  test('rejects full and differential updates from an independent same-root lineage atomically', () => {
    const first = createDocument()
    const second = createDocument()
    expect(bytes(first.encodeStateVector())).not.toEqual(
      bytes(second.encodeStateVector()),
    )

    const firstFull = first.encodeStateAsUpdate()
    const secondFull = second.encodeStateAsUpdate()
    const firstDifferential = differentialUpdate(
      first,
      second.encodeStateVector(),
    )
    const secondDifferential = differentialUpdate(
      second,
      first.encodeStateVector(),
    )

    expectRejectedAtomically(first, secondFull, [ROOT_ID])
    expectRejectedAtomically(first, secondDifferential, [ROOT_ID])
    expectRejectedAtomically(second, firstFull, [ROOT_ID])
    expectRejectedAtomically(second, firstDifferential, [ROOT_ID])
  })

  test('enforces byte limits and rejects unresolved dependent updates atomically', () => {
    const seed = createDocument()
    const source = forkDocument(seed)
    const target = forkDocument(seed)
    const firstUpdate = captureSingleUpdate(source, () => {
      addNode(source, FIRST_ID, ROOT_ID, 'e2e4')
    })
    const dependentUpdate = captureSingleUpdate(source, () => {
      addNode(source, GRANDCHILD_ID, FIRST_ID, 'e7e5')
    })
    const before = fingerprint(target, [ROOT_ID, FIRST_ID, GRANDCHILD_ID])
    const beforeVector = bytes(target.encodeStateVector())

    expect(() =>
      target.applyUpdate(firstUpdate, {
        maxBytes: firstUpdate.byteLength - 1,
      }),
    ).toThrow()
    expect(() =>
      YjsGameDocument.fromUpdate(seed.encodeStateAsUpdate(), {
        maxBytes: seed.encodeStateAsUpdate().byteLength - 1,
      }),
    ).toThrow()
    expect(() => apply(target, dependentUpdate)).toThrow(
      /unresolved struct dependencies/,
    )
    expect(fingerprint(target, [ROOT_ID, FIRST_ID, GRANDCHILD_ID])).toBe(before)
    expect(bytes(target.encodeStateVector())).toEqual(beforeVector)

    apply(target, firstUpdate)
    apply(target, dependentUpdate)
    expect(target.getChildIds(ROOT_ID)).toEqual([FIRST_ID])
    expect(target.getChildIds(FIRST_ID)).toEqual([GRANDCHILD_ID])
  })

  test('keeps materialized Game handles stable across remote updates', () => {
    const document = createDocument()
    addNode(document, FIRST_ID, ROOT_ID, 'e2e4', {
      comments: ['initial'],
    })
    const game = new pgn.Game(null, { document })
    const child = game.nodeById(FIRST_ID) as pgn.ChildNode
    const remote = forkDocument(document)

    remote.editComment(FIRST_ID, 0, 'remote edit')
    addNode(remote, GRANDCHILD_ID, FIRST_ID, 'e7e5')
    synchronize(remote, document)

    expect(game.nodeById(FIRST_ID)).toBe(child)
    expect(game.variations[0]).toBe(child)
    expect(child.comments).toEqual(['remote edit'])
    const grandchild = child.variations[0]
    expect(grandchild.nodeId).toBe(GRANDCHILD_ID)
    expect(game.nodeById(GRANDCHILD_ID)).toBe(grandchild)
  })
})

describe('YjsGameDocument convergence policies', () => {
  test.each(mutableScalarHistoryCases)(
    'converges repeated concurrent $name writes from public operations',
    ({ options, mutate, read }) => {
      const seed = createDocument(options)
      const [first, second] = convergedPair(
        seed,
        document => {
          document.transact(() => mutate(document, 'first'))
        },
        document => {
          document.transact(() => mutate(document, 'second'))
        },
      )

      expectConverged(first, second, [ROOT_ID])
      expect(read(first)).toEqual(read(second))
    },
  )

  test('retains concurrent children and distinct same-move siblings', () => {
    const seed = createDocument()
    const [first, second] = convergedPair(
      seed,
      document => {
        addNode(document, FIRST_ID, ROOT_ID, 'e2e4')
        addNode(document, SECOND_ID, ROOT_ID, 'd2d4')
      },
      document => {
        addNode(document, THIRD_ID, ROOT_ID, 'e2e4')
      },
    )

    expectConverged(first, second, [ROOT_ID, FIRST_ID, SECOND_ID, THIRD_ID])
    expect(new Set(first.getChildIds(ROOT_ID))).toEqual(
      new Set([FIRST_ID, SECOND_ID, THIRD_ID]),
    )
    expect(first.getMoveUci(FIRST_ID)).toBe('e2e4')
    expect(first.getMoveUci(THIRD_ID)).toBe('e2e4')
  })

  test('concurrent reorders expose one canonical last placement per child', () => {
    const seed = createDocument()
    addNode(seed, FIRST_ID, ROOT_ID, 'e2e4')
    addNode(seed, SECOND_ID, ROOT_ID, 'd2d4')
    addNode(seed, THIRD_ID, ROOT_ID, 'c2c4')
    const [first, second] = convergedPair(
      seed,
      document => document.moveChild(ROOT_ID, THIRD_ID, 0),
      document => document.moveChild(ROOT_ID, THIRD_ID, 1),
    )

    expectConverged(first, second, [ROOT_ID, FIRST_ID, SECOND_ID, THIRD_ID])
    const children = first.getChildIds(ROOT_ID)
    expect(children).toHaveLength(3)
    expect(children.filter(id => id === THIRD_ID)).toHaveLength(1)
    expect(new Set(children)).toEqual(new Set([FIRST_ID, SECOND_ID, THIRD_ID]))
  })

  test('terminal deletion wins against a concurrent reorder', () => {
    const seed = createDocument()
    addNode(seed, FIRST_ID, ROOT_ID, 'e2e4')
    addNode(seed, SECOND_ID, ROOT_ID, 'd2d4')
    const [first, second] = convergedPair(
      seed,
      document => {
        document.removeChild(ROOT_ID, FIRST_ID)
      },
      document => document.moveChild(ROOT_ID, FIRST_ID, 1),
    )

    expectConverged(first, second, [ROOT_ID, FIRST_ID, SECOND_ID])
    expect(first.isRemoved(FIRST_ID)).toBe(true)
    expect(first.getChildIds(ROOT_ID)).toEqual([SECOND_ID])
    expect(() => first.moveChild(ROOT_ID, FIRST_ID, 0)).toThrow(/removed/i)
  })

  test('deletion transitively hides descendants created by an offline replica', () => {
    const seed = createDocument()
    addNode(seed, FIRST_ID, ROOT_ID, 'e2e4')
    const [first, second] = convergedPair(
      seed,
      document => {
        document.removeChild(ROOT_ID, FIRST_ID)
      },
      document => {
        addNode(document, GRANDCHILD_ID, FIRST_ID, 'e7e5')
        addNode(document, GREAT_GRANDCHILD_ID, GRANDCHILD_ID, 'g1f3')
      },
    )

    expectConverged(first, second, [
      ROOT_ID,
      FIRST_ID,
      GRANDCHILD_ID,
      GREAT_GRANDCHILD_ID,
    ])
    expect(first.getChildIds(ROOT_ID)).toEqual([])
    expect(first.getChildIds(FIRST_ID)).toEqual([GRANDCHILD_ID])
    expect(first.getChildIds(GRANDCHILD_ID)).toEqual([GREAT_GRANDCHILD_ID])
    expect(first.isRemoved(FIRST_ID)).toBe(true)
    expect(first.isRemoved(GRANDCHILD_ID)).toBe(true)
    expect(first.isRemoved(GREAT_GRANDCHILD_ID)).toBe(true)
    expect(() =>
      addNode(first, nodeId(7), GREAT_GRANDCHILD_ID, 'b8c6'),
    ).toThrow(/below removed game node/)
  })

  test('comment deletion beats a concurrent edit while replacement preserves a concurrent insertion', () => {
    const editDeleteSeed = createDocument()
    addNode(editDeleteSeed, FIRST_ID, ROOT_ID, 'e2e4', {
      comments: ['base'],
    })
    const [edited, deleted] = convergedPair(
      editDeleteSeed,
      document => document.editComment(FIRST_ID, 0, 'edited'),
      document => {
        document.removeComment(FIRST_ID, 0)
      },
    )
    expectConverged(edited, deleted, [ROOT_ID, FIRST_ID])
    expect(edited.getComments(FIRST_ID)).toEqual([])

    const replaceInsertSeed = createDocument()
    addNode(replaceInsertSeed, FIRST_ID, ROOT_ID, 'e2e4', {
      comments: ['base'],
    })
    const [replaced, inserted] = convergedPair(
      replaceInsertSeed,
      document => document.setComments(FIRST_ID, ['replacement']),
      document => document.insertComment(FIRST_ID, 1, 'concurrent'),
    )
    expectConverged(replaced, inserted, [ROOT_ID, FIRST_ID])
    expect(replaced.getComments(FIRST_ID)).toHaveLength(2)
    expect(new Set(replaced.getComments(FIRST_ID))).toEqual(
      new Set(['replacement', 'concurrent']),
    )
  })

  test('NAG sets and canonical header records converge', () => {
    const seed = createDocument()
    const [first, second] = convergedPair(
      seed,
      document => {
        document.addNag(ROOT_ID, 1)
        document.setHeader('Event', 'Alice event')
        document.setHeader('White', 'Alice')
      },
      document => {
        document.addNag(ROOT_ID, 3)
        document.setHeader('Event', 'Bob event')
        document.setHeader('Black', 'Bob')
      },
    )

    expectConverged(first, second, [ROOT_ID])
    expect(first.getNags(ROOT_ID)).toEqual([1, 3])
    const eventEntries = first
      .getHeaderEntries()
      .filter(([name]) => name === 'Event')
    expect(eventEntries).toHaveLength(1)
    expect(['Alice event', 'Bob event']).toContain(eventEntries[0]?.[1])
    expect(first.getHeader('White')).toBe('Alice')
    expect(first.getHeader('Black')).toBe('Bob')
  })
})

describe('YjsGameDocument boundaries and notifications', () => {
  test('publishes binary history but no semantic event for a net-zero outer transaction', () => {
    const document = createDocument()
    const revision = document.revision
    const origin = Object.freeze({ actorId: 'alice' })
    const changeEvents: GameDocumentChangeEvent[] = []
    const updateEvents: Array<{ update: Uint8Array; origin: unknown }> = []
    document.subscribe(event => changeEvents.push(event))
    document.subscribeUpdates(event => updateEvents.push(event))

    document.transact(
      () => {
        document.setHeader('Temporary', 'value')
        document.deleteHeader('Temporary')
      },
      { origin },
    )

    expect(document.getHeader('Temporary')).toBeUndefined()
    expect(document.revision).toBe(revision)
    expect(changeEvents).toEqual([])
    expect(updateEvents).toHaveLength(1)
    expect(updateEvents[0]?.origin).toBe(origin)
    expect(updateEvents[0]?.update.byteLength).toBeGreaterThan(0)
  })

  test('reports only the parent whose visible child order changed for a variation reorder', () => {
    const document = createDocument()
    addNode(document, FIRST_ID, ROOT_ID, 'e2e4')
    addNode(document, SECOND_ID, ROOT_ID, 'd2d4')
    addNode(document, THIRD_ID, ROOT_ID, 'c2c4')
    const revision = document.revision
    const changeEvents: GameDocumentChangeEvent[] = []
    document.subscribe(event => changeEvents.push(event))

    document.moveChild(ROOT_ID, THIRD_ID, 0)

    expect(document.getChildIds(ROOT_ID)).toEqual([
      THIRD_ID,
      FIRST_ID,
      SECOND_ID,
    ])
    expect(changeEvents).toEqual([
      {
        revision: revision + 1,
        origin: undefined,
        categories: ['structure'],
        changedNodeIds: [ROOT_ID],
        changedHeaderNames: [],
      },
    ])
  })

  test('preserves exact local and remote origins in one semantic event', () => {
    const document = createDocument()
    // Incremental updates are meaningful only for replicas that share the
    // same genesis history.
    const target = forkDocument(document)
    const changeEvents: GameDocumentChangeEvent[] = []
    const updateEvents: Array<{ update: Uint8Array; origin: unknown }> = []
    document.subscribe(event => changeEvents.push(event))
    document.subscribeUpdates(event => updateEvents.push(event))
    const actorOrigin = Object.freeze({ actorId: 'alice' })

    document.transact(
      () => {
        document.setHeader('Event', 'Analysis')
        document.insertComment(ROOT_ID, 0, 'candidate')
      },
      { origin: actorOrigin },
    )

    expect(changeEvents).toHaveLength(1)
    expect(changeEvents[0]).toMatchObject({
      revision: 1,
      origin: actorOrigin,
      categories: [
        'comments',
        'headers',
      ] satisfies GameDocumentChangeCategory[],
      changedNodeIds: [ROOT_ID],
      changedHeaderNames: ['Event'],
    })
    expect(updateEvents).toHaveLength(1)
    expect(updateEvents[0]?.origin).toBe(actorOrigin)

    const providerOrigin = Object.freeze({ provider: 'test' })
    const targetChanges: GameDocumentChangeEvent[] = []
    const targetUpdates: Array<{ origin: unknown }> = []
    target.subscribe(event => targetChanges.push(event))
    target.subscribeUpdates(event => targetUpdates.push(event))
    apply(target, updateEvents[0]?.update as Uint8Array, providerOrigin)
    expect(targetChanges).toHaveLength(1)
    expect(targetChanges[0]?.origin).toBe(providerOrigin)
    expect(targetUpdates).toHaveLength(1)
    expect(targetUpdates[0]?.origin).toBe(providerOrigin)
  })

  test('distinguishes an explicit null origin from an omitted origin', () => {
    const document = createDocument()
    const changeOrigins: unknown[] = []
    const updateOrigins: unknown[] = []
    document.subscribe(event => changeOrigins.push(event.origin))
    document.subscribeUpdates(event => updateOrigins.push(event.origin))

    document.transact(() => document.setHeader('Event', 'Null origin'), {
      origin: null,
    })
    document.setHeader('Site', 'Omitted origin')

    expect(changeOrigins).toEqual([null, undefined])
    expect(updateOrigins).toEqual([null, undefined])
  })

  test('reports accepted-update listener failures after commit without redelivery on retry', () => {
    const source = createDocument()
    const target = forkDocument(source)
    const update = captureSingleUpdate(source, () => {
      source.setHeader('Event', 'Committed analysis')
    })
    const origin = Object.freeze({ provider: 'test' })
    const semanticFailure = new Error('semantic listener failed')
    const updateFailure = new Error('update listener failed')
    const observations: Array<{
      readonly listener: string
      readonly revision: number
      readonly value: string | undefined
      readonly origin: unknown
    }> = []
    const observe = (listener: string, eventOrigin: unknown): void => {
      observations.push({
        listener,
        revision: target.revision,
        value: target.getHeader('Event'),
        origin: eventOrigin,
      })
    }

    target.subscribe(event => {
      observe('semantic-throwing', event.origin)
      throw semanticFailure
    })
    target.subscribe(event => observe('semantic-observing', event.origin))
    target.subscribeUpdates(event => {
      observe('update-throwing', event.origin)
      throw updateFailure
    })
    target.subscribeUpdates(event => observe('update-observing', event.origin))

    let failure: unknown
    try {
      apply(target, update, origin)
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([
      semanticFailure,
      updateFailure,
    ])
    expect(target.getHeader('Event')).toBe('Committed analysis')
    expect(target.revision).toBe(1)
    expect(bytes(target.encodeStateVector())).toEqual(
      bytes(source.encodeStateVector()),
    )
    expect(observations).toEqual(
      [
        'semantic-throwing',
        'semantic-observing',
        'update-throwing',
        'update-observing',
      ].map(listener => ({
        listener,
        revision: 1,
        value: 'Committed analysis',
        origin,
      })),
    )

    expect(() => apply(target, update, { retry: true })).not.toThrow()
    expect(target.revision).toBe(1)
    expect(observations).toHaveLength(4)
  })

  test('rejects immutable move and tombstone changes without publication', () => {
    const document = createDocument()
    addNode(document, FIRST_ID, ROOT_ID, 'e2e4')

    const raw = rawReplica(document.encodeStateAsUpdate())
    const beforeMutation = Y.encodeStateVector(raw)
    const root = raw.getMap<unknown>(ROOT_TYPE_NAME)
    const nodes = root.get('nodes') as Y.Map<Y.Map<unknown>>
    ;(nodes.get(FIRST_ID) as Y.Map<unknown>).set('moveUci', 'd2d4')
    const changedMove = Y.encodeStateAsUpdate(raw, beforeMutation)
    raw.destroy()

    const before = fingerprint(document, [ROOT_ID, FIRST_ID])
    const revision = document.revision
    const listener = vi.fn()
    document.subscribe(listener)
    expect(() => apply(document, changedMove)).toThrow(
      /cannot change parentId or moveUci/,
    )
    expect(fingerprint(document, [ROOT_ID, FIRST_ID])).toBe(before)
    expect(document.revision).toBe(revision)
    expect(listener).not.toHaveBeenCalled()

    document.removeChild(ROOT_ID, FIRST_ID)
    const removedState = document.encodeStateAsUpdate()
    const rawRemoved = rawReplica(removedState)
    const beforeClear = Y.encodeStateVector(rawRemoved)
    const removedRoot = rawRemoved.getMap<unknown>(ROOT_TYPE_NAME)
    const tombstones = removedRoot.get('tombstones') as Y.Map<boolean>
    tombstones.delete(FIRST_ID)
    const clearedTombstone = Y.encodeStateAsUpdate(rawRemoved, beforeClear)
    rawRemoved.destroy()

    expect(() => apply(document, clearedTombstone)).toThrow(
      /cannot clear tombstone/,
    )
    expect(document.isRemoved(FIRST_ID)).toBe(true)
  })

  test('rejects replacement of an existing comments shared type atomically', () => {
    const document = createDocument()
    addNode(document, FIRST_ID, ROOT_ID, 'e2e4', {
      comments: ['same visible comment'],
    })
    const update = forgedUpdate(document, raw => {
      const root = raw.getMap<unknown>(ROOT_TYPE_NAME)
      const nodes = root.get('nodes') as Y.Map<Y.Map<unknown>>
      const first = nodes.get(FIRST_ID) as Y.Map<unknown>
      first.set(
        'comments',
        copyCommentArray(first.get('comments') as Y.Array<Y.Map<unknown>>),
      )
    })

    expectRejectedAtomically(document, update, [ROOT_ID, FIRST_ID])
    expect(document.getComments(FIRST_ID)).toEqual(['same visible comment'])
  })

  test.each([
    {
      name: 'root nodes map',
      replace(root: Y.Map<unknown>): void {
        root.set(
          'nodes',
          copyNodesMap(root.get('nodes') as Y.Map<Y.Map<unknown>>),
        )
      },
    },
    {
      name: 'root headers array',
      replace(root: Y.Map<unknown>): void {
        root.set(
          'headers',
          copyHeadersArray(root.get('headers') as Y.Array<Y.Map<unknown>>),
        )
      },
    },
    {
      name: 'root tombstones map',
      replace(root: Y.Map<unknown>): void {
        root.set(
          'tombstones',
          copyBooleanMap(root.get('tombstones') as Y.Map<boolean>),
        )
      },
    },
    {
      name: 'existing node record',
      replace(root: Y.Map<unknown>): void {
        const nodes = root.get('nodes') as Y.Map<Y.Map<unknown>>
        nodes.set(FIRST_ID, copyNodeMap(nodes.get(FIRST_ID) as Y.Map<unknown>))
      },
    },
    {
      name: 'existing child placements array',
      replace(root: Y.Map<unknown>): void {
        const nodes = root.get('nodes') as Y.Map<Y.Map<unknown>>
        const first = nodes.get(FIRST_ID) as Y.Map<unknown>
        first.set(
          'childPlacements',
          copyStringArray(first.get('childPlacements') as Y.Array<string>),
        )
      },
    },
    {
      name: 'existing NAG map',
      replace(root: Y.Map<unknown>): void {
        const nodes = root.get('nodes') as Y.Map<Y.Map<unknown>>
        const first = nodes.get(FIRST_ID) as Y.Map<unknown>
        first.set('nags', copyBooleanMap(first.get('nags') as Y.Map<boolean>))
      },
    },
  ])('rejects replacement of $name', ({ replace }) => {
    const seed = replacementSeedDocument()
    const document = forkDocument(seed)
    const update = forgedUpdate(document, raw => {
      replace(raw.getMap<unknown>(ROOT_TYPE_NAME))
    })

    expectRejectedAtomically(document, update, [
      ROOT_ID,
      FIRST_ID,
      SECOND_ID,
      GRANDCHILD_ID,
    ])
  })

  test('rejects an update that introduces an unknown top-level shared type', () => {
    const document = createDocument({ headers: [['Event', 'Before']] })
    const update = forgedUpdate(document, raw => {
      raw.getMap<unknown>('unsupported/game-data').set('payload', 'unexpected')
    })

    expectRejectedAtomically(document, update, [ROOT_ID])
  })

  test('rejects insert-then-delete history for an unknown large root field', () => {
    const document = createDocument({ headers: [['Event', 'Before']] })
    const update = forgedUpdate(document, raw => {
      const root = raw.getMap<unknown>(ROOT_TYPE_NAME)
      const payload = new Uint8Array(256 * 1024)
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] = index % 251
      }
      root.set('unsupportedLargePayload', payload)
      root.delete('unsupportedLargePayload')
    })

    // The forbidden field is absent from the converged map, but its operation
    // and payload remain in the encoded CRDT history.
    expect(update.byteLength).toBeGreaterThan(256 * 1024)
    expectRejectedAtomically(document, update, [ROOT_ID])
  })

  test('rejects transient placement of an existing child under the wrong parent', () => {
    const document = createDocument()
    addNode(document, FIRST_ID, ROOT_ID, 'e2e4')
    addNode(document, SECOND_ID, ROOT_ID, 'd2d4')
    addNode(document, GRANDCHILD_ID, FIRST_ID, 'e7e5')
    const update = forgedUpdate(document, raw => {
      const root = raw.getMap<unknown>(ROOT_TYPE_NAME)
      const nodes = root.get('nodes') as Y.Map<Y.Map<unknown>>
      const wrongParent = nodes.get(SECOND_ID) as Y.Map<unknown>
      const placements = wrongParent.get('childPlacements') as Y.Array<string>
      placements.insert(0, [GRANDCHILD_ID])
      placements.delete(0, 1)
    })

    expectRejectedAtomically(document, update, [
      ROOT_ID,
      FIRST_ID,
      SECOND_ID,
      GRANDCHILD_ID,
    ])
  })

  test('rejects a tombstoned non-root node that was never placed', () => {
    const document = createDocument()
    const update = forgedUpdate(document, raw => {
      const root = raw.getMap<unknown>(ROOT_TYPE_NAME)
      const nodes = root.get('nodes') as Y.Map<Y.Map<unknown>>
      nodes.set(FIRST_ID, emptyNodeMap(ROOT_ID, 'e2e4'))
      const tombstones = root.get('tombstones') as Y.Map<boolean>
      tombstones.set(FIRST_ID, true)
    })

    expectRejectedAtomically(document, update, [ROOT_ID, FIRST_ID])
  })

  test('rejects a tombstone without deletion of the live parent placement', () => {
    const document = createDocument()
    addNode(document, FIRST_ID, ROOT_ID, 'e2e4')
    const update = forgedUpdate(document, raw => {
      const root = raw.getMap<unknown>(ROOT_TYPE_NAME)
      const tombstones = root.get('tombstones') as Y.Map<boolean>
      tombstones.set(FIRST_ID, true)
    })

    expectRejectedAtomically(document, update, [ROOT_ID, FIRST_ID])
  })

  test('rejects both conflicting offline definitions of one node ID regardless of the Yjs map winner', () => {
    const seed = createDocument()
    const baseline = seed.encodeStateVector()
    const first = forkDocument(seed)
    const second = forkDocument(seed)
    addNode(first, FIRST_ID, ROOT_ID, 'e2e4')
    addNode(second, FIRST_ID, ROOT_ID, 'd2d4')
    const firstUpdate = differentialUpdate(first, baseline)
    const secondUpdate = differentialUpdate(second, baseline)

    expectRejectedAtomically(first, secondUpdate, [ROOT_ID, FIRST_ID])
    expectRejectedAtomically(second, firstUpdate, [ROOT_ID, FIRST_ID])
    expect(first.getMoveUci(FIRST_ID)).toBe('e2e4')
    expect(second.getMoveUci(FIRST_ID)).toBe('d2d4')
  })

  test('rejects malformed binary atomically', () => {
    const document = createDocument({ headers: [['Event', 'Before']] })
    const before = fingerprint(document, [ROOT_ID])
    const beforeVector = bytes(document.encodeStateVector())
    const changeListener = vi.fn()
    const updateListener = vi.fn()
    document.subscribe(changeListener)
    document.subscribeUpdates(updateListener)

    expect(() => apply(document, new Uint8Array([255, 255, 255]))).toThrow()
    expect(fingerprint(document, [ROOT_ID])).toBe(before)
    expect(bytes(document.encodeStateVector())).toEqual(beforeVector)
    expect(document.revision).toBe(0)
    expect(changeListener).not.toHaveBeenCalled()
    expect(updateListener).not.toHaveBeenCalled()
  })
})

describe('YjsGameDocument structural stress', () => {
  test('builds, reloads, and materializes a 4,000-ply lineage through public operations', () => {
    const depth = 4_000
    const document = createDocument()
    const ids: GameNodeId[] = [ROOT_ID]
    let parentId = ROOT_ID

    document.transact(() => {
      for (let index = 0; index < depth; index += 1) {
        const id = nodeId(10_000 + index)
        addNode(document, id, parentId, 'a2a3')
        ids.push(id)
        parentId = id
      }
    })

    const lastId = ids.at(-1) as GameNodeId
    const penultimateId = ids.at(-2) as GameNodeId
    expect(document.getParentId(lastId)).toBe(penultimateId)
    expect(document.getMoveUci(lastId)).toBe('a2a3')
    expect(document.getChildIds(penultimateId)).toEqual([lastId])

    const reloaded = loadDocument(document.encodeStateAsUpdate())
    expect(reloaded.getParentId(lastId)).toBe(penultimateId)
    expect(bytes(reloaded.encodeStateVector())).toEqual(
      bytes(document.encodeStateVector()),
    )

    const game = new pgn.Game(null, { document: reloaded })
    const last = game.nodeById(lastId) as pgn.ChildNode
    expect(last.nodeId).toBe(lastId)
    expect(last.parent.nodeId).toBe(penultimateId)
    expect(game.nodeById(lastId)).toBe(last)
  }, 30_000)

  test('loads and materializes a 4,000-ply lineage without recursive traversal', () => {
    const depth = 4_000
    const { update, ids } = deepLineageUpdate(depth)
    const document = loadDocument(update)
    const game = new pgn.Game(null, { document })
    const lastId = ids.at(-1) as GameNodeId

    const last = game.nodeById(lastId)
    expect(last.nodeId).toBe(lastId)
    expect(game.nodeById(lastId)).toBe(last)
    expect(document.getParentId(lastId)).toBe(ids.at(-2))
  }, 30_000)

  test('converges a seeded three-replica mixed-operation smoke test', () => {
    const seed = createDocument()
    addNode(seed, FIRST_ID, ROOT_ID, 'e2e4')
    addNode(seed, SECOND_ID, ROOT_ID, 'd2d4')
    addNode(seed, THIRD_ID, ROOT_ID, 'c2c4')
    const baselineVector = seed.encodeStateVector()
    const replicas = [
      forkDocument(seed),
      forkDocument(seed),
      forkDocument(seed),
    ]
    const allNodeIds: GameNodeId[] = [ROOT_ID, FIRST_ID, SECOND_ID, THIRD_ID]

    replicas.forEach((document, actorIndex) => {
      const random = seededRandom(0x5eed + actorIndex)
      document.transact(
        () => {
          for (let operation = 0; operation < 18; operation += 1) {
            const choice = Math.floor(random() * 5)
            if (choice === 0) {
              document.setHeader(
                `Tag${Math.floor(random() * 3)}`,
                `actor-${actorIndex}-operation-${operation}`,
              )
            } else if (choice === 1) {
              document.insertComment(
                FIRST_ID,
                document.getComments(FIRST_ID).length,
                `comment-${actorIndex}-${operation}`,
              )
            } else if (choice === 2) {
              const nag = Math.floor(random() * 5)
              if (random() < 0.5) {
                document.addNag(SECOND_ID, nag)
              } else {
                document.removeNag(SECOND_ID, nag)
              }
            } else if (choice === 3) {
              const children = document.getChildIds(ROOT_ID)
              const child = children[Math.floor(random() * children.length)]
              const index = Math.floor(random() * children.length)
              document.moveChild(ROOT_ID, child as GameNodeId, index)
            } else {
              const id = nodeId(100 + actorIndex * 100 + operation)
              if (!document.hasNode(id)) {
                addNode(
                  document,
                  id,
                  ROOT_ID,
                  ['g1f3', 'b1c3', 'e2e4'][actorIndex] as string,
                )
                allNodeIds.push(id)
              }
            }
          }
        },
        { origin: `actor-${actorIndex}` },
      )
    })

    const updates = replicas.map(document =>
      differentialUpdate(document, baselineVector),
    )
    const deliveryOrders = [
      [1, 2, 0],
      [2, 0, 1],
      [0, 1, 2],
    ] as const
    replicas.forEach((document, replicaIndex) => {
      for (const updateIndex of deliveryOrders[replicaIndex]) {
        apply(document, updates[updateIndex] as Uint8Array)
      }
    })

    const uniqueNodeIds = [...new Set(allNodeIds)]
    expectConverged(replicas[0], replicas[1], uniqueNodeIds)
    expectConverged(replicas[1], replicas[2], uniqueNodeIds)
  })
})

const rawReplica = (update: Uint8Array): Y.Doc => {
  const document = new Y.Doc({ gc: false })
  document.getMap<unknown>(ROOT_TYPE_NAME)
  Y.applyUpdate(document, update)
  return document
}

const forgedUpdate = (
  source: YjsGameDocument,
  mutate: (document: Y.Doc) => void,
): Uint8Array => {
  const raw = rawReplica(source.encodeStateAsUpdate())
  try {
    const stateVector = Y.encodeStateVector(raw)
    raw.transact(() => mutate(raw))
    return Y.encodeStateAsUpdate(raw, stateVector)
  } finally {
    raw.destroy()
  }
}

const expectRejectedAtomically = (
  document: YjsGameDocument,
  update: Uint8Array,
  nodeIds: readonly GameNodeId[],
): void => {
  const state = fingerprint(document, nodeIds)
  const stateVector = bytes(document.encodeStateVector())
  const revision = document.revision
  const changeListener = vi.fn()
  const updateListener = vi.fn()
  const unsubscribeChanges = document.subscribe(changeListener)
  const unsubscribeUpdates = document.subscribeUpdates(updateListener)
  try {
    expect(() => apply(document, update)).toThrow()
  } finally {
    unsubscribeChanges()
    unsubscribeUpdates()
  }
  expect(fingerprint(document, nodeIds)).toBe(state)
  expect(bytes(document.encodeStateVector())).toEqual(stateVector)
  expect(document.revision).toBe(revision)
  expect(changeListener).not.toHaveBeenCalled()
  expect(updateListener).not.toHaveBeenCalled()
}

const copyStringArray = (source: Y.Array<string>): Y.Array<string> => {
  const copy = new Y.Array<string>()
  const values = source.toArray()
  if (values.length !== 0) {
    copy.insert(0, values)
  }
  return copy
}

const copyCommentArray = (
  source: Y.Array<Y.Map<unknown>>,
): Y.Array<Y.Map<unknown>> => {
  const copy = new Y.Array<Y.Map<unknown>>()
  const entries = source.toArray().map(entry => {
    const entryCopy = new Y.Map<unknown>()
    entryCopy.set('text', entry.get('text'))
    return entryCopy
  })
  if (entries.length !== 0) {
    copy.insert(0, entries)
  }
  return copy
}

const copyBooleanMap = (source: Y.Map<boolean>): Y.Map<boolean> =>
  new Y.Map<boolean>(source.entries())

const copyHeadersArray = (
  source: Y.Array<Y.Map<unknown>>,
): Y.Array<Y.Map<unknown>> => {
  const copy = new Y.Array<Y.Map<unknown>>()
  const entries = source.toArray().map(entry => {
    const entryCopy = new Y.Map<unknown>()
    entryCopy.set('name', entry.get('name'))
    entryCopy.set('value', entry.get('value'))
    return entryCopy
  })
  if (entries.length !== 0) {
    copy.insert(0, entries)
  }
  return copy
}

const copyNodeMap = (source: Y.Map<unknown>): Y.Map<unknown> => {
  const copy = new Y.Map<unknown>()
  copy.set('parentId', source.get('parentId'))
  copy.set('moveUci', source.get('moveUci'))
  copy.set(
    'childPlacements',
    copyStringArray(source.get('childPlacements') as Y.Array<string>),
  )
  copy.set(
    'comments',
    copyCommentArray(source.get('comments') as Y.Array<Y.Map<unknown>>),
  )
  copy.set(
    'startingComments',
    copyCommentArray(source.get('startingComments') as Y.Array<Y.Map<unknown>>),
  )
  copy.set('nags', copyBooleanMap(source.get('nags') as Y.Map<boolean>))
  return copy
}

const copyNodesMap = (source: Y.Map<Y.Map<unknown>>): Y.Map<Y.Map<unknown>> =>
  new Y.Map<Y.Map<unknown>>(
    [...source.entries()].map(([id, node]) => [id, copyNodeMap(node)]),
  )

const replacementSeedDocument = (): YjsGameDocument => {
  const document = createDocument({ headers: [['Event', 'Identity test']] })
  addNode(document, FIRST_ID, ROOT_ID, 'e2e4', {
    comments: ['candidate'],
    nags: [1, 3],
  })
  addNode(document, GRANDCHILD_ID, FIRST_ID, 'e7e5')
  addNode(document, SECOND_ID, ROOT_ID, 'd2d4')
  document.removeChild(ROOT_ID, SECOND_ID)
  return document
}

const emptyNodeMap = (
  parentId: GameNodeId | null,
  moveUci: string | null,
  childId?: GameNodeId,
): Y.Map<unknown> => {
  const childPlacements = new Y.Array<string>()
  if (childId !== undefined) {
    childPlacements.insert(0, [childId])
  }
  const node = new Y.Map<unknown>()
  node.set('parentId', parentId)
  node.set('moveUci', moveUci)
  node.set('childPlacements', childPlacements)
  node.set('comments', new Y.Array<Y.Map<unknown>>())
  node.set('startingComments', new Y.Array<Y.Map<unknown>>())
  node.set('nags', new Y.Map<boolean>())
  return node
}

const deepLineageUpdate = (
  depth: number,
): { readonly update: Uint8Array; readonly ids: readonly GameNodeId[] } => {
  const document = new Y.Doc({ gc: false })
  const root = document.getMap<unknown>(ROOT_TYPE_NAME)
  const ids = Array.from({ length: depth + 1 }, (_, index) =>
    nodeId(10_000 + index),
  )
  document.transact(() => {
    const nodes = new Y.Map<Y.Map<unknown>>()
    ids.forEach((id, index) => {
      const parentId = index === 0 ? null : (ids[index - 1] as GameNodeId)
      const moveUci = index === 0 ? null : index % 2 === 0 ? 'e7e5' : 'e2e4'
      nodes.set(id, emptyNodeMap(parentId, moveUci, ids[index + 1]))
    })
    root.set('schemaVersion', YJS_GAME_DOCUMENT_SCHEMA_VERSION)
    root.set('rootId', ids[0])
    root.set('nodes', nodes)
    root.set('headers', new Y.Array<Y.Map<unknown>>())
    root.set('tombstones', new Y.Map<boolean>())
  })
  const update = Y.encodeStateAsUpdate(document)
  document.destroy()
  return { update, ids }
}

const seededRandom =
  (seed: number): (() => number) =>
  () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
    return seed / 0x1_0000_0000
  }
