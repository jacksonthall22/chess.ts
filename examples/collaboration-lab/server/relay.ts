import { randomUUID } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'

import * as pgn from '@jacksonthall22/chess.ts/pgn'
import {
  YjsGameDocument,
  YjsGameDocumentDependencyError,
} from '@jacksonthall22/chess.ts/pgn/yjs'
import { WebSocket, WebSocketServer, type RawData } from 'ws'

import { gameFingerprint } from '../src/game-state'
import {
  MAX_MESSAGE_BYTES,
  MAX_UPDATE_BYTES,
  parseActorId,
  parseRoomId,
  type ClientMessage,
  type RelayRoomState,
  type ServerMessage,
  type TraceEntry,
} from '../src/protocol'

const HOST = '127.0.0.1'
const PORT = 4174
const MAX_CONTROL_BODY_BYTES = 64 * 1024

interface Peer {
  readonly connectionId: string
  readonly actor: string
  readonly socket: WebSocket
  readonly outbound: ServerMessage[]
  helloReceived: boolean
}

interface PendingUpdate {
  readonly actor: string
  readonly updateId: string
  readonly update: Uint8Array
}

interface AcceptedUpdate extends PendingUpdate {
  readonly sequence: number
}

interface Room {
  readonly roomId: string
  readonly document: YjsGameDocument
  readonly game: pgn.Game
  readonly peers: Set<Peer>
  readonly partitionedActors: Set<string>
  readonly inbound: Map<string, PendingUpdate[]>
  readonly dependencyQueue: PendingUpdate[]
  readonly pendingIds: Map<string, string>
  readonly processedIds: Map<string, string>
  readonly accepted: AcceptedUpdate[]
  readonly trace: TraceEntry[]
  nextSequence: number
}

const rooms = new Map<string, Room>()

const encodeBytes = (value: Uint8Array): string =>
  Buffer.from(value).toString('base64')

const decodeBytes = (value: unknown, label: string): Uint8Array => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new TypeError(`${label} must be canonical base64`)
  }
  const decoded = Buffer.from(value, 'base64')
  if (decoded.toString('base64') !== value) {
    throw new TypeError(`${label} must be canonical base64`)
  }
  if (decoded.byteLength > MAX_UPDATE_BYTES) {
    throw new RangeError(
      `${label} exceeds ${MAX_UPDATE_BYTES.toString()} bytes`,
    )
  }
  return new Uint8Array(decoded)
}

const parseUpdateId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(value)) {
    throw new TypeError('updateId must contain 1-128 letters, numbers, or -')
  }
  return value
}

const parseClientMessage = (raw: RawData): ClientMessage => {
  const bytes =
    typeof raw === 'string'
      ? Buffer.byteLength(raw)
      : Array.isArray(raw)
        ? raw.reduce((total, part) => total + part.byteLength, 0)
        : raw.byteLength
  if (bytes > MAX_MESSAGE_BYTES) {
    throw new RangeError('WebSocket message exceeds the lab limit')
  }
  const text =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? Buffer.concat(raw).toString('utf8')
        : Buffer.isBuffer(raw)
          ? raw.toString('utf8')
          : Buffer.from(new Uint8Array(raw)).toString('utf8')
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('Client message must be an object')
  }
  const message = parsed as Record<string, unknown>
  if (message.type === 'hello') {
    if (
      message.stateVector !== undefined &&
      typeof message.stateVector !== 'string'
    ) {
      throw new TypeError('hello.stateVector must be base64 when present')
    }
    return message.stateVector === undefined
      ? { type: 'hello' }
      : { type: 'hello', stateVector: message.stateVector }
  }
  if (message.type === 'update') {
    if (typeof message.update !== 'string') {
      throw new TypeError('update.update must be base64')
    }
    return {
      type: 'update',
      updateId: parseUpdateId(message.updateId),
      update: message.update,
    }
  }
  throw new TypeError('Unknown client message type')
}

const createRoom = (roomId: string): Room => {
  const document = YjsGameDocument.create(randomUUID() as pgn.GameNodeId)
  const room: Room = {
    roomId,
    document,
    game: new pgn.Game(null, { document }),
    peers: new Set(),
    partitionedActors: new Set(),
    inbound: new Map(),
    dependencyQueue: [],
    pendingIds: new Map(),
    processedIds: new Map(),
    accepted: [],
    trace: [],
    nextSequence: 1,
  }
  rooms.set(roomId, room)
  recordTrace(room, { kind: 'room-created' })
  return room
}

const roomFor = (roomId: string): Room => rooms.get(roomId) ?? createRoom(roomId)

const recordTrace = (
  room: Room,
  entry: Omit<TraceEntry, 'sequence'>,
): number => {
  const sequence = room.nextSequence
  room.nextSequence += 1
  room.trace.push({ sequence, ...entry } as TraceEntry)
  return sequence
}

const sendDirect = (peer: Peer, message: ServerMessage): void => {
  if (peer.socket.readyState === WebSocket.OPEN) {
    peer.socket.send(JSON.stringify(message))
  }
}

const send = (room: Room, peer: Peer, message: ServerMessage): void => {
  if (
    room.partitionedActors.has(peer.actor) &&
    message.type !== 'relay-state'
  ) {
    peer.outbound.push(message)
    if (message.type === 'update') {
      recordTrace(room, {
        kind: 'queued-outbound',
        actor: peer.actor,
        updateId: message.updateId,
      })
    }
    return
  }
  sendDirect(peer, message)
}

const relayStateMessage = (room: Room): ServerMessage => ({
  type: 'relay-state',
  partitionedActors: [...room.partitionedActors].sort(),
})

const broadcastRelayState = (room: Room): void => {
  const message = relayStateMessage(room)
  for (const peer of room.peers) {
    sendDirect(peer, message)
  }
}

const sendToActor = (
  room: Room,
  actor: string,
  message: ServerMessage,
): void => {
  for (const peer of room.peers) {
    if (peer.actor === actor) {
      send(room, peer, message)
    }
  }
}

type ApplyResult = 'accepted' | 'dependency' | 'rejected'

const applyPendingUpdate = (room: Room, pending: PendingUpdate): ApplyResult => {
  try {
    room.document.applyUpdate(pending.update, {
      maxBytes: MAX_UPDATE_BYTES,
      origin: Object.freeze({
        kind: 'collaboration-lab/relay',
        actor: pending.actor,
        updateId: pending.updateId,
      }),
    })
  } catch (error) {
    if (error instanceof YjsGameDocumentDependencyError) {
      return 'dependency'
    }
    const message = error instanceof Error ? error.message : String(error)
    room.pendingIds.delete(pending.updateId)
    recordTrace(room, {
      kind: 'rejected',
      actor: pending.actor,
      updateId: pending.updateId,
      bytes: pending.update.byteLength,
      detail: message,
    })
    sendToActor(room, pending.actor, {
      type: 'error',
      updateId: pending.updateId,
      message,
    })
    return 'rejected'
  }

  room.pendingIds.delete(pending.updateId)
  room.processedIds.set(pending.updateId, pending.actor)
  const sequence = recordTrace(room, {
    kind: 'accepted',
    actor: pending.actor,
    updateId: pending.updateId,
    bytes: pending.update.byteLength,
  })
  room.accepted.push({ ...pending, sequence })

  const message: ServerMessage = {
    type: 'update',
    actor: pending.actor,
    updateId: pending.updateId,
    update: encodeBytes(pending.update),
  }
  for (const peer of room.peers) {
    send(room, peer, message)
  }
  sendToActor(room, pending.actor, {
    type: 'ack',
    updateId: pending.updateId,
  })
  return 'accepted'
}

const retryDependencies = (room: Room): void => {
  let madeProgress = true
  while (madeProgress && room.dependencyQueue.length !== 0) {
    madeProgress = false
    const retained = room.dependencyQueue.splice(0)
    for (const pending of retained) {
      const result = applyPendingUpdate(room, pending)
      if (result === 'dependency') {
        room.dependencyQueue.push(pending)
      } else if (result === 'accepted') {
        madeProgress = true
      }
    }
  }
}

const processPendingUpdate = (room: Room, pending: PendingUpdate): void => {
  const result = applyPendingUpdate(room, pending)
  if (result === 'dependency') {
    room.dependencyQueue.push(pending)
    recordTrace(room, {
      kind: 'dependency-retained',
      actor: pending.actor,
      updateId: pending.updateId,
      bytes: pending.update.byteLength,
    })
  } else if (result === 'accepted') {
    retryDependencies(room)
  }
}

const receiveUpdate = (room: Room, actor: string, message: ClientMessage): void => {
  if (message.type !== 'update') {
    throw new TypeError('Expected an update message')
  }
  const update = decodeBytes(message.update, 'update')
  const knownActor =
    room.processedIds.get(message.updateId) ?? room.pendingIds.get(message.updateId)
  if (knownActor !== undefined) {
    if (knownActor !== actor) {
      throw new Error('updateId is already owned by another actor')
    }
    if (room.processedIds.has(message.updateId)) {
      sendToActor(room, actor, { type: 'ack', updateId: message.updateId })
    }
    return
  }

  const pending: PendingUpdate = {
    actor,
    updateId: message.updateId,
    update,
  }
  room.pendingIds.set(message.updateId, actor)
  if (room.partitionedActors.has(actor)) {
    const queue = room.inbound.get(actor) ?? []
    queue.push(pending)
    room.inbound.set(actor, queue)
    recordTrace(room, {
      kind: 'queued-inbound',
      actor,
      updateId: message.updateId,
      bytes: update.byteLength,
    })
    return
  }
  processPendingUpdate(room, pending)
}

const handleHello = (
  room: Room,
  peer: Peer,
  message: ClientMessage,
): void => {
  if (message.type !== 'hello') {
    throw new TypeError('The first message must be hello')
  }
  if (peer.helloReceived) {
    throw new Error('hello may only be sent once per connection')
  }
  peer.helloReceived = true

  const update =
    message.stateVector === undefined
      ? room.document.encodeStateAsUpdate()
      : room.document.encodeStateAsUpdate(
          decodeBytes(message.stateVector, 'stateVector'),
          { maxBytes: MAX_UPDATE_BYTES },
        )
  if (update.byteLength > MAX_UPDATE_BYTES) {
    throw new RangeError('Initial synchronization update exceeds the lab limit')
  }
  sendDirect(peer, { type: 'sync', update: encodeBytes(update) })
  sendDirect(peer, relayStateMessage(room))
}

const flushPeerOutbound = (peer: Peer): void => {
  const queued = peer.outbound.splice(0)
  for (const message of queued) {
    sendDirect(peer, message)
  }
}

const parseActorList = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty actor array`)
  }
  const actors = value.map(actor =>
    parseActorId(typeof actor === 'string' ? actor : null),
  )
  if (new Set(actors).size !== actors.length) {
    throw new TypeError(`${label} must not contain duplicate actors`)
  }
  return actors
}

const partitionRoom = (room: Room, actors: readonly string[]): void => {
  for (const actor of actors) {
    room.partitionedActors.add(actor)
  }
  recordTrace(room, {
    kind: 'partitioned',
    detail: actors.join(','),
  })
  broadcastRelayState(room)
}

const healRoom = (
  room: Room,
  order: readonly string[],
  reverseWithinActor: boolean,
): void => {
  const expected = [...room.partitionedActors].sort()
  const supplied = [...order].sort()
  if (JSON.stringify(expected) !== JSON.stringify(supplied)) {
    throw new Error('Heal order must contain every partitioned actor exactly once')
  }

  for (const actor of order) {
    const queued = room.inbound.get(actor) ?? []
    room.inbound.delete(actor)
    const delivery = reverseWithinActor ? [...queued].reverse() : queued
    for (const pending of delivery) {
      processPendingUpdate(room, pending)
    }
  }
  for (const actor of order) {
    room.partitionedActors.delete(actor)
  }
  for (const peer of room.peers) {
    flushPeerOutbound(peer)
  }
  recordTrace(room, {
    kind: 'healed',
    detail: `${order.join(',')}${reverseWithinActor ? ' (reversed)' : ''}`,
  })
  broadcastRelayState(room)
}

const roomState = (room: Room): RelayRoomState => ({
  roomId: room.roomId,
  stateVector: encodeBytes(room.document.encodeStateVector()),
  fingerprint: gameFingerprint(room.game),
  partitionedActors: [...room.partitionedActors].sort(),
  connectedActors: [...new Set([...room.peers].map(peer => peer.actor))].sort(),
  inboundQueue: Object.fromEntries(
    [...room.inbound.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([actor, queue]) => [actor, queue.length]),
  ),
  dependencyQueue: room.dependencyQueue.length,
  acceptedUpdates: room.accepted.length,
  trace: room.trace,
})

const sendJson = (
  response: ServerResponse,
  status: number,
  value: unknown,
): void => {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(value))
}

const readJson = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  const parts: Buffer[] = []
  let bytes = 0
  for await (const part of request) {
    const buffer = Buffer.isBuffer(part) ? part : Buffer.from(part)
    bytes += buffer.byteLength
    if (bytes > MAX_CONTROL_BODY_BYTES) {
      throw new RangeError('Control request exceeds the lab limit')
    }
    parts.push(buffer)
  }
  const parsed: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('Control request must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

const handleHttp = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? HOST}`)
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true })
      return
    }

    const match = /^\/api\/rooms\/([^/]+)(?:\/(partition|heal|redeliver-last))?$/.exec(
      url.pathname,
    )
    if (!match) {
      sendJson(response, 404, { error: 'not-found' })
      return
    }
    const roomId = parseRoomId(decodeURIComponent(match[1] as string))
    const action = match[2]
    const room = rooms.get(roomId)
    if (!room) {
      sendJson(response, 404, { error: 'unknown-room' })
      return
    }

    if (request.method === 'GET' && action === undefined) {
      sendJson(response, 200, roomState(room))
      return
    }
    if (request.method !== 'POST' || action === undefined) {
      sendJson(response, 405, { error: 'method-not-allowed' })
      return
    }

    if (action === 'partition') {
      const body = await readJson(request)
      partitionRoom(room, parseActorList(body.actors, 'actors'))
    } else if (action === 'heal') {
      const body = await readJson(request)
      if (
        body.reverseWithinActor !== undefined &&
        typeof body.reverseWithinActor !== 'boolean'
      ) {
        throw new TypeError('reverseWithinActor must be a boolean')
      }
      healRoom(
        room,
        parseActorList(body.order, 'order'),
        body.reverseWithinActor === true,
      )
    } else {
      const latest = room.accepted.at(-1)
      if (!latest) {
        throw new Error('Room has no accepted update to redeliver')
      }
      const message: ServerMessage = {
        type: 'update',
        actor: latest.actor,
        updateId: latest.updateId,
        update: encodeBytes(latest.update),
      }
      for (const peer of room.peers) {
        send(room, peer, message)
      }
      recordTrace(room, {
        kind: 'redelivered',
        actor: latest.actor,
        updateId: latest.updateId,
        bytes: latest.update.byteLength,
      })
    }
    sendJson(response, 200, roomState(room))
  } catch (error) {
    sendJson(response, 400, {
      error: 'invalid-control-request',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

const server = createServer((request, response) => {
  void handleHttp(request, response)
})
const webSockets = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_MESSAGE_BYTES,
})

server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? HOST}`)
    if (url.pathname !== '/sync') {
      socket.destroy()
      return
    }
    parseRoomId(url.searchParams.get('room'))
    parseActorId(url.searchParams.get('actor'))
    webSockets.handleUpgrade(request, socket, head, webSocket => {
      webSockets.emit('connection', webSocket, request)
    })
  } catch {
    socket.destroy()
  }
})

webSockets.on('connection', (socket, request) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? HOST}`)
  const room = roomFor(parseRoomId(url.searchParams.get('room')))
  const peer: Peer = {
    connectionId: randomUUID(),
    actor: parseActorId(url.searchParams.get('actor')),
    socket,
    outbound: [],
    helloReceived: false,
  }
  room.peers.add(peer)
  recordTrace(room, { kind: 'connected', actor: peer.actor })

  socket.on('message', raw => {
    try {
      const message = parseClientMessage(raw)
      if (!peer.helloReceived) {
        handleHello(room, peer, message)
      } else if (message.type === 'update') {
        receiveUpdate(room, peer.actor, message)
      } else {
        throw new Error('hello may only be sent once per connection')
      }
    } catch (error) {
      sendDirect(peer, {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

  socket.on('close', () => {
    room.peers.delete(peer)
    recordTrace(room, { kind: 'disconnected', actor: peer.actor })
  })
})

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `chess.ts collaboration relay listening on http://${HOST}:${PORT.toString()}\n`,
  )
})

const shutdown = (): void => {
  webSockets.close()
  server.close(() => {
    for (const room of rooms.values()) {
      room.document.destroy()
    }
    process.exit(0)
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
