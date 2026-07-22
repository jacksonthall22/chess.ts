import { randomUUID } from 'node:crypto'

import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'

import type { SemanticGameState } from '../src/game-state'
import type { RelayRoomState } from '../src/protocol'

interface LabSnapshot {
  readonly actorId: string
  readonly roomId: string
  readonly connection: 'connecting' | 'synced' | 'disconnected' | 'error'
  readonly pendingUpdates: number
  readonly failedUpdates: number
  readonly partitionedActors: readonly string[]
  readonly selectedNodeId: string | null
  readonly stateVector: string | null
  readonly fingerprint: string | null
  readonly game: SemanticGameState | null
}

interface LabClient {
  readonly actor: string
  readonly context: BrowserContext
  readonly page: Page
  readonly browserErrors: string[]
}

const relayUrl = 'http://127.0.0.1:4174'

const roomName = (label: string): string =>
  `${label}-${randomUUID().replaceAll('-', '')}`

const snapshot = (page: Page): Promise<LabSnapshot> =>
  page.evaluate(() => window.__collaborationLab.getState())

const roomState = async (
  request: APIRequestContext,
  room: string,
): Promise<RelayRoomState> => {
  const response = await request.get(
    `${relayUrl}/api/rooms/${encodeURIComponent(room)}`,
  )
  expect(response.ok()).toBe(true)
  return (await response.json()) as RelayRoomState
}

const control = async (
  request: APIRequestContext,
  room: string,
  action: string,
  data: object = {},
): Promise<RelayRoomState> => {
  const response = await request.post(
    `${relayUrl}/api/rooms/${encodeURIComponent(room)}/${action}`,
    { data },
  )
  expect(response.ok()).toBe(true)
  return (await response.json()) as RelayRoomState
}

const openClient = async (
  browser: Browser,
  room: string,
  actor: string,
): Promise<LabClient> => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const browserErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') {
      browserErrors.push(message.text())
    }
  })
  page.on('pageerror', error => browserErrors.push(error.message))
  await page.goto(`/?room=${encodeURIComponent(room)}&actor=${actor}`)
  await expect(page.getByTestId('connection-status')).toHaveText('synced')
  return { actor, context, page, browserErrors }
}

const openPair = async (
  browser: Browser,
  room: string,
): Promise<readonly [LabClient, LabClient]> => {
  const [alice, bob] = await Promise.all([
    openClient(browser, room, 'alice'),
    openClient(browser, room, 'bob'),
  ])
  return [alice, bob]
}

const closeClients = async (clients: readonly LabClient[]): Promise<void> => {
  for (const client of clients) {
    expect(client.browserErrors, `${client.actor} browser errors`).toEqual([])
    await client.context.close()
  }
}

const addMove = async (page: Page, uci: string): Promise<void> => {
  await page.getByLabel('Legal UCI move').fill(uci)
  await page.getByRole('button', { name: 'Add move' }).click()
  await expect(page.getByTestId('error')).toBeHidden()
}

const visibleRootChildren = async (
  page: Page,
): Promise<SemanticGameState['root']['children']> => {
  const state = await snapshot(page)
  if (!state.game) {
    throw new Error('Expected a synchronized game')
  }
  return state.game.root.children
}

const waitForConvergence = async (
  request: APIRequestContext,
  room: string,
  clients: readonly LabClient[],
): Promise<void> => {
  await expect
    .poll(async () => {
      const clientStates = await Promise.all(
        clients.map(client => snapshot(client.page)),
      )
      const server = await roomState(request, room)
      const first = clientStates[0]
      return {
        synced: clientStates.every(state => state.connection === 'synced'),
        pending: clientStates.map(state => state.pendingUpdates),
        failed: clientStates.map(state => state.failedUpdates),
        clientVectorsEqual: clientStates.every(
          state => state.stateVector === first?.stateVector,
        ),
        serverVectorEqual: server.stateVector === first?.stateVector,
        clientFingerprintsEqual: clientStates.every(
          state => state.fingerprint === first?.fingerprint,
        ),
        serverFingerprintEqual: server.fingerprint === first?.fingerprint,
        dependencyQueue: server.dependencyQueue,
      }
    })
    .toEqual({
      synced: true,
      pending: clients.map(() => 0),
      failed: clients.map(() => 0),
      clientVectorsEqual: true,
      serverVectorEqual: true,
      clientFingerprintsEqual: true,
      serverFingerprintEqual: true,
      dependencyQueue: 0,
    })
}

test.describe('collaboration lab', () => {
  test('causally concurrent different moves converge in either server order', async ({
    browser,
    request,
  }) => {
    for (const order of [
      ['alice', 'bob'],
      ['bob', 'alice'],
    ] as const) {
      const room = roomName(`different-${order[0]}`)
      const clients = await openPair(browser, room)
      const [alice, bob] = clients
      try {
        await control(request, room, 'partition', {
          actors: ['alice', 'bob'],
        })
        await addMove(alice.page, 'e2e4')
        await addMove(bob.page, 'd2d4')

        await expect.poll(() => snapshot(alice.page)).toMatchObject({
          pendingUpdates: 1,
          partitionedActors: ['alice', 'bob'],
        })
        await expect.poll(() => snapshot(bob.page)).toMatchObject({
          pendingUpdates: 1,
          partitionedActors: ['alice', 'bob'],
        })
        expect((await visibleRootChildren(alice.page)).map(node => node.moveUci)).toEqual([
          'e2e4',
        ])
        expect((await visibleRootChildren(bob.page)).map(node => node.moveUci)).toEqual([
          'd2d4',
        ])
        expect((await roomState(request, room)).acceptedUpdates).toBe(0)

        await control(request, room, 'heal', { order })
        await waitForConvergence(request, room, clients)

        const aliceChildren = await visibleRootChildren(alice.page)
        const bobChildren = await visibleRootChildren(bob.page)
        expect(aliceChildren).toEqual(bobChildren)
        expect(aliceChildren.map(node => node.moveUci).sort()).toEqual([
          'd2d4',
          'e2e4',
        ])

        const acceptedActors = (await roomState(request, room)).trace
          .filter(entry => entry.kind === 'accepted')
          .map(entry => entry.actor)
        expect(acceptedActors).toEqual([...order])

        const beforeRedelivery = await snapshot(alice.page)
        await control(request, room, 'redeliver-last')
        await waitForConvergence(request, room, clients)
        const afterRedelivery = await snapshot(alice.page)
        expect(afterRedelivery.stateVector).toBe(beforeRedelivery.stateVector)
        expect(afterRedelivery.fingerprint).toBe(beforeRedelivery.fingerprint)
      } finally {
        await closeClients(clients)
      }
    }
  })

  test('same-move siblings remain distinct through the public Game API', async ({
    browser,
    request,
  }) => {
    const room = roomName('same-move')
    const clients = await openPair(browser, room)
    const [alice, bob] = clients
    try {
      await control(request, room, 'partition', { actors: ['alice', 'bob'] })
      await addMove(alice.page, 'e2e4')
      await addMove(bob.page, 'e2e4')
      await control(request, room, 'heal', { order: ['alice', 'bob'] })
      await waitForConvergence(request, room, clients)

      const children = await visibleRootChildren(alice.page)
      expect(children.map(node => node.moveUci)).toEqual(['e2e4', 'e2e4'])
      expect(new Set(children.map(node => node.nodeId)).size).toBe(2)
      await expect(alice.page.locator('[data-move-uci="e2e4"]')).toHaveCount(2)
      await expect(bob.page.locator('[data-move-uci="e2e4"]')).toHaveCount(2)
    } finally {
      await closeClients(clients)
    }
  })

  test('branch deletion wins over an offline descendant in the rendered game', async ({
    browser,
    request,
  }) => {
    const room = roomName('delete-descendant')
    const clients = await openPair(browser, room)
    const [alice, bob] = clients
    try {
      await addMove(alice.page, 'e2e4')
      await waitForConvergence(request, room, clients)
      const branchId = (await visibleRootChildren(alice.page))[0]?.nodeId
      if (!branchId) {
        throw new Error('Expected the seeded e4 branch')
      }
      await bob.page.locator(`[data-node-id="${branchId}"]`).click()

      await control(request, room, 'partition', { actors: ['alice', 'bob'] })
      await alice.page.locator(`[data-node-id="${branchId}"]`).click()
      await alice.page.getByRole('button', { name: 'Delete branch' }).click()
      await addMove(bob.page, 'e7e5')

      expect(await visibleRootChildren(alice.page)).toEqual([])
      expect((await visibleRootChildren(bob.page))[0]?.children[0]?.moveUci).toBe(
        'e7e5',
      )

      await control(request, room, 'heal', { order: ['bob', 'alice'] })
      await waitForConvergence(request, room, clients)
      expect(await visibleRootChildren(alice.page)).toEqual([])
      expect(await visibleRootChildren(bob.page)).toEqual([])
    } finally {
      await closeClients(clients)
    }
  })

  test('out-of-order dependent updates are retained and retried', async ({
    browser,
    request,
  }) => {
    const room = roomName('dependency')
    const clients = await openPair(browser, room)
    const [alice] = clients
    try {
      await control(request, room, 'partition', { actors: ['alice'] })
      await addMove(alice.page, 'e2e4')
      await addMove(alice.page, 'e7e5')
      await expect.poll(() => snapshot(alice.page)).toMatchObject({
        pendingUpdates: 2,
      })

      await control(request, room, 'heal', {
        order: ['alice'],
        reverseWithinActor: true,
      })
      await waitForConvergence(request, room, clients)

      const state = await roomState(request, room)
      expect(state.trace.some(entry => entry.kind === 'dependency-retained')).toBe(
        true,
      )
      const root = await visibleRootChildren(alice.page)
      expect(root[0]?.moveUci).toBe('e2e4')
      expect(root[0]?.children[0]?.moveUci).toBe('e7e5')
    } finally {
      await closeClients(clients)
    }
  })

  test('concurrent comments and main-variation choices remain usable', async ({
    browser,
    request,
  }) => {
    const room = roomName('annotations-order')
    const clients = await openPair(browser, room)
    const [alice, bob] = clients
    try {
      const rootId = (await snapshot(alice.page)).game?.root.nodeId
      if (!rootId) {
        throw new Error('Expected a synchronized root')
      }
      for (const uci of ['e2e4', 'd2d4', 'c2c4']) {
        await alice.page.locator(`[data-node-id="${rootId}"]`).click()
        await addMove(alice.page, uci)
      }
      await waitForConvergence(request, room, clients)

      const children = await visibleRootChildren(alice.page)
      const byMove = new Map(children.map(node => [node.moveUci, node.nodeId]))
      const e4 = byMove.get('e2e4')
      const d4 = byMove.get('d2d4')
      const c4 = byMove.get('c2c4')
      if (!e4 || !d4 || !c4) {
        throw new Error('Expected all seeded root variations')
      }

      await control(request, room, 'partition', { actors: ['alice', 'bob'] })
      await alice.page.locator(`[data-node-id="${e4}"]`).click()
      await bob.page.locator(`[data-node-id="${e4}"]`).click()
      await alice.page.getByLabel('Append comment').fill('alice note')
      await alice.page.getByRole('button', { name: 'Append', exact: true }).click()
      await bob.page.getByLabel('Append comment').fill('bob note')
      await bob.page.getByRole('button', { name: 'Append', exact: true }).click()

      await alice.page.locator(`[data-node-id="${d4}"]`).click()
      await bob.page.locator(`[data-node-id="${c4}"]`).click()
      await alice.page.getByRole('button', { name: 'Make main' }).click()
      await bob.page.getByRole('button', { name: 'Make main' }).click()

      await control(request, room, 'heal', { order: ['bob', 'alice'] })
      await waitForConvergence(request, room, clients)

      const converged = await visibleRootChildren(alice.page)
      expect(converged).toEqual(await visibleRootChildren(bob.page))
      expect(new Set(converged.map(node => node.nodeId)).size).toBe(3)
      expect(converged.map(node => node.moveUci).sort()).toEqual([
        'c2c4',
        'd2d4',
        'e2e4',
      ])
      expect(
        [...(converged.find(node => node.nodeId === e4)?.comments ?? [])].sort(),
      ).toEqual(['alice note', 'bob note'])
    } finally {
      await closeClients(clients)
    }
  })

  test('a disconnected client keeps local work and sends it after reconnecting', async ({
    browser,
    request,
  }) => {
    const room = roomName('reconnect')
    const clients = await openPair(browser, room)
    const [alice, bob] = clients
    try {
      await alice.page.getByRole('button', { name: 'Disconnect' }).click()
      await expect(alice.page.getByTestId('connection-status')).toHaveText(
        'disconnected',
      )
      await addMove(alice.page, 'g1f3')
      await expect.poll(() => snapshot(alice.page)).toMatchObject({
        pendingUpdates: 1,
      })
      expect(await visibleRootChildren(bob.page)).toEqual([])

      await alice.page.getByRole('button', { name: 'Connect' }).click()
      await waitForConvergence(request, room, clients)
      expect((await visibleRootChildren(bob.page))[0]?.moveUci).toBe('g1f3')
    } finally {
      await closeClients(clients)
    }
  })
})
