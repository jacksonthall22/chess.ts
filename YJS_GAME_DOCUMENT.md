# Yjs-backed structured games

`YjsGameDocument` is the synchronized implementation of the canonical
[`GameDocument`](GAME_DOCUMENT.md) contract. It lives in the optional
`@jacksonthall22/chess.ts/pgn/yjs` entry point so ordinary chess and PGN users
do not load Yjs merely by importing `pgn`.

```text
Game / ChildNode / Headers
          │
          ▼
    GameDocument API
          │
          ▼
   YjsGameDocument
          │
          ▼
    private Y.Doc  ═════ binary updates ═════► persistence / peers
```

There is no intermediate synchronized DTO and no projected `Game` tree. The
Yjs shared types are the sole mutable game representation. Existing public
handles continue reading them through `GameDocument` after local and remote
updates.

The adapter keeps one private validated lookup index so ordinary node reads do
not reparse the entire Y.Doc. That index is not serialized, synchronized, or
independently editable: it holds references into the canonical shared types,
trusted local commands update it in the same synchronous mutation, and every
accepted remote update replaces it from the newly validated live document. It
is derived acceleration state, not a second game model or authority.

Yjs `13.6.31` is pinned deliberately. The adapter uses the stable V1 update
format, checks the pending struct store for causally incomplete updates, and
uses retained `Item` identities and parent relationships to audit write-once
schema history. Those last two checks are intentionally isolated compatibility
seams over Yjs internals. Upgrading Yjs therefore requires the dependency,
history-audit, and immutable-type replacement regressions to pass before
changing the pin. The upstream update APIs are documented in the
[Yjs README](https://github.com/yjs/yjs#document-updates).

## Schema version 1

One top-level `Y.Map` named `chess.ts/game-document` contains:

```text
schemaVersion: 1
rootId: GameNodeId
nodes: Y.Map<GameNodeId, Y.Map>
  parentId: GameNodeId | null           write-once
  moveUci: string | null                write-once
  childPlacements: Y.Array<GameNodeId>
  comments: Y.Array<Y.Map<{ text }>>
  startingComments: Y.Array<Y.Map<{ text }>>
  nags: Y.Map<decimal NAG, true>
headers: Y.Array<Y.Map<{ name, value }>>
tombstones: Y.Map<GameNodeId, true>     monotonic
```

A nested shared type is integrated at one location and never moved or reused,
as required by [Yjs shared-type semantics](https://docs.yjs.dev/getting-started/working-with-shared-types).
Node records are retained forever within a document lineage. Parent and move
facts cannot change after the node first becomes observable.

The lineage uses `gc: false` as part of this versioned contract. Deleted Items
remain available for strict history auditing and later synchronization; a full
update produced by an independently configured, garbage-collected Y.Doc is not
an interchangeable persistence format. Compaction, if introduced, must be an
explicit future schema migration rather than an implicit fallback while
loading.

Comments are nested maps rather than primitive array entries. Editing one
comment updates its `text` register without deleting and reinserting the
sequence element; the surrounding `Y.Array` still gives comments their
collaborative order. The same rule applies to starting comments.

Headers are a sequence because a map does not provide the convergent insertion
order promised by `Headers`. Updating an existing visible header edits its
record. Concurrent first insertions can create more than one raw record, so the
last converged record for a name is canonical.

## Raw placement history and public order

Yjs arrays have insertion and deletion operations but no atomic move. Moving a
variation therefore deletes every occurrence visible locally and inserts one
new placement. Two replicas can concurrently move the same child and leave two
raw placements after merge.

```text
raw converged placements:  [A, B, A, C]
                                      ▲
public child order:            [B, A, C]
```

The last occurrence of each child ID wins. `getChildIds()` exposes exactly one
placement per ID, while the losing occurrence remains inactive CRDT history.
Every occurrence must still reference a node whose write-once `parentId`
matches that sequence. This rule resolves order only; two distinct node IDs
with the same chess move remain distinct legal variations.

Headers use the analogous last-record rule for concurrent first insertion of
one name. Deterministic interpretation is not silent repair: raw shared state
is retained, every replica applies the same rule, and later commands remove all
occurrences they can see.

## One genesis per lineage

`YjsGameDocument.create()` creates a new CRDT lineage. Two calls with the same
logical root ID do **not** create replicas: their root collections have
different Yjs identities and cannot safely merge. Every additional replica
must load an update descended from the one accepted genesis.

```text
device A creates lineage ──► atomic persistence/CAS winner ──► genesis update
device B loses first-write race ─────────────────────────────► load winner
                                                              replay/import
                                                              local intent
```

The persistence layer must choose one genesis atomically. A losing device loads
that exact update and explicitly replays or imports its local semantic changes;
it must not construct another document with the same root ID and try to merge
the two. Update validation rejects replacement of the established root
collections, so this protocol fails explicitly instead of silently discarding
one lineage.

## Terminal deletion

Deletion sets `tombstones[nodeId] = true`. A tombstone is never cleared or
deleted. A node is effectively removed if it or any ancestor is tombstoned.

```text
Replica A: tombstone branch B
Replica B: add child C below B while offline
Merge:     B is removed; C is removed through B's ancestry
```

`removeChild()` also removes every currently visible placement of the branch
root from its live parent. A concurrent reorder may retain or reintroduce a raw
placement, but the tombstone prevents it from becoming live. Retained branch
records remain inspectable and their IDs remain unavailable for reuse.

## Transport boundary

The mutable `Y.Doc` is private. Callers exchange bytes through the adapter:

```text
local command
    │
    ├─ GameDocument mutation
    ├─ semantic invalidation event
    └─ subscribeUpdates(update bytes) ─────────► transport

transport ──► applyUpdate(candidate bytes)
                    │
                    ├─ size and dependency checks
                    ├─ complete candidate validation
                    └─ one accepted apply to the live Y.Doc
```

Yjs updates are commutative, associative, and idempotent, and state vectors
allow a peer to request only missing information. See the official
[document-update documentation](https://docs.yjs.dev/api/document-updates).
Those properties solve transport ordering; they do not replace authorization
or application-schema validation.

The adapter exposes full updates, state vectors, differential updates, update
subscriptions, and validated update application. It does not expose `Y.Doc`,
because a provider applying bytes directly would bypass the trust boundary.
The caller supplies a byte limit for every externally sourced update. Creating
a differential update from an externally sourced state vector also requires a
limit; the same ceiling bounds both the vector and the generated response, so a
small hostile vector cannot silently force an unbounded full-document reply.

## Validate before publish

An incoming update is never first applied to the live document:

```text
incoming bytes
      │
      ▼
temporary candidate Y.Doc
      ├─ apply current full state
      ├─ apply incoming bytes
      ├─ reject unresolved causal dependencies
      ├─ audit visible and deleted retained history
      ├─ parse the exact visible versioned schema
      ├─ prove tree and value invariants
      └─ prove monotonic facts against current state
              │
              ▼
      apply the same bytes once to the private live Y.Doc
```

The candidate exists only during synchronous validation and publication and is
destroyed immediately afterward. It is not a live shadow model and is never
read by game handles.

Visible final state is not a sufficient trust boundary. With garbage
collection disabled, an update can replace a nested shared type or insert and
delete an unknown field while leaving a plausible visible result; Yjs would
still retain and retransmit that history. The adapter therefore walks every
retained `Item`, including deleted nested types, and assigns it a schema role.
It rejects unclassified history, unknown fields, duplicate node definitions,
repeated assignments to write-once fields, and replacement of established
shared-type identities. Every retained non-root node must have placement
history under its immutable parent, wrong-parent placements are invalid even
when deleted, and a raw tombstone requires retained evidence that a matching
placement was deleted. Mutable comment text, header values, NAG membership,
variation placement sequences, and monotonic tombstones remain the only
histories their public commands permit.

Validation rejects malformed binary data, an unexpected schema, invalid IDs,
moves, comments, headers or NAGs, missing parents, cycles, wrong-parent
placements, live orphan nodes, removed node records, changed parent/move facts,
removed tombstones, and out-of-schema retained history. Size, dependency, and
validation failures occur before publication and leave live bytes, revision,
listeners, and existing handles unchanged.

Yjs can retain an update whose causal predecessor is missing and activate it
later. Such pending structs or delete sets cannot be considered validated.
They produce a distinct dependency error so the transport can durably retain
and retry that update after predecessors arrive; they are never copied into
the live document.

The caller-provided byte ceilings limit each untrusted update, state vector,
and differential response. They are not an account quota: valid CRDT history
grows over time, so the application must also enforce authenticated rate limits
and cumulative workspace/storage budgets at its persistence boundary. Those
product limits must be explicit rather than silently deleting or compacting
user history.

## Transactions, events, and origins

`Y.Doc.transact()` is a synchronous batching boundary: observers run after the
transaction, nested work joins the outer transaction, and update events carry
the transaction origin. These properties are described in the official
[Y.Doc API](https://docs.yjs.dev/api/y.doc).

`YjsGameDocument` preserves the stricter `GameDocument` contract:

- promise-like callbacks fail at the type and runtime boundary;
- callback failure does not roll back mutations already made;
- public semantic events are delivered in revision order, including reentrant
  writes;
- observer failures cannot prevent other observers from seeing committed
  state;
- an omitted origin remains distinguishable from an explicit `null` origin.

Initial PGN/Game import should replay its trusted semantic commands inside one
outer `transact()`. The adapter updates its lookup index incrementally for those
commands and publishes one final-state event, avoiding a full parse and event
diff after every imported node.

Binary update listeners are isolated from Yjs internals for the same reason as
semantic listeners. A transport failure cannot corrupt or undo committed game
state.

Observer failure is deliberately post-commit. If a semantic or binary update
listener throws, all listeners are still attempted and the mutation remains
committed; the originating call then reports or aggregates the observer
failure. A transport must not interpret that exception as a validation
rejection or assume that retrying the idempotent update will deliver the same
listener notification again.

## Undo boundary

A raw whole-document `Y.UndoManager` would violate the model: it could
physically remove a node record, resurrect a terminal tombstone, or separate a
live child from its parent placement. It is therefore not exposed.

Actor-scoped undo can safely begin with headers, comments, starting comments,
and NAGs using tracked transaction origins. Structural undo requires semantic
commands: an inverse reorder against current state, terminal removal when
undoing an addition, and an explicit restore-as-copy command with new IDs for
a deleted branch. Yjs documents the origin-scoped mechanism in
[`Y.UndoManager`](https://docs.yjs.dev/api/undo-manager).

## Operational responsibility

The adapter is network-agnostic. A peer-to-peer, WebSocket, or durable object
transport may relay the same binary updates, but the surrounding application
still owns authentication, workspace membership, authorization, rate and size
limits, durable retry of dependency-blocked updates, persistence, and presence.
Awareness data such as cursors and presenter focus is ephemeral and does not
belong in this durable game document.

## Executable collaboration lab

[`examples/collaboration-lab`](examples/collaboration-lab/README.md) exercises
the public transport boundary as a real browser consumer. It serves one
interactive frontend to two isolated clients and runs a localhost relay with a
third `YjsGameDocument` replica:

```text
browser alice ──┐
                ├── controlled byte relay ── validated server replica
browser bob ────┘
```

The clients construct ordinary `Game` handles over their documents and never
access a raw `Y.Doc`. The relay likewise uses only full updates, state vectors,
differential updates, subscriptions, and validated `applyUpdate()` calls.
This makes the example an acceptance test of the supported consumer contract,
not a privileged test hook.

The same program supports manual split-screen exploration and deterministic
Playwright scenarios. Its partition barrier makes edits causally concurrent
without relying on wall-clock click timing. Its controls can choose server
acceptance order, reverse dependent updates, redeliver an accepted update, and
disconnect a locally editable client. Convergence checks compare the visible
semantic game and state vectors across both browsers and the server replica.

The relay is intentionally localhost-only and in-memory. It is not the future
production provider and does not claim authentication, authorization, durable
acknowledgements, persistence, or presence behavior.
