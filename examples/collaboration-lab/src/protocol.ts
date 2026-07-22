export const MAX_UPDATE_BYTES = 8 * 1024 * 1024
export const MAX_MESSAGE_BYTES = 12 * 1024 * 1024

export type ClientMessage =
  | {
      readonly type: 'hello'
      readonly stateVector?: string
    }
  | {
      readonly type: 'update'
      readonly updateId: string
      readonly update: string
    }

export type ServerMessage =
  | {
      readonly type: 'sync'
      readonly update: string
    }
  | {
      readonly type: 'update'
      readonly actor: string
      readonly updateId: string
      readonly update: string
    }
  | {
      readonly type: 'ack'
      readonly updateId: string
    }
  | {
      readonly type: 'error'
      readonly message: string
      readonly updateId?: string
    }
  | {
      readonly type: 'relay-state'
      readonly partitionedActors: readonly string[]
    }

export interface TraceEntry {
  readonly sequence: number
  readonly kind:
    | 'room-created'
    | 'connected'
    | 'disconnected'
    | 'partitioned'
    | 'queued-inbound'
    | 'queued-outbound'
    | 'accepted'
    | 'dependency-retained'
    | 'rejected'
    | 'healed'
    | 'redelivered'
  readonly actor?: string
  readonly updateId?: string
  readonly bytes?: number
  readonly detail?: string
}

export interface RelayRoomState {
  readonly roomId: string
  readonly stateVector: string
  readonly fingerprint: string
  readonly partitionedActors: readonly string[]
  readonly connectedActors: readonly string[]
  readonly inboundQueue: Readonly<Record<string, number>>
  readonly dependencyQueue: number
  readonly acceptedUpdates: number
  readonly trace: readonly TraceEntry[]
}

export const parseRoomId = (value: string | null): string => {
  if (value === null || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new TypeError('Room must contain 1-64 letters, numbers, _ or -')
  }
  return value
}

export const parseActorId = (value: string | null): string => {
  if (value === null || !/^[A-Za-z0-9_-]{1,32}$/.test(value)) {
    throw new TypeError('Actor must contain 1-32 letters, numbers, _ or -')
  }
  return value
}
