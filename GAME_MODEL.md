# Structured game identity

`chess.ts` keeps `Game` and `GameNode` as the public structured chess model.
The model now gives every root and child an opaque, stable `nodeId` so a
storage or synchronization implementation can address the same logical node
without deriving identity from a mutable tree position.

```text
Game (root nodeId)
  ├─ ChildNode (nodeId, move e4)
  │    └─ ChildNode (nodeId, move e5)
  └─ ChildNode (different nodeId, move e4)

nodeId identifies a node
move describes its incoming edge
variation order describes presentation
```

Those are deliberately separate concepts. Reordering a variation, editing its
annotations, or even having two sibling variations with equal moves does not
change either node's identity. Same-move siblings remain legal because that is
the behavior of the translated `python-chess` model. A product may choose a
stricter command policy, such as coalescing concurrent attempts to add the same
move, without changing the general-purpose game model.

## Identity contract

- `GameNode.nodeId` is getter-only and non-enumerable.
- An ID is a canonical lowercase UUID-shaped string branded as `GameNodeId`.
- Call `parseGameNodeId()` at an untyped boundary before supplying a persisted
  ID to a constructor.
- If no ID is supplied, the getter creates one with the runtime's secure
  `crypto.randomUUID()` implementation and then returns that same value for the
  node's lifetime. The library fails explicitly if secure UUID generation is
  unavailable; it does not fall back to a weaker identity source.
- IDs are independent of UCI moves, FENs, child indexes, and variation paths.
  All of those can change or can be shared by distinct nodes.

`parseGameNodeId()` proves syntax, not uniqueness. A structured materializer or
storage backend must reject duplicate IDs within one game lineage. The library
does not yet maintain a second global ID registry: `variations` remains a
public mutable array for `python-chess` compatibility, so a registry could be
silently bypassed and drift from the actual tree. Future storage work must
first centralize mutation before it can honestly enforce tree-wide indexes or
uniqueness through one canonical path.

## Construction paths

The public constructor behavior remains compatible with the translated model:
directly constructing a `ChildNode` attaches it to `parent.variations`.
`GameNode.addVariation()` asks the lineage root's protected
`childNodeConstructor()` policy for the child class, constructs it through the
same attaching path, and validates that it attached exactly once to the
requested parent. Root ownership ensures that the same child type applies
recursively at every ply.

```text
direct `new ChildNode(parent, move)`
        └─ constructs and attaches (compatibility path)

`parent.addVariation(move)`
        ├─ `parent.game().childNodeConstructor()`
        ├─ construct through the compatibility path
        └─ validate parent and exactly-one attachment
```

Root subclasses can override the protected constructor policy to preserve a
specialized node type recursively. Existing subclasses that override
`addVariation()` remain source-compatible, but that legacy extension point
cannot preserve a new third-argument node ID unless the override explicitly
forwards it; identity-aware implementations should prefer the root policy.
Annotation inputs are consumed before attachment, so an invalid or throwing
iterable cannot leave a partially initialized child in the tree. Materializing
a handle for an already-existing storage record is deliberately not expressed
as a publicly detached `ChildNode`; the later storage layer owns that distinct
internal state.

## Serialization boundary

PGN represents chess meaning, not the identity of an editable object graph.
Exporting and reparsing a PGN therefore preserves the game semantics while
creating a new node-identity lineage:

```text
live structured Game + stable node IDs
              │
              ├─ PGN export ─── chess semantics only
              │                    (node IDs are absent)
              └─ structured persistence/sync
                                   must preserve node IDs
```

Do not encode IDs into comments or derive them from a PGN path. A future
collaborative representation must persist them as first-class structured data.
It must also keep the public `Game`/`GameNode` objects as the sole live chess
model, rather than maintaining a Yjs tree plus a rebuilt shadow `Game` tree.

## What this seam does not solve

Stable identity is a prerequisite, not a CRDT implementation. The current
public arrays, sets, maps, and annotation fields can still be mutated directly.
The next architectural step is to route structural and metadata mutation
through one observable, transaction-aware storage contract while preserving
the familiar in-memory API. Only after that contract exists should a Yjs
adapter implement it. This ordering makes it possible to test convergence and
live-object stability without introducing two authoritative game trees.
