import { describe, expect, test, vi } from 'vitest'

import * as chess from '../index'
import * as pgn from '../pgn'

const ROOT_ID = pgn.parseGameNodeId(
  '10000000-0000-0000-0000-000000000000',
)
const FIRST_ID = pgn.parseGameNodeId(
  '10000000-0000-0000-0000-000000000001',
)
const SECOND_ID = pgn.parseGameNodeId(
  '10000000-0000-0000-0000-000000000002',
)
const GRANDCHILD_ID = pgn.parseGameNodeId(
  '10000000-0000-0000-0000-000000000003',
)
const NEW_CHILD_ID = pgn.parseGameNodeId(
  '10000000-0000-0000-0000-000000000004',
)

const deepNodeId = (index: number): pgn.GameNodeId =>
  pgn.parseGameNodeId(
    `20000000-0000-0000-0000-${index.toString().padStart(12, '0')}`,
  )

const makeDocument = (): pgn.MemoryGameDocument =>
  new pgn.MemoryGameDocument(ROOT_ID, {
    headers: [
      ['Event', 'Document-backed game'],
      ['Result', '*'],
    ],
    comments: ['root comment'],
  })

const addExternalNode = (
  document: pgn.GameDocument,
  {
    nodeId,
    parentId = ROOT_ID,
    moveUci,
    comments = [],
    startingComments = [],
    nags = [],
    index,
  }: {
    nodeId: pgn.GameNodeId
    parentId?: pgn.GameNodeId
    moveUci: string
    comments?: readonly string[]
    startingComments?: readonly string[]
    nags?: Iterable<number>
    index?: number
  },
): void => {
  document.addNode(
    {
      nodeId,
      parentId,
      moveUci,
      comments,
      startingComments,
      nags,
    },
    { index },
  )
}

describe('GameDocument-backed Game facade', () => {
  test('binds to a supplied document and rejects conflicting construction inputs', () => {
    const document = makeDocument()
    const game = new pgn.Game(null, { document, nodeId: ROOT_ID })
    const canonicalDocument = game.document
    const canonicalHeaders = game.headers

    if (false) {
      // @ts-expect-error A game cannot be rebound to a different document.
      game.document = makeDocument()
      // @ts-expect-error A game cannot be rebound to different headers.
      game.headers = new pgn.Headers()
    }
    expect(() => {
      const mutableGame = game as unknown as {
        document: pgn.GameDocument
      }
      mutableGame.document = makeDocument()
    }).toThrowError(TypeError)
    expect(
      Reflect.defineProperty(game, 'document', {
        value: makeDocument(),
      }),
    ).toBe(false)
    expect(
      Reflect.defineProperty(game, 'headers', {
        value: new pgn.Headers(),
      }),
    ).toBe(false)

    expect(game.document).toBe(canonicalDocument)
    expect(game.document).toBe(document)
    expect(game.headers).toBe(canonicalHeaders)
    expect(game.nodeId).toBe(ROOT_ID)
    expect(game.nodeById(ROOT_ID)).toBe(game)
    expect(game.comments).toEqual(['root comment'])
    expect(game.headers.get('Event')).toBe('Document-backed game')

    expect(
      () =>
        new pgn.Game(new Map([['Event', 'ambiguous']]), {
          document,
        }),
    ).toThrowError('Existing game documents cannot also receive initial headers')
    expect(
      () =>
        new pgn.Game(null, {
          document,
          nodeId: FIRST_ID,
        }),
    ).toThrowError('Game nodeId does not match the document rootId')
    expect(
      () =>
        new pgn.Game(null, {
          document: null as unknown as pgn.GameDocument,
        }),
    ).toThrowError('Game document must be an object')
  })

  test('keeps stable handles while reflecting direct document changes', () => {
    const document = makeDocument()
    const game = new pgn.Game(null, { document })
    const headers = game.headers

    addExternalNode(document, {
      nodeId: FIRST_ID,
      moveUci: 'e2e4',
      comments: ['first'],
    })
    addExternalNode(document, {
      nodeId: SECOND_ID,
      moveUci: 'd2d4',
      comments: ['second'],
    })

    const first = game.nodeById(FIRST_ID) as pgn.ChildNode
    const second = game.nodeById(SECOND_ID) as pgn.ChildNode
    expect(game.nodeById(FIRST_ID)).toBe(first)
    expect(game.variations).toEqual([first, second])
    expect(game.variations[0]).toBe(first)
    expect(game.headers).toBe(headers)

    document.moveChild(ROOT_ID, SECOND_ID, 0)
    document.setComments(FIRST_ID, ['externally edited'])
    document.setStartingComments(FIRST_ID, ['external preface'])
    document.setNags(FIRST_ID, [pgn.NAG_NOVELTY, pgn.NAG_GOOD_MOVE])
    document.setHeader('Event', 'Externally renamed')
    document.setHeader('Site', 'Remote')

    expect(game.variations).toEqual([second, first])
    expect(game.variations[1]).toBe(first)
    expect(first.comments).toEqual(['externally edited'])
    expect(first.startingComments).toEqual(['external preface'])
    expect([...first.nags]).toEqual([pgn.NAG_GOOD_MOVE, pgn.NAG_NOVELTY])
    expect(headers.get('Event')).toBe('Externally renamed')
    expect(headers.get('Site')).toBe('Remote')
  })

  test('keeps removed handles inspectable but never resurrects their identities', () => {
    const document = makeDocument()
    addExternalNode(document, {
      nodeId: FIRST_ID,
      moveUci: 'e2e4',
      comments: ['preserved tombstone metadata'],
    })
    addExternalNode(document, {
      nodeId: GRANDCHILD_ID,
      parentId: FIRST_ID,
      moveUci: 'e7e5',
      comments: ['preserved descendant'],
    })
    const game = new pgn.Game(null, { document })
    const child = game.nodeById(FIRST_ID) as pgn.ChildNode
    const grandchild = game.nodeById(GRANDCHILD_ID) as pgn.ChildNode

    expect(document.removeChild(ROOT_ID, FIRST_ID)).toBe(true)

    expect(document.isRemoved(FIRST_ID)).toBe(true)
    expect(game.variations).toEqual([])
    expect(game.nodeById(FIRST_ID)).toBe(child)
    expect(child.nodeId).toBe(FIRST_ID)
    expect(child.parent).toBe(game)
    expect(child.move.uci()).toBe('e2e4')
    expect(child.comments).toEqual(['preserved tombstone metadata'])
    expect(child.variations).toEqual([grandchild])
    expect(grandchild.parent).toBe(child)
    expect(grandchild.comments).toEqual(['preserved descendant'])

    expect(document.removeChild(ROOT_ID, FIRST_ID)).toBe(false)
    expect(() => document.moveChild(ROOT_ID, FIRST_ID, 0)).toThrowError(
      `Removed game node ${FIRST_ID} cannot be reordered`,
    )
    expect(() =>
      child.addVariation(
        chess.Move.fromUci('g1f3'),
        {},
        { nodeId: NEW_CHILD_ID },
      ),
    ).toThrowError(`Cannot add a child below removed game node ${FIRST_ID}`)
    expect(() =>
      addExternalNode(document, {
        nodeId: FIRST_ID,
        moveUci: 'c2c4',
      }),
    ).toThrowError(`Duplicate game node ID: ${FIRST_ID}`)
  })

  test('uses the root subclass child constructor for external descendants recursively', () => {
    class CustomChild extends pgn.ChildNode {
      readonly custom = true
    }

    class CustomGame extends pgn.Game {
      protected childNodeConstructor(): typeof pgn.ChildNode {
        return CustomChild
      }
    }

    const document = makeDocument()
    addExternalNode(document, {
      nodeId: FIRST_ID,
      moveUci: 'e2e4',
    })
    addExternalNode(document, {
      nodeId: GRANDCHILD_ID,
      parentId: FIRST_ID,
      moveUci: 'e7e5',
    })
    const game = new CustomGame(null, { document })

    const grandchild = game.nodeById(GRANDCHILD_ID) as CustomChild
    const child = grandchild.parent as CustomChild

    expect(child).toBeInstanceOf(CustomChild)
    expect(grandchild).toBeInstanceOf(CustomChild)
    expect(child.custom).toBe(true)
    expect(grandchild.custom).toBe(true)
    expect(child.parent).toBe(game)
    expect(game.variations[0]).toBe(child)
    expect(child.variations[0]).toBe(grandchild)
    expect(game.nodeById(FIRST_ID)).toBe(child)
    expect(game.nodeById(GRANDCHILD_ID)).toBe(grandchild)
  })

  test('commits custom child records only after subclass construction succeeds', () => {
    class ThrowingChild extends pgn.ChildNode {
      constructor(...args: ConstructorParameters<typeof pgn.ChildNode>) {
        super(...args)
        throw new Error('derived initialization failed')
      }
    }

    class ThrowingGame extends pgn.Game {
      protected childNodeConstructor(): typeof pgn.ChildNode {
        return ThrowingChild
      }
    }

    const game = new ThrowingGame(null, { nodeId: ROOT_ID })

    expect(() =>
      game.addVariation(
        chess.Move.fromUci('e2e4'),
        {},
        { nodeId: FIRST_ID },
      ),
    ).toThrowError('derived initialization failed')
    expect(game.variations).toEqual([])
    expect(game.document.hasNode(FIRST_ID)).toBe(false)
    expect(() => game.nodeById(FIRST_ID)).toThrowError(
      `Unknown game node ID: ${FIRST_ID}`,
    )
  })

  test('provides read-only staged state during custom child construction', () => {
    class InspectingChild extends pgn.ChildNode {
      readonly observedParent: pgn.GameNode
      readonly observedComments: readonly string[]
      readonly observedSan: string
      readonly mutationFailure: string

      constructor(...args: ConstructorParameters<typeof pgn.ChildNode>) {
        super(...args)
        this.observedParent = this.parent
        this.observedComments = this.comments
        this.observedSan = this.san()
        try {
          this.addNag(pgn.NAG_GOOD_MOVE)
          this.mutationFailure = 'mutation unexpectedly succeeded'
        } catch (error) {
          this.mutationFailure = (error as Error).message
        }
      }
    }

    class InspectingGame extends pgn.Game {
      protected childNodeConstructor(): typeof pgn.ChildNode {
        return InspectingChild
      }
    }

    const game = new InspectingGame(null, { nodeId: ROOT_ID })
    const child = game.addVariation(
      chess.Move.fromUci('e2e4'),
      { comment: 'candidate', nags: [pgn.NAG_NOVELTY] },
      { nodeId: FIRST_ID },
    ) as InspectingChild

    expect(child.observedParent).toBe(game)
    expect(child.observedComments).toEqual(['candidate'])
    expect(child.observedSan).toBe('e4')
    expect(child.mutationFailure).toBe(
      'A child node cannot mutate document state before its constructor returns',
    )
    expect(game.variations).toEqual([child])
    expect([...child.nags]).toEqual([pgn.NAG_NOVELTY])
    child.addNag(pgn.NAG_GOOD_MOVE)
    expect([...child.nags]).toEqual([
      pgn.NAG_GOOD_MOVE,
      pgn.NAG_NOVELTY,
    ])
  })

  test('discards a failed custom handle while materializing an existing record', () => {
    class FlakyChild extends pgn.ChildNode {
      static failNextConstruction = true

      constructor(...args: ConstructorParameters<typeof pgn.ChildNode>) {
        super(...args)
        if (FlakyChild.failNextConstruction) {
          FlakyChild.failNextConstruction = false
          throw new Error('derived materialization failed')
        }
      }
    }

    class FlakyGame extends pgn.Game {
      protected childNodeConstructor(): typeof pgn.ChildNode {
        return FlakyChild
      }
    }

    const document = makeDocument()
    addExternalNode(document, {
      nodeId: FIRST_ID,
      moveUci: 'e2e4',
    })
    const game = new FlakyGame(null, { document })

    expect(() => game.nodeById(FIRST_ID)).toThrowError(
      'derived materialization failed',
    )
    const child = game.nodeById(FIRST_ID)
    expect(child).toBeInstanceOf(FlakyChild)
    expect(game.nodeById(FIRST_ID)).toBe(child)
    expect(game.variations).toEqual([child])
  })

  test('materializes a deep external lineage iteratively', () => {
    const document = makeDocument()
    let parentId = ROOT_ID
    let finalId = ROOT_ID

    document.transact(() => {
      for (let index = 1; index <= 4000; index++) {
        finalId = deepNodeId(index)
        addExternalNode(document, {
          nodeId: finalId,
          parentId,
          moveUci: index % 2 === 0 ? 'a7a6' : 'a2a3',
        })
        parentId = finalId
      }
    })

    const game = new pgn.Game(null, { document })
    const finalNode = game.nodeById(finalId)
    expect(finalNode.nodeId).toBe(finalId)
    expect(game.nodeById(finalId)).toBe(finalNode)

    let node = finalNode
    let depth = 0
    while (node.parent !== null) {
      depth += 1
      node = node.parent
    }
    expect(node).toBe(game)
    expect(depth).toBe(4000)
  })

  test('returns frozen collection snapshots that malicious callers cannot mutate', () => {
    const document = makeDocument()
    addExternalNode(document, {
      nodeId: FIRST_ID,
      moveUci: 'e2e4',
      comments: ['one'],
      startingComments: ['before'],
    })
    const game = new pgn.Game(null, { document })
    const child = game.nodeById(FIRST_ID) as pgn.ChildNode

    const variations = game.variations
    const comments = child.comments
    const startingComments = child.startingComments
    const childIds = document.getChildIds(ROOT_ID)
    const headerEntries = document.getHeaderEntries()

    expect(Object.isFrozen(variations)).toBe(true)
    expect(Object.isFrozen(comments)).toBe(true)
    expect(Object.isFrozen(startingComments)).toBe(true)
    expect(Object.isFrozen(childIds)).toBe(true)
    expect(Object.isFrozen(headerEntries)).toBe(true)
    expect(headerEntries.every(entry => Object.isFrozen(entry))).toBe(true)

    expect(() =>
      (variations as unknown as pgn.ChildNode[]).splice(0, 1),
    ).toThrow(TypeError)
    expect(() =>
      (comments as unknown as string[]).push('malicious'),
    ).toThrow(TypeError)
    expect(() => {
      ;(startingComments as unknown as string[])[0] = 'malicious'
    }).toThrow(TypeError)
    expect(() =>
      (childIds as unknown as pgn.GameNodeId[]).pop(),
    ).toThrow(TypeError)
    expect(() => {
      ;(headerEntries[0] as unknown as [string, string])[1] = 'malicious'
    }).toThrow(TypeError)

    document.setComments(FIRST_ID, ['two'])
    document.setStartingComments(FIRST_ID, ['after'])
    addExternalNode(document, {
      nodeId: SECOND_ID,
      moveUci: 'd2d4',
    })

    expect(comments).toEqual(['one'])
    expect(startingComments).toEqual(['before'])
    expect(variations).toEqual([child])
    expect(childIds).toEqual([FIRST_ID])
    expect(child.comments).toEqual(['two'])
    expect(child.startingComments).toEqual(['after'])
    expect(game.variations.map(node => node.nodeId)).toEqual([
      FIRST_ID,
      SECOND_ID,
    ])
  })

  test('exposes NAGs as immutable, sorted snapshots with explicit mutation verbs', () => {
    const document = makeDocument()
    addExternalNode(document, {
      nodeId: FIRST_ID,
      moveUci: 'e2e4',
      nags: [pgn.NAG_NOVELTY, pgn.NAG_GOOD_MOVE, pgn.NAG_NOVELTY],
    })
    const game = new pgn.Game(null, { document })
    const child = game.nodeById(FIRST_ID) as pgn.ChildNode
    const nags = child.nags

    if (false) {
      // @ts-expect-error NAG snapshots intentionally omit mutable Set methods.
      child.nags.add(pgn.NAG_MISTAKE)
      // @ts-expect-error NAG snapshots intentionally omit mutable Set methods.
      child.nags.clear()
    }

    expect(Object.isFrozen(nags)).toBe(true)
    expect([...nags]).toEqual([pgn.NAG_GOOD_MOVE, pgn.NAG_NOVELTY])
    expect(() =>
      (nags as unknown as Set<number>).add(pgn.NAG_MISTAKE),
    ).toThrow(TypeError)
    expect(() => (nags as unknown as Set<number>).clear()).toThrow(TypeError)

    child.addNag(pgn.NAG_MISTAKE)
    expect([...nags]).toEqual([pgn.NAG_GOOD_MOVE, pgn.NAG_NOVELTY])
    expect([...child.nags]).toEqual([
      pgn.NAG_GOOD_MOVE,
      pgn.NAG_MISTAKE,
      pgn.NAG_NOVELTY,
    ])
    expect(child.removeNag(pgn.NAG_NOVELTY)).toBe(true)
    child.clearNags()
    expect([...child.nags]).toEqual([])
  })

  test('owns an immutable Move independent of caller and document mutation', () => {
    const game = new pgn.Game(null, { nodeId: ROOT_ID })
    const callerMove = chess.Move.fromUci('e2e4')
    const child = game.addVariation(
      callerMove,
      {},
      { nodeId: FIRST_ID },
    )
    const ownedMove = child.move

    callerMove.fromSquare = chess.D2
    callerMove.toSquare = chess.D4

    expect(child.move).toBe(ownedMove)
    expect(child.move.uci()).toBe('e2e4')
    expect(Object.isFrozen(child.move)).toBe(true)
    expect(() => {
      child.move.fromSquare = chess.D2
    }).toThrow(TypeError)

    const document = makeDocument()
    addExternalNode(document, {
      nodeId: SECOND_ID,
      moveUci: 'g1f3',
    })
    const externallyMaterialized = new pgn.Game(null, {
      document,
    }).nodeById(SECOND_ID) as pgn.ChildNode

    expect(externallyMaterialized.move.uci()).toBe('g1f3')
    expect(Object.isFrozen(externallyMaterialized.move)).toBe(true)
  })

  test('batches nested mutations into one final-state subscription event', () => {
    const document = new pgn.MemoryGameDocument(ROOT_ID)
    const game = new pgn.Game(null, { document })
    const events: pgn.GameDocumentChangeEvent[] = []
    const observedFinalStates: string[][] = []
    const origin = { source: 'test transaction' }
    const unsubscribe = game.subscribe(event => {
      events.push(event)
      observedFinalStates.push(
        game.variations.map(node => `${node.move.uci()}:${node.comments[0]}`),
      )
    })

    game.transact(
      () => {
        game.setComments(['root'])
        game.insertStartingComment(0, 'root preface')
        game.headers.set('Event', 'Batched')
        game.addVariation(
          chess.Move.fromUci('e2e4'),
          { comment: 'child', nags: [pgn.NAG_GOOD_MOVE] },
          { nodeId: FIRST_ID },
        )
      },
      { origin },
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      revision: 1,
      origin,
      categories: [
        'structure',
        'comments',
        'starting-comments',
        'nags',
        'headers',
      ],
      changedNodeIds: [ROOT_ID, FIRST_ID],
      changedHeaderNames: ['Event'],
    })
    expect(observedFinalStates).toEqual([['e2e4:child']])
    expect(Object.isFrozen(events[0])).toBe(true)
    expect(Object.isFrozen(events[0].categories)).toBe(true)
    expect(Object.isFrozen(events[0].changedNodeIds)).toBe(true)
    expect(Object.isFrozen(events[0].changedHeaderNames)).toBe(true)

    unsubscribe()
    game.setComments(['after unsubscribe'])
    expect(events).toHaveLength(1)
  })

  test('provides granular annotation verbs and batches composite helpers', () => {
    const game = new pgn.Game(null, { nodeId: ROOT_ID })
    const child = game.addVariation(
      chess.Move.fromUci('e2e4'),
      {},
      { nodeId: FIRST_ID },
    )
    const listener = vi.fn()
    game.subscribe(listener)

    child.setComments(['one'])
    child.appendComments(['two', 'three'])
    expect(listener).toHaveBeenCalledTimes(2)
    expect(child.comments).toEqual(['one', 'two', 'three'])
    child.insertComment(1, 'inserted')
    child.editComment(2, 'edited')
    expect(child.removeComment(0)).toBe('one')
    expect(child.comments).toEqual(['inserted', 'edited', 'three'])

    child.setStartingComments(['before'])
    child.appendStartingComments(['middle', 'after'])
    expect(child.startingComments).toEqual(['before', 'middle', 'after'])
    child.insertStartingComment(1, 'inserted')
    child.editStartingComment(2, 'edited')
    expect(child.removeStartingComment(0)).toBe('before')
    expect(child.startingComments).toEqual(['inserted', 'edited', 'after'])

    child.setNags([pgn.NAG_NOVELTY, pgn.NAG_GOOD_MOVE])
    child.addNag(pgn.NAG_MISTAKE)
    expect(child.removeNag(pgn.NAG_NOVELTY)).toBe(true)
    expect([...child.nags]).toEqual([pgn.NAG_GOOD_MOVE, pgn.NAG_MISTAKE])
    child.clearNags()
    expect([...child.nags]).toEqual([])

    const callsBeforeLine = listener.mock.calls.length
    const end = child.addLine(
      [chess.Move.fromUci('e7e5'), chess.Move.fromUci('g1f3')],
      {
        startingComment: 'line preface',
        comment: ['line end one', 'line end two'],
        nags: [pgn.NAG_GOOD_MOVE],
      },
    )
    expect(listener).toHaveBeenCalledTimes(callsBeforeLine + 1)
    expect(end.comments).toEqual(['line end one', 'line end two'])
    expect([...end.nags]).toEqual([pgn.NAG_GOOD_MOVE])
    expect(child.variations[0].startingComments).toEqual(['line preface'])
  })

  test('edits embedded PGN annotations without replacing the comment list', () => {
    const document = makeDocument()
    const game = new pgn.Game(null, { document })
    const child = game.addVariation(
      chess.Move.fromUci('e2e4'),
      {
        comment: ['plain text', '[%clk 0:00:01]', '[%cal Ge2e4]'],
      },
      { nodeId: FIRST_ID },
    )
    const setComments = vi.spyOn(document, 'setComments')
    const editComment = vi.spyOn(document, 'editComment')
    const removeComment = vi.spyOn(document, 'removeComment')

    child.setClock(2)
    expect(child.comments).toEqual([
      'plain text',
      '[%clk 0:00:02]',
      '[%cal Ge2e4]',
    ])
    child.setClock(null)
    child.setArrows([])

    expect(child.comments).toEqual(['plain text'])
    expect(setComments).not.toHaveBeenCalled()
    expect(editComment).toHaveBeenCalled()
    expect(removeComment).toHaveBeenCalledTimes(2)
  })

  test('routes public variation-order and removal verbs through the document', () => {
    const game = new pgn.Game(null, { nodeId: ROOT_ID })
    const first = game.addVariation(
      chess.Move.fromUci('e2e4'),
      {},
      { nodeId: FIRST_ID },
    )
    const second = game.addVariation(
      chess.Move.fromUci('d2d4'),
      {},
      { nodeId: SECOND_ID },
    )

    game.promote(second)
    expect(game.variations).toEqual([second, first])
    game.demote(second)
    expect(game.variations).toEqual([first, second])
    game.promoteToMain(second)
    expect(game.variations).toEqual([second, first])
    game.removeVariation(second)

    expect(game.variations).toEqual([first])
    expect(game.document.isRemoved(SECOND_ID)).toBe(true)
  })
})
