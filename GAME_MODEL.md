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
- If no ID is supplied, construction creates one with the runtime's secure
  `crypto.randomUUID()` implementation. The library fails explicitly if secure
  UUID generation is unavailable; it does not fall back to a weaker source.
- IDs are independent of UCI moves, FENs, child indexes, and variation paths.
  All of those can change or can be shared by distinct nodes.

`parseGameNodeId()` proves syntax, not uniqueness. `GameDocument` rejects a
duplicate ID within the retained game lineage, including IDs belonging to
removed tombstones. The `Game` handle cache guarantees one live object per ID
within one facade without duplicating mutable game state.

## Construction paths

The public constructor behavior remains compatible with the translated model:
directly constructing a `ChildNode` adds and attaches it through the parent's
canonical document.
`GameNode.addVariation()` asks the lineage root's protected
`childNodeConstructor()` policy for the child class, constructs it through the
same public constructor shape, and commits the document record only after the
entire subclass constructor returns successfully. Root ownership ensures that
the same child type applies recursively at every ply without exposing a
detached-node API.

```text
direct `new ChildNode(parent, move)`
        └─ constructs and attaches (compatibility path)

`parent.addVariation(move)`
        ├─ `parent.game().childNodeConstructor()`
        ├─ reserve identity while the complete subclass constructs
        ├─ discard the handle if construction throws
        └─ atomically add the canonical document record after success
```

Root subclasses can override the protected constructor policy to preserve a
specialized node type recursively. Existing subclasses that override
`addVariation()` remain source-compatible, but that legacy extension point
cannot preserve a new third-argument node ID unless the override explicitly
forwards it, and a legacy override that directly constructs a child owns its
post-`super()` failure behavior. Identity-aware implementations should prefer
the root policy, whose construction context preserves the requested identity
and annotations even when a child constructor only forwards the traditional
parent and move arguments.
After `super()`, a root-policy child constructor may inspect its staged parent,
move, annotations, and board. The child is not published into the parent order
until the constructor returns, and attempts to mutate document state through
the staged handle fail explicitly. This preserves useful subclass
initialization without exposing a publicly detached node lifecycle.
Annotation inputs are consumed before attachment, so an invalid or throwing
iterable cannot leave a partially initialized child in the tree. Materializing
a handle for an already-existing document record is deliberately not expressed
as a publicly detached `ChildNode`; the document-backed model owns that
distinct internal state.

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

## Canonical backing

The stable identity seam now sits on one transaction-aware `GameDocument`.
Public nodes are stable handles, mutable collections are no longer exposed,
and the in-memory implementation is the executable contract for a future Yjs
backing. See [GAME_DOCUMENT.md](GAME_DOCUMENT.md) for the structure, deliberate
python-chess divergences, delete-wins policy, and adapter requirements.
