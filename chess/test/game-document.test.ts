import { describe, expect, test, vi } from 'vitest'

import {
  MemoryGameDocument,
  type GameDocumentChangeEvent,
} from '../game-document'
import { parseGameNodeId, type GameNodeId } from '../game-node-id'

const nodeId = (value: number): GameNodeId =>
  parseGameNodeId(
    `00000000-0000-0000-0000-${value.toString().padStart(12, '0')}`,
  )

const invalidNodeId = (value: string): GameNodeId => value as GameNodeId

const captureThrown = (callback: () => unknown): unknown => {
  try {
    callback()
  } catch (error) {
    return error
  }
  throw new Error('Expected callback to throw')
}

const addNode = (
  document: MemoryGameDocument,
  id: GameNodeId,
  parentId: GameNodeId = document.rootId,
  moveUci = 'e2e4',
): void => {
  document.addNode({
    nodeId: id,
    parentId,
    moveUci,
    comments: [],
    startingComments: [],
    nags: [],
  })
}

describe('MemoryGameDocument ownership and snapshots', () => {
  test('copies every caller-owned input and returns frozen snapshots', () => {
    const rootId = nodeId(1)
    const rootComments = ['root comment']
    const rootStartingComments = ['root starting comment']
    const rootNags = new Set([3, 1, 3])
    const headers: Array<readonly [string, string]> = [
      ['Event', 'Original'],
    ]
    const document = new MemoryGameDocument(rootId, {
      comments: rootComments,
      startingComments: rootStartingComments,
      nags: rootNags,
      headers,
    })

    rootComments[0] = 'changed by caller'
    rootStartingComments.push('changed by caller')
    rootNags.add(9)
    headers[0] = ['Event', 'Changed by caller']
    headers.push(['Site', 'Changed by caller'])

    expect(document.getComments(rootId)).toEqual(['root comment'])
    expect(document.getStartingComments(rootId)).toEqual([
      'root starting comment',
    ])
    expect(document.getNags(rootId)).toEqual([1, 3])
    expect(document.getHeaderEntries()).toEqual([['Event', 'Original']])

    const childId = nodeId(2)
    const comments = ['one']
    const startingComments = ['before']
    const nags = new Set([7, 2, 7])
    document.addNode({
      nodeId: childId,
      parentId: rootId,
      moveUci: 'e2e4',
      comments,
      startingComments,
      nags,
    })
    comments.push('two')
    startingComments[0] = 'changed'
    nags.add(10)

    const childIds = document.getChildIds(rootId)
    const commentSnapshot = document.getComments(childId)
    const startingCommentSnapshot = document.getStartingComments(childId)
    const nagSnapshot = document.getNags(childId)
    const headerSnapshot = document.getHeaderEntries()

    expect(childIds).toEqual([childId])
    expect(commentSnapshot).toEqual(['one'])
    expect(startingCommentSnapshot).toEqual(['before'])
    expect(nagSnapshot).toEqual([2, 7])
    expect(Object.isFrozen(childIds)).toBe(true)
    expect(Object.isFrozen(commentSnapshot)).toBe(true)
    expect(Object.isFrozen(startingCommentSnapshot)).toBe(true)
    expect(Object.isFrozen(nagSnapshot)).toBe(true)
    expect(Object.isFrozen(headerSnapshot)).toBe(true)
    expect(Object.isFrozen(headerSnapshot[0])).toBe(true)

    document.insertComment(childId, 1, 'later')
    document.insertStartingComment(childId, 1, 'later')
    document.addNag(childId, 8)
    document.setHeader('Site', 'Later')
    addNode(document, nodeId(3))

    expect(childIds).toEqual([childId])
    expect(commentSnapshot).toEqual(['one'])
    expect(startingCommentSnapshot).toEqual(['before'])
    expect(nagSnapshot).toEqual([2, 7])
    expect(headerSnapshot).toEqual([['Event', 'Original']])
  })

  test('copies replacement annotation inputs before retaining them', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const comments = ['comment']
    const startingComments = ['starting']
    const nags = new Set([4, 2])

    document.setComments(document.rootId, comments)
    document.setStartingComments(document.rootId, startingComments)
    document.setNags(document.rootId, nags)
    comments[0] = 'caller mutation'
    startingComments[0] = 'caller mutation'
    nags.add(8)

    expect(document.getComments(document.rootId)).toEqual(['comment'])
    expect(document.getStartingComments(document.rootId)).toEqual([
      'starting',
    ])
    expect(document.getNags(document.rootId)).toEqual([2, 4])
  })

  test('preserves header insertion order while updating in place', () => {
    const document = new MemoryGameDocument(nodeId(1), {
      headers: [
        ['Event', 'One'],
        ['Site', 'Two'],
        ['Event', 'Updated'],
      ],
    })

    expect(document.getHeaderEntries()).toEqual([
      ['Event', 'Updated'],
      ['Site', 'Two'],
    ])

    document.setHeader('Event', 'Again')
    document.setHeader('Date', '2026.07.22')
    expect(document.getHeaderEntries()).toEqual([
      ['Event', 'Again'],
      ['Site', 'Two'],
      ['Date', '2026.07.22'],
    ])

    expect(document.deleteHeader('Site')).toBe(true)
    document.setHeader('Site', 'Reinserted')
    expect(document.getHeaderEntries()).toEqual([
      ['Event', 'Again'],
      ['Date', '2026.07.22'],
      ['Site', 'Reinserted'],
    ])
  })
})

describe('MemoryGameDocument boundaries', () => {
  test('rejects malformed constructor state', () => {
    expect(() => new MemoryGameDocument(invalidNodeId('not-a-uuid'))).toThrow(
      /GameNodeId/,
    )
    expect(
      () =>
        new MemoryGameDocument(nodeId(1), {
          comments: ['valid', 7] as unknown as string[],
        }),
    ).toThrow(/Comments/)
    expect(
      () =>
        new MemoryGameDocument(nodeId(1), {
          startingComments: [null] as unknown as string[],
        }),
    ).toThrow(/Starting comments/)
    expect(
      () =>
        new MemoryGameDocument(nodeId(1), {
          nags: [1.5],
        }),
    ).toThrow(/NAGs/)
    expect(
      () =>
        new MemoryGameDocument(nodeId(1), {
          headers: [['Invalid Header', 'value']],
        }),
    ).toThrow(/header name/)
    expect(
      () =>
        new MemoryGameDocument(nodeId(1), {
          headers: [['Event', 'line one\nline two']],
        }),
    ).toThrow(/line breaks/)
    expect(
      () =>
        new MemoryGameDocument(nodeId(1), {
          headers: [['Event'] as unknown as [string, string]],
        }),
    ).toThrow(/\[name, value\]/)
  })

  test('rejects malformed node input before any mutation or notification', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const listener = vi.fn()
    document.subscribe(listener)

    const expectUnchanged = (callback: () => unknown): void => {
      expect(callback).toThrow()
      expect(document.revision).toBe(0)
      expect(document.getChildIds(document.rootId)).toEqual([])
      expect(listener).not.toHaveBeenCalled()
    }

    expectUnchanged(() =>
      document.addNode({
        nodeId: invalidNodeId('BAD'),
        parentId: document.rootId,
        moveUci: 'e2e4',
        comments: [],
        startingComments: [],
        nags: [],
      }),
    )
    expectUnchanged(() =>
      document.addNode({
        nodeId: nodeId(2),
        parentId: invalidNodeId('BAD'),
        moveUci: 'e2e4',
        comments: [],
        startingComments: [],
        nags: [],
      }),
    )
    expectUnchanged(() =>
      document.addNode({
        nodeId: nodeId(2),
        parentId: document.rootId,
        moveUci: 'E2E4',
        comments: [],
        startingComments: [],
        nags: [],
      }),
    )
    expectUnchanged(() =>
      document.addNode({
        nodeId: nodeId(2),
        parentId: document.rootId,
        moveUci: 'e2e4',
        comments: ['valid', 7] as unknown as string[],
        startingComments: [],
        nags: [],
      }),
    )
    expectUnchanged(() =>
      document.addNode({
        nodeId: nodeId(2),
        parentId: document.rootId,
        moveUci: 'e2e4',
        comments: [],
        startingComments: [null] as unknown as string[],
        nags: [],
      }),
    )
    expectUnchanged(() =>
      document.addNode({
        nodeId: nodeId(2),
        parentId: document.rootId,
        moveUci: 'e2e4',
        comments: [],
        startingComments: [],
        nags: [Number.MAX_SAFE_INTEGER + 1],
      }),
    )
    expectUnchanged(() =>
      document.addNode(
        {
          nodeId: nodeId(2),
          parentId: document.rootId,
          moveUci: 'e2e4',
          comments: [],
          startingComments: [],
          nags: [],
        },
        { index: 1 },
      ),
    )

    function* throwingNags(): Generator<number> {
      yield 1
      throw new Error('iterable failed')
    }
    expectUnchanged(() =>
      document.addNode({
        nodeId: nodeId(2),
        parentId: document.rootId,
        moveUci: 'e2e4',
        comments: [],
        startingComments: [],
        nags: throwingNags(),
      }),
    )
  })

  test('rejects malformed annotation and header operations before mutation', () => {
    const document = new MemoryGameDocument(nodeId(1), {
      comments: ['comment'],
      startingComments: ['starting'],
      nags: [1],
      headers: [['Event', 'Original']],
    })
    const listener = vi.fn()
    document.subscribe(listener)

    const expectUnchanged = (callback: () => unknown): void => {
      expect(callback).toThrow()
      expect(document.revision).toBe(0)
      expect(document.getComments(document.rootId)).toEqual(['comment'])
      expect(document.getStartingComments(document.rootId)).toEqual([
        'starting',
      ])
      expect(document.getNags(document.rootId)).toEqual([1])
      expect(document.getHeaderEntries()).toEqual([['Event', 'Original']])
      expect(listener).not.toHaveBeenCalled()
    }

    expectUnchanged(() =>
      document.setComments(
        document.rootId,
        ['valid', false] as unknown as string[],
      ),
    )
    expectUnchanged(() =>
      document.insertComment(
        document.rootId,
        0,
        3 as unknown as string,
      ),
    )
    expectUnchanged(() =>
      document.editStartingComment(
        document.rootId,
        0,
        null as unknown as string,
      ),
    )
    expectUnchanged(() => document.removeComment(document.rootId, 1))
    expectUnchanged(() => document.setNags(document.rootId, [2, NaN]))
    expectUnchanged(() => document.addNag(document.rootId, 1.5))
    expectUnchanged(() =>
      document.removeNag(document.rootId, Number.POSITIVE_INFINITY),
    )
    expectUnchanged(() => document.setHeader('Invalid Header', 'value'))
    expectUnchanged(() => document.setHeader('Event', 'line one\rline two'))
    expectUnchanged(() =>
      document.getHeader(4 as unknown as string),
    )
    expectUnchanged(() =>
      document.hasNode(invalidNodeId('not-canonical')),
    )
  })
})

describe('MemoryGameDocument structure', () => {
  test('keeps duplicate same-move siblings as distinct ordered nodes', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const firstId = nodeId(2)
    const secondId = nodeId(3)

    addNode(document, firstId)
    addNode(document, secondId)

    expect(document.getChildIds(document.rootId)).toEqual([
      firstId,
      secondId,
    ])
    expect(document.getMoveUci(firstId)).toBe('e2e4')
    expect(document.getMoveUci(secondId)).toBe('e2e4')
    expect(document.getParentId(firstId)).toBe(document.rootId)
    expect(document.getParentId(secondId)).toBe(document.rootId)

    document.moveChild(document.rootId, secondId, 0)
    expect(document.getChildIds(document.rootId)).toEqual([
      secondId,
      firstId,
    ])
  })

  test('retains terminal tombstones and rejects structural writes below them', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const removedId = nodeId(2)
    const firstChildId = nodeId(3)
    const secondChildId = nodeId(4)
    addNode(document, removedId)
    addNode(document, firstChildId, removedId, 'e7e5')
    addNode(document, secondChildId, removedId, 'c7c5')

    expect(document.removeChild(document.rootId, removedId)).toBe(true)
    const revisionAfterRemoval = document.revision

    expect(document.hasNode(removedId)).toBe(true)
    expect(document.isRemoved(removedId)).toBe(true)
    expect(document.isRemoved(firstChildId)).toBe(true)
    expect(document.isRemoved(secondChildId)).toBe(true)
    expect(document.getParentId(removedId)).toBe(document.rootId)
    expect(document.getMoveUci(removedId)).toBe('e2e4')
    expect(document.getChildIds(removedId)).toEqual([
      firstChildId,
      secondChildId,
    ])
    expect(document.getChildIds(document.rootId)).toEqual([])

    expect(document.removeChild(document.rootId, removedId)).toBe(false)
    expect(document.revision).toBe(revisionAfterRemoval)
    expect(() => addNode(document, removedId)).toThrow(
      /Duplicate game node ID/,
    )
    expect(() =>
      addNode(document, nodeId(5), removedId, 'g8f6'),
    ).toThrow(/removed game node/)
    expect(() =>
      addNode(document, nodeId(6), firstChildId, 'g8f6'),
    ).toThrow(/removed game node/)
    expect(() =>
      document.moveChild(removedId, secondChildId, 0),
    ).toThrow(/removed game node/i)
    expect(document.getChildIds(removedId)).toEqual([
      firstChildId,
      secondChildId,
    ])
    expect(document.revision).toBe(revisionAfterRemoval)
  })

  test('rejects duplicate IDs and parent mismatches without changing order', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const firstId = nodeId(2)
    const secondId = nodeId(3)
    addNode(document, firstId)
    addNode(document, secondId)
    const revision = document.revision

    expect(() => addNode(document, firstId)).toThrow(/Duplicate game node ID/)
    expect(() =>
      document.moveChild(firstId, secondId, 0),
    ).toThrow(/belongs to/)
    expect(() => document.removeChild(firstId, secondId)).toThrow(/belongs to/)
    expect(document.getChildIds(document.rootId)).toEqual([
      firstId,
      secondId,
    ])
    expect(document.revision).toBe(revision)
  })
})

describe('MemoryGameDocument annotations', () => {
  test('supports granular ordered comment operations', () => {
    const document = new MemoryGameDocument(nodeId(1))

    document.insertComment(document.rootId, 0, 'second')
    document.insertComment(document.rootId, 0, 'first')
    document.insertComment(document.rootId, 2, 'third')
    document.editComment(document.rootId, 1, 'edited')
    expect(document.getComments(document.rootId)).toEqual([
      'first',
      'edited',
      'third',
    ])
    expect(document.removeComment(document.rootId, 1)).toBe('edited')
    expect(document.getComments(document.rootId)).toEqual(['first', 'third'])

    document.setComments(document.rootId, ['replacement', 'ordered'])
    expect(document.getComments(document.rootId)).toEqual([
      'replacement',
      'ordered',
    ])
  })

  test('supports granular ordered starting-comment operations', () => {
    const document = new MemoryGameDocument(nodeId(1))

    document.insertStartingComment(document.rootId, 0, 'second')
    document.insertStartingComment(document.rootId, 0, 'first')
    document.insertStartingComment(document.rootId, 2, 'third')
    document.editStartingComment(document.rootId, 1, 'edited')
    expect(document.getStartingComments(document.rootId)).toEqual([
      'first',
      'edited',
      'third',
    ])
    expect(document.removeStartingComment(document.rootId, 1)).toBe('edited')
    expect(document.getStartingComments(document.rootId)).toEqual([
      'first',
      'third',
    ])

    document.setStartingComments(document.rootId, [
      'replacement',
      'ordered',
    ])
    expect(document.getStartingComments(document.rootId)).toEqual([
      'replacement',
      'ordered',
    ])
  })

  test('deduplicates and numerically orders granular NAG operations', () => {
    const document = new MemoryGameDocument(nodeId(1))

    document.setNags(document.rootId, [10, 2, 10, 1])
    expect(document.getNags(document.rootId)).toEqual([1, 2, 10])
    expect(document.addNag(document.rootId, 5)).toBe(true)
    expect(document.addNag(document.rootId, 5)).toBe(false)
    expect(document.getNags(document.rootId)).toEqual([1, 2, 5, 10])
    expect(document.removeNag(document.rootId, 2)).toBe(true)
    expect(document.removeNag(document.rootId, 2)).toBe(false)
    expect(document.getNags(document.rootId)).toEqual([1, 5, 10])
    document.clearNags(document.rootId)
    expect(document.getNags(document.rootId)).toEqual([])
  })
})

describe('MemoryGameDocument transactions and notifications', () => {
  test('rejects promise-like transaction callbacks in types and at runtime', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const listener = vi.fn()
    document.subscribe(listener)

    if (false) {
      // @ts-expect-error Transactions must finish synchronously.
      document.transact(async () => 'async result')
      const promiseLike: PromiseLike<string> = Promise.resolve('result')
      // @ts-expect-error Promise-like callback results are not supported.
      document.transact(() => promiseLike)
      const maybePromise = (): string | Promise<string> => 'result'
      // @ts-expect-error A possibly asynchronous callback is not synchronous.
      document.transact(maybePromise)
    }

    // `any` callers remain source-compatible and are protected by the runtime
    // boundary instead of being falsely treated as definitely asynchronous.
    const hiddenThenableCallback: () => any = () => {
      document.setHeader('Event', 'Committed before rejection')
      return { then: (): void => undefined }
    }

    expect(() => document.transact(hiddenThenableCallback)).toThrowError(
      new TypeError(
        'Transaction callback must complete synchronously and must not return a promise or thenable',
      ),
    )
    expect(document.getHeader('Event')).toBe('Committed before rejection')
    expect(document.revision).toBe(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('emits one deterministic final-state event for nested transactions', () => {
    const document = new MemoryGameDocument(nodeId(9))
    const firstId = nodeId(3)
    const secondId = nodeId(2)
    const outerOrigin = { source: 'outer' }
    const events: GameDocumentChangeEvent[] = []
    const observedFinalStates: unknown[] = []
    document.subscribe(event => {
      events.push(event)
      observedFinalStates.push({
        children: document.getChildIds(document.rootId),
        comments: document.getComments(firstId),
        startingComments: document.getStartingComments(secondId),
        nags: document.getNags(secondId),
        headers: document.getHeaderEntries(),
      })
    })

    const result = document.transact(
      () => {
        document.setHeader('Zeta', 'last')
        addNode(document, firstId)
        document.transact(
          () => {
            addNode(document, secondId, document.rootId, 'd2d4')
            document.setStartingComments(secondId, ['starting'])
            document.setNags(secondId, [4])
          },
          { origin: { source: 'ignored inner origin' } },
        )
        document.setComments(firstId, ['comment'])
        document.setHeader('Alpha', 'first')
        return 'transaction result'
      },
      { origin: outerOrigin },
    )

    expect(result).toBe('transaction result')
    expect(document.revision).toBe(1)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      revision: 1,
      origin: outerOrigin,
      categories: [
        'structure',
        'comments',
        'starting-comments',
        'nags',
        'headers',
      ],
      changedNodeIds: [secondId, firstId, document.rootId],
      changedHeaderNames: ['Alpha', 'Zeta'],
    })
    expect(Object.isFrozen(events[0])).toBe(true)
    expect(Object.isFrozen(events[0].categories)).toBe(true)
    expect(Object.isFrozen(events[0].changedNodeIds)).toBe(true)
    expect(Object.isFrozen(events[0].changedHeaderNames)).toBe(true)
    expect(observedFinalStates).toEqual([
      {
        children: [firstId, secondId],
        comments: ['comment'],
        startingComments: ['starting'],
        nags: [4],
        headers: [
          ['Zeta', 'last'],
          ['Alpha', 'first'],
        ],
      },
    ])
  })

  test('does not revise or notify for semantic no-ops', () => {
    const document = new MemoryGameDocument(nodeId(1), {
      comments: ['same'],
      startingComments: ['same'],
      nags: [1],
      headers: [['Event', 'same']],
    })
    const childId = nodeId(2)
    addNode(document, childId)
    const initialRevision = document.revision
    const listener = vi.fn()
    document.subscribe(listener)

    document.transact(() => {
      document.setComments(document.rootId, ['same'])
      document.editComment(document.rootId, 0, 'same')
      document.setStartingComments(document.rootId, ['same'])
      document.editStartingComment(document.rootId, 0, 'same')
      document.setNags(document.rootId, [1, 1])
      expect(document.addNag(document.rootId, 1)).toBe(false)
      expect(document.removeNag(document.rootId, 2)).toBe(false)
      document.setHeader('Event', 'same')
      expect(document.deleteHeader('Missing')).toBe(false)
      document.moveChild(document.rootId, childId, 0)
      document.clearNags(childId)
    })

    expect(document.revision).toBe(initialRevision)
    expect(listener).not.toHaveBeenCalled()
  })

  test('does not revise or notify when an outer transaction restores its starting state', () => {
    const document = new MemoryGameDocument(nodeId(1), {
      comments: ['original comment'],
      startingComments: ['original starting comment'],
      nags: [1],
      headers: [['Event', 'Original']],
    })
    const firstId = nodeId(2)
    const secondId = nodeId(3)
    const thirdId = nodeId(4)
    addNode(document, firstId)
    addNode(document, secondId, document.rootId, 'd2d4')
    addNode(document, thirdId, document.rootId, 'c2c4')
    const initialRevision = document.revision
    const listener = vi.fn()
    document.subscribe(listener)

    document.transact(() => {
      document.setComments(document.rootId, ['temporary comment'])
      document.setComments(document.rootId, ['original comment'])
      document.setStartingComments(document.rootId, [
        'temporary starting comment',
      ])
      document.setStartingComments(document.rootId, [
        'original starting comment',
      ])
      document.addNag(document.rootId, 2)
      document.removeNag(document.rootId, 2)
      document.setHeader('Event', 'Temporary')
      document.setHeader('Event', 'Original')
      document.moveChild(document.rootId, firstId, 2)
      document.moveChild(document.rootId, firstId, 0)
    })

    expect(document.revision).toBe(initialRevision)
    expect(listener).not.toHaveBeenCalled()
    expect(document.getComments(document.rootId)).toEqual(['original comment'])
    expect(document.getStartingComments(document.rootId)).toEqual([
      'original starting comment',
    ])
    expect(document.getNags(document.rootId)).toEqual([1])
    expect(document.getHeaderEntries()).toEqual([['Event', 'Original']])
    expect(document.getChildIds(document.rootId)).toEqual([
      firstId,
      secondId,
      thirdId,
    ])
  })

  test('reports only the parent when a reorder changes no node facts', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const firstId = nodeId(2)
    const secondId = nodeId(3)
    const thirdId = nodeId(4)
    addNode(document, firstId)
    addNode(document, secondId, document.rootId, 'd2d4')
    addNode(document, thirdId, document.rootId, 'c2c4')
    const initialRevision = document.revision
    const events: GameDocumentChangeEvent[] = []
    document.subscribe(event => events.push(event))

    document.moveChild(document.rootId, firstId, 2)

    expect(document.revision).toBe(initialRevision + 1)
    expect(events).toEqual([
      {
        revision: initialRevision + 1,
        origin: undefined,
        categories: ['structure'],
        changedNodeIds: [document.rootId],
        changedHeaderNames: [],
      },
    ])
    expect(document.getChildIds(document.rootId)).toEqual([
      secondId,
      thirdId,
      firstId,
    ])
  })

  test('commits and notifies changes when a transaction callback throws', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const origin = Symbol('origin')
    const listener = vi.fn()
    document.subscribe(listener)

    expect(() =>
      document.transact(
        () => {
          document.setHeader('Event', 'Committed')
          document.setComments(document.rootId, ['also committed'])
          throw new Error('callback failed')
        },
        { origin },
      ),
    ).toThrow('callback failed')

    expect(document.getHeader('Event')).toBe('Committed')
    expect(document.getComments(document.rootId)).toEqual([
      'also committed',
    ])
    expect(document.revision).toBe(1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0]).toEqual({
      revision: 1,
      origin,
      categories: ['comments', 'headers'],
      changedNodeIds: [document.rootId],
      changedHeaderNames: ['Event'],
    })
  })

  test('leaves state and revision committed when a subscriber throws', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const subscriberError = new Error('subscriber failed')
    const unsubscribe = document.subscribe(() => {
      throw subscriberError
    })

    expect(() => document.setHeader('Event', 'Committed')).toThrow(
      subscriberError,
    )
    expect(document.getHeader('Event')).toBe('Committed')
    expect(document.revision).toBe(1)

    unsubscribe()
    expect(() => document.setHeader('Site', 'Still usable')).not.toThrow()
    expect(document.getHeaderEntries()).toEqual([
      ['Event', 'Committed'],
      ['Site', 'Still usable'],
    ])
    expect(document.revision).toBe(2)
  })

  test('queues reentrant events so every listener observes revisions in order', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const deliveries: string[] = []

    document.subscribe(event => {
      deliveries.push(`first:${event.revision}`)
      if (event.revision === 1) {
        document.setHeader('Site', 'Reentrant update')
      }
    })
    document.subscribe(event => {
      deliveries.push(`second:${event.revision}`)
    })

    document.setHeader('Event', 'Initial update')

    expect(deliveries).toEqual([
      'first:1',
      'second:1',
      'first:2',
      'second:2',
    ])
    expect(document.revision).toBe(2)
    expect(document.getHeaderEntries()).toEqual([
      ['Event', 'Initial update'],
      ['Site', 'Reentrant update'],
    ])
  })

  test('applies subscription changes to the next queued event', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const deliveries: string[] = []
    const third = vi.fn((event: GameDocumentChangeEvent) => {
      deliveries.push(`third:${event.revision}`)
    })
    let unsubscribeSecond = (): void => undefined

    document.subscribe(event => {
      deliveries.push(`first:${event.revision}`)
      if (event.revision === 1) {
        unsubscribeSecond()
        document.subscribe(third)
        document.setHeader('Site', 'Reentrant update')
      }
    })
    unsubscribeSecond = document.subscribe(event => {
      deliveries.push(`second:${event.revision}`)
    })

    document.setHeader('Event', 'Initial update')

    expect(deliveries).toEqual([
      'first:1',
      'second:1',
      'first:2',
      'third:2',
    ])
    expect(third).toHaveBeenCalledTimes(1)
  })

  test('isolates listener exceptions, drains queued events, and aggregates failures in delivery order', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const firstFailure = new Error('first listener failed on revision 1')
    const secondFailure = new Error('second listener failed on revision 2')
    const deliveries: string[] = []

    document.subscribe(event => {
      deliveries.push(`first:${event.revision}`)
      if (event.revision === 1) {
        document.setHeader('Site', 'Queued despite listener failure')
        throw firstFailure
      }
    })
    document.subscribe(event => {
      deliveries.push(`second:${event.revision}`)
      if (event.revision === 2) {
        throw secondFailure
      }
    })
    document.subscribe(event => {
      deliveries.push(`third:${event.revision}`)
    })

    const thrown = captureThrown(() =>
      document.setHeader('Event', 'Initial update'),
    )

    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([
      firstFailure,
      secondFailure,
    ])
    expect(deliveries).toEqual([
      'first:1',
      'second:1',
      'third:1',
      'first:2',
      'second:2',
      'third:2',
    ])
    expect(document.revision).toBe(2)
    expect(document.getHeader('Site')).toBe(
      'Queued despite listener failure',
    )
  })

  test('preserves callback and listener failures with the callback first and as cause', () => {
    const document = new MemoryGameDocument(nodeId(1))
    const callbackFailure = new Error('transaction callback failed')
    const listenerFailure = new Error('change listener failed')
    const laterListener = vi.fn()

    document.subscribe(() => {
      throw listenerFailure
    })
    document.subscribe(laterListener)

    const thrown = captureThrown(() =>
      document.transact(() => {
        document.setHeader('Event', 'Committed')
        throw callbackFailure
      }),
    )

    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([
      callbackFailure,
      listenerFailure,
    ])
    expect((thrown as AggregateError).cause).toBe(callbackFailure)
    expect(laterListener).toHaveBeenCalledTimes(1)
    expect(document.getHeader('Event')).toBe('Committed')
    expect(document.revision).toBe(1)
  })
})
