# Canonical structured game documents

`Game`, `GameNode`, and `Headers` are stable public handles over one
`GameDocument`. The document is the sole mutable representation of a
structured chess game.

```text
Game / ChildNode / Headers handles
  - stable object identity
  - chess behavior
  - no mutable tree or annotation cache
                    │
                    ▼
               GameDocument
  - node records and ordered child IDs
  - comments, starting comments, and NAGs
  - headers
  - transactions and invalidation events
                    │
           ┌────────┴────────┐
           ▼                 ▼
  MemoryGameDocument    future Yjs document
       available now      same contract directly
```

This boundary exists to prevent a synchronization adapter from owning a Yjs
tree while the application owns a second mutable `Game` tree. Rebuilding or
patching one from the other would create two authorities, invite drift, and
replace live `GameNode` objects after remote changes. A future Yjs adapter must
implement `GameDocument`; it must not mirror an ordinary in-memory game.

## Canonical facts

A document stores only facts that must converge:

```text
root node ID
headers in insertion order
node ID -> write-once parent ID + write-once incoming UCI move
parent node ID -> ordered child node IDs
node ID -> ordered comments
node ID -> ordered starting comments
node ID -> NAG set
node ID -> terminal removal tombstone
```

It does not store SAN, derived board positions, mainline flags, a separate
"main child," or a second drawing collection. The child at index zero is the
main variation. PGN arrows and highlighted squares remain encoded in the one
canonical ordered comment collection.

Equal moves do not imply equal nodes. Two same-move siblings with distinct IDs
remain legal, matching python-chess. A Hyperchess command layer may later
coalesce concurrent attempts to add the same move as an explicit product
policy; the general library does not silently collapse them.

## Stable handles, not a shadow tree

One `Game` facade owns a node-ID-to-handle cache. The cache is identity
infrastructure, not another game model:

- `Game` holds the document, stable `Headers` handle, and handle cache.
- `ChildNode` holds its node ID, root `Game` reference, and one frozen copy of
  its write-once incoming `Move` value.
- Children, comments, starting comments, NAGs, and headers are always read from
  the document.
- Reordering, annotation changes, and external document updates therefore
  remain visible through existing handles immediately.
- A node record is never physically removed while its document lives, so a
  retained handle never loses its immutable identity, ancestry, or move.

`Game.nodeById()` resolves an unmaterialized ancestry iteratively from the
nearest cached handle. A 4,000-ply external lineage is a supported regression
case and does not consume the JavaScript call stack.

The lineage root selects the child class through
`childNodeConstructor()`. This keeps custom node subclasses recursive for both
local construction and external materialization. Direct
`new ChildNode(parent, move)` remains a compatibility path that atomically adds
the document record. Root-driven construction instead reserves a handle,
allows the complete subclass constructor to finish, and only then commits the
record. A throwing subclass therefore cannot leak a half-constructed live
node. Binding a handle to a record that already exists uses the same internal
construction context; it never creates a temporary detached record or leaves
a failed handle cached.

While a custom constructor is running after `super()`, the unpublished handle
can read its staged parent, move, annotations, and derived board state. It is
not yet visible in the parent's variations or document. Document mutations
through that handle fail explicitly until the constructor returns; placement-
dependent initialization belongs after construction. This short-lived staging
context is a construction boundary, not a second persistent game model.

```text
unpublished construction view ── constructor succeeds ──► GameDocument record
             │                                                sole authority
             └──────── constructor fails ───────────────► discarded
```

The two authorities never coexist: publication removes the construction view
before the caller receives the node. The view is deliberately read-only and
cannot acquire children or evolve into another tree representation.

## Collection and mutation contract

Native mutable arrays cannot honestly front a Yjs document. A proxy would need
to emulate numeric assignment, `length`, deletion, property definition,
borrowed array methods, splice, sort, and their intermediate states. Keeping a
real array synchronized beside Yjs would be the forbidden second model.

The public contract therefore preserves read ergonomics while narrowing
writes:

```ts
node.variations[0]
node.comments.map(...)
node.startingComments.join(' ')
node.nags.has(NAG_GOOD_MOVE)
game.headers.get('White')
```

- `variations`, `comments`, and `startingComments` return fresh frozen
  snapshots.
- `nags` returns a runtime-immutable `ReadonlySet` snapshot.
- Old snapshots remain unchanged; a fresh getter sees the latest state.
- Comment and NAG replacement setters remain available for import and
  compatibility, but caller-owned collections are always copied.
- Granular commands (`insertComment()`, `editComment()`, `removeComment()`,
  starting-comment equivalents, `addNag()`, and `removeNag()`) map directly to
  future CRDT list/set operations. They must not be implemented as inferred
  read-and-replace diffs.
- Structural commands (`addVariation()`, `promote()`, `demote()`, and
  `removeVariation()`) are the only supported tree mutation paths.
- Visitors receive isolated comment arrays rather than the document's mutable
  storage.

This is an intentional pre-1.0 TypeScript divergence from python-chess's
directly mutable Python lists and sets. It removes aliasing and unobservable
mutation paths so there can be one canonical authority.

Replacement setters are explicit replace-all compatibility commands, not a
promise that concurrent sequence insertions disappear. Numeric indexes name a
position in the transaction's current view, not a durable element identity.
The Yjs adapter must test these semantics directly. Its ordinary collaborative
editing paths should use granular commands, and concurrent variation moves
must converge to exactly one live membership for each child ID even though a
CRDT move is represented by sequence operations internally.

## Deletion is terminal

`removeVariation()` removes the branch from its live parent order and applies
a delete-wins tombstone to the retained subtree.

```text
live parent children: [A, B, C]
                         │
remove B                 ▼
live parent children: [A, C]     retained records: B and descendants
                                      tombstoned: yes
                                      inspectable: yes
                                      reusable ID: no
                                      can grow/reorder: no
```

Retained handles can still expose the deleted branch for history, undo policy,
or diagnostics, but neither its ID nor any descendant ID can be reused or
resurrected. This invariant gives the in-memory and future Yjs implementations
the same observable deletion policy.

Removal is transitive, including across concurrency: a node is effectively
removed when it or any ancestor has a terminal tombstone. Eagerly marking only
the descendants visible on the deleting replica is insufficient, because
another replica may concurrently create a previously unseen descendant. The
adapter must preserve the ancestor tombstone and treat that late-arriving node
as removed; it cannot expose or grow the branch after synchronization.

## Transactions and events

Every mutator automatically joins a transaction. `game.transact()` and
`document.transact()` batch nested operations into one synchronous final-state
event:

```ts
game.transact(
  () => {
    game.headers.set('Event', 'Analysis')
    game.addVariation(move, { comment: 'candidate' })
  },
  { origin: actorOrUndoManager },
)
```

Events contain a monotonically increasing revision, the exact outer origin,
canonical change categories, changed node IDs, and changed header names. They
are invalidations, not a second operation log. Listeners run after all nested
mutations and can read the final state. No-op mutations emit nothing.

Transaction callbacks must finish synchronously. Ordinary `async` or
`PromiseLike` callbacks are rejected by the TypeScript signature, and a runtime
check throws `TypeError` if an untyped caller returns any object or function
with a callable `then`. This runtime rejection is still not a rollback: any
synchronous mutation made before the callback returned remains committed and
is notified. JavaScript promises are not cancellable, so code that bypasses the
type and runtime boundary may also have already scheduled an asynchronous
continuation; callers must not use transaction callbacks for asynchronous
work.

Transactions batch observation but do not roll back. If a callback throws,
changes made before the exception remain committed and one event is delivered;
this matches the intended Yjs transaction model. A nested callback inherits the
outer transaction and origin. Its exception is delivered to its immediate
caller, which may catch it; only an exception that escapes the outer callback
becomes the outer transaction's callback failure.

Subscribers run synchronously, but reentrant mutations do not recursively
deliver events. Each new event is queued until every listener in the current
event's subscription snapshot has run. Consequently, every continuing listener
sees revision `N` before revision `N + 1`. Subscribing or unsubscribing during a
listener affects the next event, not the event already being delivered.

A throwing listener never prevents later listeners or already queued events
from being delivered. After the queue drains, one listener failure is rethrown
unchanged; multiple listener failures are reported in delivery order in an
`AggregateError`. State and revision are committed before either form is
thrown. If the transaction callback and one or more listeners both fail, the
result is an `AggregateError` whose `errors` begin with the callback failure and
continue with listener failures in delivery order; the callback failure is also
the aggregate's `cause`. This preserves every failure without letting observer
behavior replace the operation's primary failure.

## Trust boundaries

TypeScript branding is not runtime validation. `MemoryGameDocument` and a
future provider-backed implementation must parse every untrusted value before
changing state:

- node IDs are canonical lowercase UUID-shaped strings;
- moves are canonical round-tripping UCI strings;
- PGN header names match the PGN tag grammar and values contain no line breaks;
- comments are strings;
- NAGs are safe integers;
- indexes and parent relationships are valid;
- node IDs are unique within the retained document, including tombstones.

Invalid input fails before revision, notification, or partial mutation. Shared
parsers live outside `pgn.ts` so a document adapter can use them without a
runtime import cycle.

Header records preserve insertion order. The `Headers` handle presents the
Seven Tag Roster first in its canonical order, followed by non-roster headers
in insertion order, matching python-chess.

## Deliberately local state

`Game.errors` remains parser-local diagnostic state. It is not chess content,
must not synchronize, and intentionally lives outside `GameDocument`.

## Yjs implementation contract

The Yjs adapter maps this contract directly onto Yjs shared types:

- ordered child IDs and comments use CRDT sequences;
- headers use an ordered sequence of record maps, while node records use a
  keyed shared map;
- NAG membership and tombstones use keyed set/map semantics;
- `origin` is forwarded to Yjs transactions and remains available for a later
  actor-scoped undo layer;
- a complete candidate remote update is parsed and structurally checked before
  it becomes observable through handles (including one root, acyclic and
  consistent parent/child relationships, unique live child membership, and
  transitive tombstone visibility);
- document updates, state vectors, snapshots, and convergence tests operate on
  this one backing;
- existing `Game`, `Headers`, and materialized `ChildNode` handles survive
  remote updates by identity.

Convergence tests include deletion concurrent with an unseen descendant,
concurrent moves of one variation, replacement concurrent with granular list
edits, invalid remote updates, and adversarial retained-history updates. Raw
whole-document Yjs undo is deliberately excluded because it can erase node
records or resurrect terminal tombstones; actor-scoped semantic undo remains a
separate layer.

It must not project a Yjs document into another `Game`, store drawings twice,
derive node IDs from move paths, or infer granular CRDT edits from replacement
snapshots.

The concrete schema and validated binary-update boundary are documented in
[YJS_GAME_DOCUMENT.md](YJS_GAME_DOCUMENT.md).
