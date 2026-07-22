import {
  parseSquare,
  squareName,
  type Board,
  type Square,
} from '@jacksonthall22/chess.ts'
import * as pgn from '@jacksonthall22/chess.ts/pgn'
import { YjsGameDocument } from '@jacksonthall22/chess.ts/pgn/yjs'
import { Arrow } from '@jacksonthall22/chess.ts/svg'
import {
  create as createChessboard,
  type Api as ChessboardApi,
  type BoardDrawing,
  type Dests,
  type Key,
  type PromotionRole,
} from 'chessboard'

import { gameFingerprint, readGameState, type SemanticGameState } from './game-state'
import {
  MAX_UPDATE_BYTES,
  parseActorId,
  parseRoomId,
  type RelayRoomState,
  type ServerMessage,
} from './protocol'
import './styles.css'

const REMOTE_ORIGIN = Object.freeze({ kind: 'collaboration-lab/remote' })
const params = new URLSearchParams(window.location.search)
const roomId = parseRoomId(params.get('room') ?? 'demo')
const actorId = parseActorId(params.get('actor') ?? 'alice')

type ConnectionState = 'connecting' | 'synced' | 'disconnected' | 'error'

interface PendingLocalUpdate {
  readonly encoded: string
  sent: boolean
}

interface LabSnapshot {
  readonly actorId: string
  readonly roomId: string
  readonly connection: ConnectionState
  readonly pendingUpdates: number
  readonly failedUpdates: number
  readonly partitionedActors: readonly string[]
  readonly selectedNodeId: string | null
  readonly stateVector: string | null
  readonly fingerprint: string | null
  readonly game: SemanticGameState | null
}

declare global {
  interface Window {
    __collaborationLab: {
      getState(): LabSnapshot
    }
  }
}

let document: YjsGameDocument | null = null
let game: pgn.Game | null = null
let socket: WebSocket | null = null
let connection: ConnectionState = 'disconnected'
let selectedNodeId: string | null = null
let partitionedActors: readonly string[] = []
let relayState: RelayRoomState | null = null
let lastError = ''
let localEventSequence = 1
const pendingUpdates = new Map<string, PendingLocalUpdate>()
const failedUpdates = new Map<string, string>()
const eventLog: string[] = []

const app = window.document.querySelector<HTMLElement>('#app')
if (!app) {
  throw new Error('Missing #app mount point')
}

app.innerHTML = `
  <header class="hero">
    <div>
      <p class="eyebrow">Consumer acceptance fixture</p>
      <h1>chess.ts collaboration lab</h1>
      <p class="intro">Two ordinary <code>Game</code> consumers exchanging only validated Yjs update bytes.</p>
    </div>
    <dl class="identity">
      <div><dt>Room</dt><dd data-testid="room-id"></dd></div>
      <div><dt>Actor</dt><dd data-testid="actor-id"></dd></div>
      <div><dt>Connection</dt><dd data-testid="connection-status"></dd></div>
      <div><dt>Pending</dt><dd data-testid="pending-count"></dd></div>
    </dl>
  </header>

  <p class="error" data-testid="error" role="alert" hidden></p>

  <section class="network-panel" aria-labelledby="network-heading">
    <div>
      <p class="eyebrow">Deterministic network controls</p>
      <h2 id="network-heading">Relay</h2>
      <p>Partition both actors, make local edits, then choose the server acceptance order.</p>
    </div>
    <label>
      Actors
      <input id="actors" value="alice,bob" aria-label="Actors" />
    </label>
    <div class="button-row">
      <button id="partition" type="button">Partition</button>
      <button id="heal-forward" type="button">Heal first → last</button>
      <button id="heal-reverse" type="button">Heal last → first</button>
      <button id="redeliver" type="button">Redeliver latest</button>
      <button id="connection" type="button">Connect</button>
    </div>
    <label class="checkbox">
      <input id="reverse-within-actor" type="checkbox" />
      Reverse each actor's queued updates (dependency retry exercise)
    </label>
    <p class="relay-summary" data-testid="relay-summary"></p>
  </section>

  <div class="workspace">
    <section class="board-panel" aria-labelledby="board-heading">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Selected position</p>
          <h2 id="board-heading">Board</h2>
        </div>
        <div class="button-row compact">
          <button id="flip" type="button">Flip board</button>
          <button id="back" type="button">Back</button>
        </div>
      </div>
      <div id="board" class="board" data-testid="board"></div>
      <form id="move-form" class="inline-form">
        <label for="uci">Legal UCI move</label>
        <input id="uci" name="uci" autocomplete="off" placeholder="e2e4" />
        <button type="submit">Add move</button>
      </form>
      <p class="hint">Drag or click pieces to make moves. Right-drag or Shift-drag to add synchronized arrows and highlights.</p>
    </section>

    <section class="tree-panel" aria-labelledby="tree-heading">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Live public handles</p>
          <h2 id="tree-heading">Variation tree</h2>
        </div>
        <div class="button-row compact">
          <button id="promote" type="button">Make main</button>
          <button id="delete" type="button" class="danger">Delete branch</button>
        </div>
      </div>
      <div id="tree" class="tree" data-testid="variation-tree"></div>
      <output id="variation-moves" data-testid="variation-moves" hidden></output>
    </section>

    <section class="annotation-panel" aria-labelledby="annotation-heading">
      <p class="eyebrow">Collaborative content</p>
      <h2 id="annotation-heading">Annotations</h2>
      <label for="comments">Replace selected-node comments</label>
      <textarea id="comments" rows="4"></textarea>
      <button id="replace-comments" type="button">Replace comments</button>
      <form id="append-comment-form" class="inline-form">
        <label for="append-comment">Append comment</label>
        <input id="append-comment" autocomplete="off" />
        <button type="submit">Append</button>
      </form>
      <form id="nag-form" class="inline-form">
        <label for="nag">Add NAG</label>
        <input id="nag" type="number" min="0" step="1" value="1" />
        <button type="submit">Add</button>
      </form>
      <form id="header-form" class="header-form">
        <label for="header-name">Header</label>
        <input id="header-name" value="Event" autocomplete="off" />
        <label for="header-value">Value</label>
        <input id="header-value" value="Collaboration lab" autocomplete="off" />
        <button type="submit">Set header</button>
      </form>
    </section>

    <section class="log-panel" aria-labelledby="client-log-heading">
      <p class="eyebrow">This browser</p>
      <h2 id="client-log-heading">Semantic and transport events</h2>
      <ol id="client-log" class="log" data-testid="client-log"></ol>
    </section>

    <section class="log-panel" aria-labelledby="relay-log-heading">
      <p class="eyebrow">Server replica</p>
      <h2 id="relay-log-heading">Relay trace</h2>
      <ol id="relay-log" class="log" data-testid="relay-log"></ol>
    </section>
  </div>
`

const requireElement = <ElementType extends HTMLElement>(
  selector: string,
): ElementType => {
  const element = window.document.querySelector<ElementType>(selector)
  if (!element) {
    throw new Error(`Missing lab element ${selector}`)
  }
  return element
}

const encodeBytes = (bytes: Uint8Array): string => {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return window.btoa(binary)
}

const decodeBytes = (encoded: string): Uint8Array => {
  const binary = window.atob(encoded)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (bytes.byteLength > MAX_UPDATE_BYTES) {
    throw new RangeError('Incoming update exceeds the collaboration lab limit')
  }
  return bytes
}

const pushEvent = (message: string): void => {
  eventLog.push(`${localEventSequence.toString().padStart(3, '0')} · ${message}`)
  localEventSequence += 1
  renderLogs()
}

const setError = (error: unknown): void => {
  lastError = error instanceof Error ? error.message : String(error)
  renderStatus()
}

const runAction = (action: () => void): void => {
  try {
    lastError = ''
    action()
    render()
  } catch (error) {
    setError(error)
  }
}

const currentNode = (): pgn.GameNode => {
  if (!game || !document || selectedNodeId === null) {
    throw new Error('The game is not synchronized yet')
  }
  const selected = game.nodeById(selectedNodeId as pgn.GameNodeId)
  if (document.isRemoved(selected.nodeId)) {
    selectedNodeId = game.nodeId
    return game
  }
  return selected
}

const installDocument = (nextDocument: YjsGameDocument): void => {
  document?.destroy()
  document = nextDocument
  game = new pgn.Game(null, { document: nextDocument })
  selectedNodeId = game.nodeId

  game.subscribe(event => {
    pushEvent(
      `semantic r${event.revision.toString()}: ${event.categories.join(', ') || 'no categories'}`,
    )
    render()
  })
  nextDocument.subscribeUpdates(event => {
    if (event.origin === REMOTE_ORIGIN) {
      return
    }
    const updateId = window.crypto.randomUUID()
    pendingUpdates.set(updateId, {
      encoded: encodeBytes(event.update),
      sent: false,
    })
    pushEvent(`local update ${updateId.slice(0, 8)} (${event.update.byteLength.toString()} bytes)`)
    flushPendingUpdates()
    renderStatus()
  })
}

const sendJson = (message: object): void => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return
  }
  socket.send(JSON.stringify(message))
}

const flushPendingUpdates = (): void => {
  if (connection !== 'synced') {
    return
  }
  for (const [updateId, pending] of pendingUpdates) {
    if (!pending.sent) {
      sendJson({
        type: 'update',
        updateId,
        update: pending.encoded,
      })
      pending.sent = true
      pushEvent(`sent update ${updateId.slice(0, 8)}`)
    }
  }
}

const parseServerMessage = (event: MessageEvent<string>): ServerMessage => {
  const parsed: unknown = JSON.parse(event.data)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('Server message must be an object')
  }
  return parsed as ServerMessage
}

const handleServerMessage = (message: ServerMessage): void => {
  if (message.type === 'sync') {
    const update = decodeBytes(message.update)
    if (document === null) {
      installDocument(
        YjsGameDocument.fromUpdate(update, { maxBytes: MAX_UPDATE_BYTES }),
      )
    } else {
      document.applyUpdate(update, {
        maxBytes: MAX_UPDATE_BYTES,
        origin: REMOTE_ORIGIN,
      })
    }
    connection = 'synced'
    pushEvent(`synchronized (${update.byteLength.toString()} bytes)`)
    flushPendingUpdates()
  } else if (message.type === 'update') {
    if (!document) {
      throw new Error('Received an update before initial synchronization')
    }
    const update = decodeBytes(message.update)
    document.applyUpdate(update, {
      maxBytes: MAX_UPDATE_BYTES,
      origin: REMOTE_ORIGIN,
    })
    pushEvent(
      `received ${message.actor}/${message.updateId.slice(0, 8)} (${update.byteLength.toString()} bytes)`,
    )
  } else if (message.type === 'ack') {
    pendingUpdates.delete(message.updateId)
    pushEvent(`acknowledged ${message.updateId.slice(0, 8)}`)
  } else if (message.type === 'relay-state') {
    partitionedActors = message.partitionedActors
  } else {
    if (message.updateId !== undefined) {
      pendingUpdates.delete(message.updateId)
      failedUpdates.set(message.updateId, message.message)
    }
    throw new Error(message.message)
  }
  render()
}

const connect = (): void => {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return
  }
  for (const pending of pendingUpdates.values()) {
    pending.sent = false
  }
  connection = 'connecting'
  lastError = ''
  renderStatus()

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL('/sync', `${protocol}//${window.location.host}`)
  url.searchParams.set('room', roomId)
  url.searchParams.set('actor', actorId)
  const nextSocket = new WebSocket(url)
  socket = nextSocket

  nextSocket.addEventListener('open', () => {
    const hello =
      document === null
        ? { type: 'hello' as const }
        : {
            type: 'hello' as const,
            stateVector: encodeBytes(document.encodeStateVector()),
          }
    sendJson(hello)
    pushEvent('WebSocket connected; requested synchronization')
  })
  nextSocket.addEventListener('message', event => {
    try {
      lastError = ''
      handleServerMessage(parseServerMessage(event as MessageEvent<string>))
    } catch (error) {
      connection = 'error'
      setError(error)
    }
  })
  nextSocket.addEventListener('close', () => {
    if (socket !== nextSocket) {
      return
    }
    socket = null
    if (connection !== 'error') {
      connection = 'disconnected'
    }
    for (const pending of pendingUpdates.values()) {
      pending.sent = false
    }
    pushEvent('WebSocket disconnected')
    render()
  })
  nextSocket.addEventListener('error', () => {
    if (socket !== nextSocket) {
      return
    }
    connection = 'error'
    setError('WebSocket connection failed')
  })
}

const disconnect = (): void => {
  socket?.close(1000, 'Manual collaboration-lab disconnect')
}

const addMove = (rawUci: string): void => {
  const node = currentNode()
  const board = node.board()
  const uci = rawUci.trim().toLowerCase()
  let move: ReturnType<typeof board.parseUci>
  try {
    move = board.parseUci(uci)
  } catch (originalError) {
    if (/^[a-h][1-8][a-h][18]$/.test(uci)) {
      move = board.parseUci(`${uci}q`)
    } else {
      throw originalError
    }
  }
  const child = node.addVariation(move)
  selectedNodeId = child.nodeId
  requireElement<HTMLInputElement>('#uci').value = ''
}

const PROMOTION_SUFFIX: Record<PromotionRole, string> = {
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
}

const toChessboardKey = (square: Square): Key => squareName(square) as Key

const legalDestinations = (board: Board): Dests => {
  const destinations: Dests = new Map()
  for (const move of board.legalMoves) {
    const origin = toChessboardKey(move.fromSquare)
    const destination = toChessboardKey(move.toSquare)
    const existing = destinations.get(origin)
    if (existing && !existing.includes(destination)) {
      existing.push(destination)
    } else if (!existing) {
      destinations.set(origin, [destination])
    }
  }
  return destinations
}

const boardDrawings = (node: pgn.GameNode): BoardDrawing[] =>
  node.arrows().map(arrow => {
    const from = toChessboardKey(arrow.tail)
    const to = toChessboardKey(arrow.head)
    return from === to
      ? { kind: 'highlight', square: from, brush: arrow.color }
      : { kind: 'arrow', from, to, brush: arrow.color }
  })

const gameArrows = (drawings: BoardDrawing[]): Arrow[] =>
  drawings.map(drawing => {
    const from = drawing.kind === 'arrow' ? drawing.from : drawing.square
    const to = drawing.kind === 'arrow' ? drawing.to : drawing.square
    return new Arrow(parseSquare(from), parseSquare(to), {
      color: drawing.brush ?? 'green',
    })
  })

const lastMove = (node: pgn.GameNode): Key[] | false =>
  node.move
    ? [
        toChessboardKey(node.move.fromSquare),
        toChessboardKey(node.move.toSquare),
      ]
    : false

const chessboard: ChessboardApi = createChessboard(requireElement('#board'), {
  coordinates: true,
  pieceSet: 'p4wn',
  assetsBaseUrl: '',
  movable: {
    color: 'both',
    dests: new Map(),
    showDests: true,
  },
  drawable: {
    enabled: true,
    onDrawingsChange(drawings) {
      runAction(() => currentNode().setArrows(gameArrows(drawings)))
    },
  },
  events: {
    move(origin, destination, promotion) {
      const suffix = promotion ? PROMOTION_SUFFIX[promotion] : ''
      runAction(() => addMove(`${origin}${destination}${suffix}`))
    },
  },
})

const renderStatus = (): void => {
  requireElement('[data-testid="room-id"]').textContent = roomId
  requireElement('[data-testid="actor-id"]').textContent = actorId
  const connectionElement = requireElement('[data-testid="connection-status"]')
  connectionElement.textContent = connection
  connectionElement.dataset.state = connection
  requireElement('[data-testid="pending-count"]').textContent =
    pendingUpdates.size.toString()

  const errorElement = requireElement('[data-testid="error"]')
  errorElement.textContent = lastError
  errorElement.hidden = lastError.length === 0

  const connectionButton = requireElement<HTMLButtonElement>('#connection')
  const online =
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  connectionButton.textContent = online ? 'Disconnect' : 'Connect'

  const summary = relayState
    ? `${relayState.connectedActors.length.toString()} connected · ${relayState.acceptedUpdates.toString()} accepted · ${relayState.dependencyQueue.toString()} dependency-blocked · partitioned: ${relayState.partitionedActors.join(', ') || 'none'}`
    : `Partitioned: ${partitionedActors.join(', ') || 'none'}`
  requireElement('[data-testid="relay-summary"]').textContent = summary
}

const renderBoard = (): void => {
  if (!game || !document || selectedNodeId === null) {
    chessboard.set({
      fen: '8/8/8/8/8/8/8/8 w - - 0 1',
      lastMove: false,
      check: false,
      movable: { color: 'both', dests: new Map() },
      drawable: { drawings: [] },
    })
    return
  }
  const node = currentNode()
  const board = node.board()
  const turnColor = board.turn ? 'white' : 'black'
  chessboard.set({
    fen: board.fen(),
    lastMove: lastMove(node),
    turnColor,
    check: board.isCheck() ? turnColor : false,
    movable: {
      color: turnColor,
      dests: legalDestinations(board),
      showDests: true,
    },
    drawable: { drawings: boardDrawings(node) },
  })
}

const nodeLabel = (node: pgn.GameNode): string => {
  if (node.parent === null || node.move === null) {
    return 'Start position'
  }
  try {
    return `${node.parent.board().san(node.move)} · ${node.move.uci()}`
  } catch {
    return node.move.uci()
  }
}

const renderTreeNode = (node: pgn.GameNode): HTMLLIElement => {
  const item = window.document.createElement('li')
  const button = window.document.createElement('button')
  button.type = 'button'
  button.dataset.nodeId = node.nodeId
  button.dataset.moveUci = node.move?.uci() ?? 'root'
  button.className = 'tree-node'
  if (node.nodeId === selectedNodeId) {
    button.classList.add('selected')
  }
  button.textContent = `${nodeLabel(node)}${node.comments.length === 0 ? '' : '  💬'}`
  button.title = node.nodeId
  button.addEventListener('click', () => {
    selectedNodeId = node.nodeId
    render()
  })
  item.append(button)
  if (node.variations.length !== 0) {
    const children = window.document.createElement('ol')
    for (const child of node.variations) {
      children.append(renderTreeNode(child))
    }
    item.append(children)
  }
  return item
}

const renderTree = (): void => {
  const container = requireElement('#tree')
  container.replaceChildren()
  if (!game) {
    return
  }
  currentNode()
  const tree = window.document.createElement('ol')
  tree.append(renderTreeNode(game))
  container.append(tree)
  requireElement<HTMLOutputElement>('#variation-moves').value = JSON.stringify(
    game.variations.map(node => ({ nodeId: node.nodeId, moveUci: node.move.uci() })),
  )

  const selected = currentNode()
  const isRoot = selected.parent === null
  requireElement<HTMLButtonElement>('#back').disabled = isRoot
  requireElement<HTMLButtonElement>('#promote').disabled = isRoot
  requireElement<HTMLButtonElement>('#delete').disabled = isRoot

  const comments = requireElement<HTMLTextAreaElement>('#comments')
  if (window.document.activeElement !== comments) {
    comments.value = selected.comments.join('\n')
  }
}

const renderLogs = (): void => {
  const clientLog = requireElement<HTMLOListElement>('#client-log')
  clientLog.replaceChildren(
    ...eventLog.slice(-40).map(entry => {
      const item = window.document.createElement('li')
      item.textContent = entry
      return item
    }),
  )

  const relayLog = requireElement<HTMLOListElement>('#relay-log')
  relayLog.replaceChildren(
    ...(relayState?.trace.slice(-40) ?? []).map(entry => {
      const item = window.document.createElement('li')
      item.textContent = `${entry.sequence.toString().padStart(3, '0')} · ${entry.kind}${entry.actor ? ` · ${entry.actor}` : ''}${entry.updateId ? `/${entry.updateId.slice(0, 8)}` : ''}${entry.detail ? ` · ${entry.detail}` : ''}`
      return item
    }),
  )
}

const render = (): void => {
  renderStatus()
  renderBoard()
  renderTree()
  renderLogs()
}

const actorList = (): string[] => {
  const actors = requireElement<HTMLInputElement>('#actors').value
    .split(',')
    .map(value => parseActorId(value.trim()))
  if (actors.length === 0 || new Set(actors).size !== actors.length) {
    throw new Error('Actors must be a non-empty list without duplicates')
  }
  return actors
}

const control = async (action: string, body: object = {}): Promise<void> => {
  const response = await window.fetch(
    `/api/rooms/${encodeURIComponent(roomId)}/${action}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const parsed: unknown = await response.json()
  if (!response.ok) {
    const message =
      typeof parsed === 'object' &&
      parsed !== null &&
      'message' in parsed &&
      typeof parsed.message === 'string'
        ? parsed.message
        : `Relay control failed (${response.status.toString()})`
    throw new Error(message)
  }
  relayState = parsed as RelayRoomState
  partitionedActors = relayState.partitionedActors
  render()
}

const runControl = (request: () => Promise<void>): void => {
  try {
    lastError = ''
    void request().catch(setError)
  } catch (error) {
    setError(error)
  }
}

const refreshRelayState = async (): Promise<void> => {
  try {
    const response = await window.fetch(`/api/rooms/${encodeURIComponent(roomId)}`)
    if (!response.ok) {
      return
    }
    relayState = (await response.json()) as RelayRoomState
    partitionedActors = relayState.partitionedActors
    renderStatus()
    renderLogs()
  } catch {
    // The visible WebSocket state remains authoritative while the dev relay restarts.
  }
}

requireElement<HTMLFormElement>('#move-form').addEventListener('submit', event => {
  event.preventDefault()
  runAction(() => addMove(requireElement<HTMLInputElement>('#uci').value))
})
requireElement<HTMLButtonElement>('#flip').addEventListener('click', () => {
  chessboard.toggleOrientation()
})
requireElement<HTMLButtonElement>('#back').addEventListener('click', () => {
  runAction(() => {
    const parent = currentNode().parent
    if (parent) {
      selectedNodeId = parent.nodeId
    }
  })
})
requireElement<HTMLButtonElement>('#promote').addEventListener('click', () => {
  runAction(() => {
    const node = currentNode()
    node.parent?.promoteToMain(node)
  })
})
requireElement<HTMLButtonElement>('#delete').addEventListener('click', () => {
  runAction(() => {
    const node = currentNode()
    if (node.parent) {
      const parent = node.parent
      parent.removeVariation(node)
      selectedNodeId = parent.nodeId
    }
  })
})
requireElement<HTMLButtonElement>('#replace-comments').addEventListener('click', () => {
  runAction(() => {
    const comments = requireElement<HTMLTextAreaElement>('#comments').value
      .split('\n')
      .map(value => value.trim())
      .filter(value => value.length !== 0)
    currentNode().setComments(comments)
  })
})
requireElement<HTMLFormElement>('#append-comment-form').addEventListener(
  'submit',
  event => {
    event.preventDefault()
    runAction(() => {
      const input = requireElement<HTMLInputElement>('#append-comment')
      const comment = input.value.trim()
      if (comment.length === 0) {
        throw new Error('Comment cannot be empty')
      }
      currentNode().appendComments(comment)
      input.value = ''
    })
  },
)
requireElement<HTMLFormElement>('#nag-form').addEventListener('submit', event => {
  event.preventDefault()
  runAction(() => {
    const nag = Number(requireElement<HTMLInputElement>('#nag').value)
    if (!Number.isSafeInteger(nag)) {
      throw new Error('NAG must be a safe integer')
    }
    currentNode().addNag(nag)
  })
})
requireElement<HTMLFormElement>('#header-form').addEventListener('submit', event => {
  event.preventDefault()
  runAction(() => {
    if (!game) {
      throw new Error('The game is not synchronized yet')
    }
    game.headers.set(
      requireElement<HTMLInputElement>('#header-name').value.trim(),
      requireElement<HTMLInputElement>('#header-value').value,
    )
  })
})
requireElement<HTMLButtonElement>('#partition').addEventListener('click', () => {
  runControl(() => control('partition', { actors: actorList() }))
})
requireElement<HTMLButtonElement>('#heal-forward').addEventListener('click', () => {
  runControl(() =>
    control('heal', {
      order: actorList(),
      reverseWithinActor:
        requireElement<HTMLInputElement>('#reverse-within-actor').checked,
    }),
  )
})
requireElement<HTMLButtonElement>('#heal-reverse').addEventListener('click', () => {
  runControl(() =>
    control('heal', {
      order: actorList().reverse(),
      reverseWithinActor:
        requireElement<HTMLInputElement>('#reverse-within-actor').checked,
    }),
  )
})
requireElement<HTMLButtonElement>('#redeliver').addEventListener('click', () => {
  runControl(() => control('redeliver-last'))
})
requireElement<HTMLButtonElement>('#connection').addEventListener('click', () => {
  if (
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  ) {
    disconnect()
  } else {
    connect()
  }
})

window.__collaborationLab = {
  getState: (): LabSnapshot => ({
    actorId,
    roomId,
    connection,
    pendingUpdates: pendingUpdates.size,
    failedUpdates: failedUpdates.size,
    partitionedActors: [...partitionedActors],
    selectedNodeId,
    stateVector: document ? encodeBytes(document.encodeStateVector()) : null,
    fingerprint: game ? gameFingerprint(game) : null,
    game: game ? readGameState(game) : null,
  }),
}

render()
connect()
window.setInterval(() => {
  void refreshRelayState()
}, 500)
