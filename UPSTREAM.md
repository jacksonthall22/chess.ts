# python-chess synchronization

`chess.ts` is a mechanical TypeScript translation of
[`python-chess`](https://github.com/niklasf/python-chess). The `python-chess/`
submodule currently pins:

```text
9c24454dcea4f8a30259d811a2f10b26e911deb4
v1.11.1-110-g9c24454d
2026-07-12 — expand racing kings perft (near-discovered-check)
```

This state expands upstream's Racing Kings perft data with deeper and
near-discovered-check positions. The variant and perft fixture remain
unsupported in chess.ts, so no TypeScript runtime or test change applies.

### Synchronization log

| Upstream state | TypeScript disposition |
| --- | --- |
| `8e91525e` | Added Stockfish 16.1 WDL source and test behavior. |
| `315052c0` | Python annotation correction; TypeScript already used `ply: number`. |
| `d1dce61a` | Python documentation dependency only; not applicable. |
| `4c7a9025` | Python `TypeAlias` annotations; TypeScript aliases already explicit. |
| `6af0ff4c` | Expanded core constants into individually typed declarations and named arrays. |
| `716a0b94` | Required EPD operation codes to begin with a Unicode letter and ported the regression test. |
| `df714e39` | Corrected the upstream Chess960 perft fixture; chess.ts does not mirror that fixture. |
| `eaa6eb3b` | Corrected the upstream Crazyhouse perft fixture; chess.ts does not mirror that fixture. |
| `59cadb1f` | Upstream README external-project gallery only; not applicable. |
| `3829d262` | Upstream Syzygy `Tablebase.add_file()` refactor; pending the unsupported module's translation. |
| `a41c3c88` | Upstream Syzygy maximum-piece check deferral; pending the unsupported module's translation. |
| `95803fc6` | Upstream Syzygy alpha-beta search limit; pending the unsupported module's translation. |
| `474c87bf` | Ported the additional SAN disambiguation regression assertion. |
| `ec8ecec5` | Upstream README listing removal only; not applicable. |
| `63aac2ec` | Exposed optional occupied masks on attack queries and characterized bitboard and iterable overrides. |
| `7836d446` | Upstream SVG rich-display wrapper; pending the unsupported module's translation. |
| `247d8a06` | Upstream changelog only; not applicable. |
| `32253d6c` | Renamed `TimeControlType.UNKNOW` to `UNKNOWN` and updated the default. |
| `ec399d1b` | Removed the generic `_BoardState` subclass hook; engine protocol, Syzygy, and variant typing changes remain unsupported. |
| `caefd4dc` | Engine protocol `_next_token()` cosmetics; unsupported module, so not applicable. |
| `71e7c31f` | Engine protocol assertion diagnostics; unsupported module, so not applicable. |
| `72992166` | Engine protocol dispatch fix and regression test; runtime remains unsupported and the test is tracked as a TODO. |
| `5826ef5d` | SVG board-offset fix; pending the unsupported board renderer's translation. |
| `0e7fabc8` | Added and ported the UTF-8 BOM PGN fixture regression. |
| `c0d3c917` | Removed superfluous Python parentheses; TypeScript was already idiomatic. |
| `30d99104` | Prepared upstream 1.11.0 and updated the mirrored library version. |
| `46c28883` | Upstream `release.py` formatting revert only; not applicable. |
| `08697b29` | Upstream Twine and wheel release tooling only; not applicable. |
| `d4b31904` | Replaced singular PGN comment storage with ordered arrays and ported multiple-comment parsing, traversal, annotations, and export. |
| `ab0e066d` | UCI option parsing fix remains pending with the unsupported engine process layer; tracked its two new tests as TODOs. Upstream Fairy-Stockfish setup and tox changes are not applicable. |
| `7f123cb5` | Removed deprecated `flipped` from the unsupported SVG board renderer; no TypeScript runtime change applies. |
| `f2b04523` | Removed deprecated `BaseVisitor.parseSan()` and routed PGN parsing directly through `Board.parseSan()`. |
| `b2657ebc` | Removed deprecated `Wdl`/`PovWdl` tuple behavior while preserving dataclass-like exact-field value equality. |
| `6228bac5` | Upstream Sphinx documentation dependency update only; not applicable. |
| `e2041699` | Aligned the core en-passant capture-square expression; Python-only definite assignment and unsupported engine/Syzygy typing changes are not applicable. |
| `c42749de` | Upstream engine protocol `options` abstraction; pending the unsupported engine protocol's translation. |
| `7553d411` | Made `GameNode.parent` and `GameNode.move` getter-only, with narrowed immutable accessors on roots and child nodes. This prevents consumers from corrupting ancestry or move identity and is an upstream-compatible breaking change. |
| `f7736478` | Initialized the PGN reader board stack before the skip-game branch, matching upstream control-flow typing. |
| `0c8fed28` | Made PGN builders generic and preserved concrete `Game`/`Headers` subclasses through constructors, static helpers, and results. |
| `ef13fdbf` | Upstream Pyright CI integration; strict TypeScript library/test compilation already covers the corresponding surface. |
| `100b1c8b` | Upstream Pyright command-line workflow fix only; not applicable. |
| `d625be1d` | Upstream UCI `movesleft` info parsing; pending the unsupported engine process layer, with exact test movement tracked as TODOs. |
| `518d662e` | Accepted lc0's `a1a1` null-move spelling, restored `Board.parseUci()`'s null-move fast path, and characterized parsing plus reversible push/pop behavior. |
| `aa98f319` | Merged upstream 1.11.1 release metadata and updated only the mirrored python-chess `__version__`; npm package versioning remains independent. |
| `78c765b4` | Simplified portable `os.O_BINARY` access in the unsupported Polyglot and Syzygy modules; no TypeScript runtime change applies. |
| `18d53b92` | Removed an unused Python `Generic` import; TypeScript generic declarations are unaffected. |
| `bbf2a05e` | Updated upstream Gaviota tablebase data-source records; neither the unsupported module nor its data files are distributed by chess.ts. |
| `91699cd1` | Recorded the shorter Gaviota rewrite exactly. It remains unsupported in chess.ts and was later reverted upstream after regressions. |
| `3a974697` | Narrowed imports in the unsupported Gaviota module to type-only symbols; no TypeScript runtime change applies. |
| `f93a7ffb` | Corrected a documentation typo in the unsupported Syzygy module; no TypeScript runtime change applies. |
| `636e95fb` | Reverted the regressed Gaviota rewrite byte-for-byte to its prior implementation; Gaviota remains unsupported in chess.ts. |
| `dd4d9c12` | Fixed en-passant resolution in the unsupported pure-Python Gaviota tablebase; `test_ep_is_best` is tracked explicitly as a translation TODO. |
| `06de70e2` | Fixed checkmating en-passant captures in the unsupported pure-Python Gaviota tablebase; `test_ep_is_mate` is tracked explicitly as a translation TODO. |
| `45f616fa` | Added Python 3.13 to upstream packaging and CI metadata; no TypeScript runtime or tooling change applies. |
| `b3c1f62c` | Prepared python-chess 1.11.2 and updated only the mirrored `__version__`; npm and historical transpiler versions remain unchanged. |
| `ffa04827` | Added public API documentation for board mutation, move legality, game-over detection, and result reporting, using camel-cased TypeScript links. |
| `b2144c25` | Removed upstream's repository-specific CodeQL workflow; chess.ts has no corresponding copied workflow. |
| `760360b8` | Applied explicit read-only repository contents permission to the chess.ts CI workflow. |
| `6b1cfedd` | Adjusted Python bytearray construction in the unsupported Gaviota module for newer mypy releases; no TypeScript runtime change applies. |
| `376d6036` | Added Python 3.14 to upstream packaging and CI metadata; no TypeScript runtime or tooling change applies. |
| `e4386c2f` | Removed Python's deprecated `DefaultEventLoopPolicy` compatibility layer from the unsupported engine process module; no TypeScript runtime change applies. |
| `e974a37e` | Narrowed the external Stockfish forced-mate test horizon to avoid an ambiguous mating line; the unsupported integration test remains an explicit TODO. |
| `8412bd56` | Updated coroutine-function introspection in the unsupported Python engine process layer for Python 3.15 compatibility; no TypeScript runtime change applies. |
| `624d3a73` | Disabled fail-fast behavior in upstream's CI matrices so all job results remain visible; the chess.ts workflow has no matrix. |
| `1ce4d3f8` | Added public rank/file aliases, constants, collections, parsers, formatters, and square-helper signatures. The TypeScript parsers fail explicitly instead of leaking JavaScript's `indexOf()` sentinel. |
| `4d9b3bfd` | Opened Gaviota table files read-only upstream; pending the unsupported module's translation. |
| `0e900e24` | Added `Board.givesCheckmate()` with restoration guarantees for both successful probes and exceptions. |
| `11399c63` | Reordered UCI engine configuration so `Hash` follows `Threads`; pending the unsupported engine process layer's translation. |
| `76cbe984` | Required `BaseBoard.king()` to find exactly one eligible king and ported the multiple-king regression test. |
| `312f3bf0` | Introduced `_effectivePromoted()` and routed default FEN rendering, king and castling rules, position status, Chess960 recognition, and transposition identity through it. Variant overrides remain pending with the unsupported variant module. Ported the existing promoted-comparison test. |
| `f780f420` | Corrected the spelling of "instantiate" in the canonical `GameNode.addVariation()` child-construction comment; no runtime behavior changed. |
| `c0c5cb08` | Corrected a spelling mistake in an upstream README external-project description; the gallery is not copied into chess.ts. |
| `2b2f1497` | Added `BaseBoard.pieceCount()` and ported the complete board-clearing regression test. Gaviota and Syzygy call-site updates remain pending with those unsupported modules. |
| `b53c6e60` | Corrected `Board.chess960Pos()` documentation from the incomplete 0–956 range to all indices 0–959. |
| `77f1dab8` | Inserted the conventional space after the ellipsis when `Board.variationSan()` begins with a black move and updated the translated regression expectation. |
| `8330cfd5` | Rejected positions with multiple stepping checkers and translated the complete `BoardTestCase.test_status` regression. Atomic's exception remains pending with the unsupported variant module. |
| `24c2d5a2` | Removed an obsolete status badge from the upstream README; chess.ts does not copy that README badge. |
| `e88e7f05` | Accepted Python-whitespace indentation before PGN headers and translated the complete parser regression. Added exact Python `lstrip()`/`isspace()` characterizations because ECMAScript whitespace semantics differ. |
| `9c24454d` | Expanded upstream's Racing Kings perft data with depth-five and near-discovered-check positions; the unsupported variant fixture is not copied into chess.ts. |

### Intentional upstream divergence

In `1ce4d3f8`, upstream's new `parse_rank()` and `rank_name()` implementations
refer to `FILE_NAMES`, despite their rank-oriented docstrings and the adjacent
`RANK_NAMES` declaration. `chess.ts` intentionally uses `RANK_NAMES` in both
places. Exhaustive round-trip tests protect that intended API and distinguish
this two-line correction from accidental translation drift. No upstream issue
or pull request is part of this synchronization stack.

## Promoted-piece compatibility boundary

`promoted` remains the canonical raw bitboard. Parsing, explicit
`boardFen({ promoted: true })` serialization, copying, stack restoration,
captures, transformations, and promotion propagation continue to use it
directly. `_effectivePromoted()` is a rule-policy view only. Its standard
implementation returns `BB_EMPTY`; translated variants may later override it
when their rules make selected promotion markers semantically relevant.

There is no stored-FEN migration in this state. Standard chess's default FEN
continues to omit promotion markers, `promoted: false` continues to suppress
them, and `promoted: true` continues to emit the raw markers. The only private
representation change is one additional effective-promotion bitboard segment
inside `_transpositionKey()`. That key is rebuilt in memory, is not a persisted
or public contract, and must not be compared across library versions.

## Original baseline provenance

The original selected upstream baseline is:

```text
cd7f5958289dd08156436a1f84b9ea03cb1f75a1
v1.10.0-69-gcd7f5958
2024-01-01 — Update to CodeQL 3
```

This baseline was recovered by comparing the Git blob IDs for all eight
non-empty Python implementation modules, the test suite, and its copied PGN
fixtures. Commit `eb0772284bf959ee1a2960981874302a29c30a8b` has the same
relevant blobs; `cd7f5958` changes only the upstream CodeQL workflow and is the
latest of those indistinguishable snapshots. The copied files alone therefore
cannot prove which of the two commits was originally used. We select the later
commit as the canonical pin so the repository has one deterministic baseline.

Each originally copied implementation file is identical to the file at that
commit:

| File | Git blob |
| --- | --- |
| `chess/__init__.py` | `a9328a04b90ed60d52bfb83e193889cee55bea7a` |
| `chess/engine.py` | `b1d3896abb41faf15b4c1ff4223babcbdc926cb5` |
| `chess/gaviota.py` | `39173b5933324a48c3054a9e8d55ca9949b9725a` |
| `chess/pgn.py` | `55eddbc2942f0df8042a32eb99de31a2ce62b529` |
| `chess/polyglot.py` | `44a68caa53974b2edf3f1ba7ef496e24d6021417` |
| `chess/svg.py` | `d3d19e89e072bfbe3de3ff0341ab78e2161fb8c7` |
| `chess/syzygy.py` | `e1fe07eb716bda1abcd0bfc261354ba888ba9530` |
| `chess/variant.py` | `6160696a2013bb1f38875cf5899f054303b7307f` |

`python-chess/test.py`, its fixtures, and the implementation sources all come
from that one gitlink. TypeScript tests retain the upstream class name, method
name, and source line so future upstream changes can be reviewed and translated
one upstream `master` first-parent state at a time.

The test-sync check verifies the Git blobs for the pinned implementation,
`test.py`, and every selected PGN fixture before running the translated suite. A
generated TODO ledger accounts for every upstream test method, including tests
for python-chess modules that chess.ts has not implemented yet; those entries
remain visible instead of being silently dropped.

## Test translation baseline

Run the complete check from the repository root with:

```sh
npm --prefix chess test
```

The initial baseline translates 76 of the 282 methods in the frozen upstream
suite: all Square, Move, Piece, LegalMoveGenerator, BaseBoard, and SquareSet
tests; 36 Board tests; and 6 PGN game-tree tests. Three additional chess.ts
characterization tests cover PGN round-tripping and python-chess's allowance
for distinct same-move child variations. The generated
`chess/test/upstream-todos.test.ts` file is the canonical, mechanically checked
count of the remaining work.

The first parity pass translates six additional PGN tests and two Engine tests,
bringing that checkpoint to 84 passing upstream methods. The EPD opcode update
adds one translated regression test, and the UTF-8 BOM regression adds another,
for a total of 86 of 285 upstream methods at that checkpoint. The
multiple-comment update adds one translated PGN regression, for a current
total of 87 of 286 upstream methods at that checkpoint. The UCI option update
adds two untranslated engine tests, for a total of 87 of 288 methods and 201
explicit TODOs at that checkpoint. The two later Gaviota regressions bring that
inventory to 87 of 290 upstream methods and 203 explicit TODOs. The
multiple-king regression brings that inventory to 88 of 291 upstream methods
and 203 explicit TODOs. Translating the promoted-comparison test brings the
current inventory to 89 of 291 upstream methods and 202 explicit TODOs.
Adding `BaseBoard.pieceCount()` and translating the complete board-clearing
test brings the current inventory to 90 of 291 methods and 201 explicit TODOs.
Translating the complete board-status test brings the current inventory to 91
of 291 methods and 200 explicit TODOs.
Translating the leading-whitespace PGN regression brings the current inventory
to 92 of 292 methods and 200 explicit TODOs.
Translating board equality, null-move restoration, threefold-repetition,
fifty-move, and irreversible-move tests brings the current inventory to 97 of
292 methods and 195 explicit TODOs. The fifty-move test exposed and corrected
a translation defect: claim probes must enumerate legal moves, not merely
pseudo-legal moves, so a checkmated player cannot claim a draw.
Forty-two chess.ts-only
characterizations cover the original three game-tree cases plus polymorphic
`BaseBoard` construction, Python-compatible float formatting, Unicode-aware
PGN wrapping, comment sanitization, attack-query occupancy overrides, and
TypeScript's parser-versus-tree comment visitor boundary. One also guards the
Python-list/JavaScript-array truthiness adaptation in `GameNode.next()`.
The latest characterization protects `Wdl` and `PovWdl` value equality while
proving that their deprecated tuple-era surface is gone.
Getter-only node identity is protected by both compile-time assignment
failures and runtime mutation checks.
Another checks both compile-time inference and runtime construction for
subclass-preserving PGN builders. Specialized builders must receive their
concrete constructor, so their result types can not claim a subclass while
instantiating the base class.
Five characterize lc0-style `a1a1` null moves across raw parsing, board
parsing, reversible push/pop, invalid same-square spellings, and the distinct
raw-but-illegal `a1a1q` case.
One guards the independently mirrored python-chess version constant, and
another protects the unchanged historical transpiler-version marker.
Twelve cases exhaustively cover the public rank/file constants, names,
parsers, invalid-input matrix, and unbranded TypeScript signatures. Four more
cover mating, checking-but-not-mating, non-checking, and exceptional
`Board.givesCheckmate()` probes while requiring exact FEN and move-stack
restoration.
One focused subclass characterization proves that `_effectivePromoted()`
controls default FEN output, unique-king lookup, castling, position status,
Chess960 recognition, and transposition equality without replacing or losing
the raw promotion bitboard.
Five more distinguish Python's exact whitespace set from ECMAScript's, preserve
initial multi-BOM handling as a separate PGN rule, and prove that header
probing does not mutate the raw line later consumed as movetext.

An untranslated upstream test is a visible `test.todo`. A translated test that
exposes an existing parity defect is instead an executable Vitest expected
failure: it must continue to fail until a focused fix lands, and CI will reject
an unexpected pass. The behavior-neutral baseline found these root defects:

- EPD operation parsing truncated the fifth field before parsing it.
- Empty JavaScript arrays did not preserve Python list truthiness in castling
  cleanup.
- Legal and pseudo-legal generator iterators returned a nested iterator instead
  of delegating to it.
- `BaseBoard` defaulted to an empty board instead of the starting position.
- `SquareSet` did not provide SquareSet value equality or iterable
  set-to-set operations.
- PGN `FileExporter` was unimplemented.
- `GameNode.demote()` did not perform its intended tuple swap.

The focused parity commits following the baseline resolve every item above and
remove its expected-failure marker. Translating the additional PGN and Engine
tests, then comparing their surrounding code line-by-line, also exposed and
fixed:

- malformed PGN regular-expression flags, groups, and replacement callbacks;
- clock and elapsed-time formatting that did not use Python's exact
  round-half-even rules;
- UTF-16 code-unit counting and partial closing-brace removal during PGN export;
- `Score` equality and ordering that relied on JavaScript array identity and
  string coercion; and
- polymorphic `BaseBoard` construction that did not preserve the dynamic class
  and explicit-empty constructor argument.

This does not imply that all of chess.ts is proven equivalent: the 200 TODOs
keep unported tests and unimplemented subpackages visible. It does mean that
every currently translated upstream test passes without an expected-failure
waiver.

To add or remove translated tests, preserve the upstream class and camel-cased
method names in the TypeScript suite, record the exact `test.py` source line in
the `registerTestCase()` metadata, then regenerate the ledger:

```sh
python3 scripts/sync_python_chess_tests.py
```

The sync script uses the TypeScript compiler AST to accept only real top-level
registrations, then rejects stale generated output, modified frozen blobs,
duplicate source-line claims, mismatched class/method identities, and
incomplete runtime metadata.

## Frozen upstream verification

The original selected baseline was also run directly under Python 3.14.5:

```text
Ran 282 tests
OK (skipped=14)
```

The skips require optional Crafty, Gaviota, or Syzygy resources. The Square,
Move, Piece, and complete Board test classes ran 92 tests with no skips or
failures. This verifies that expected failures in the TypeScript baseline are
chess.ts translation gaps rather than failures already present upstream.

## Duplicate-variation behavior

The frozen Python implementation deliberately allows a game node to contain
multiple child nodes with equal moves. `add_variation()` always appends a new
`ChildNode`; equal-move children can retain different comments and divergent
subtrees, and PGN parsing/export preserves both. Lookup or mutation by move
selects the first matching child, while passing a child node targets that exact
duplicate.

The chess.ts characterization tests preserve this current behavior. A future
collaboration layer may choose to converge concurrent identical moves into one
child, but that would be an explicit Hyperchess product policy that narrows the
general python-chess model—not a parity fix in this library.

## Multiple PGN comments

The `d4b31904` synchronization is an intentional, upstream-compatible breaking
change: `GameNode.comment` and `ChildNode.startingComment` are replaced by the
sole mutable representations `comments: string[]` and
`startingComments: string[]`. There are no singular compatibility aliases,
because maintaining two writable representations would allow them to diverge.

The singular constructor option names remain compatible with upstream and
accept either one string or an array. Empty inputs normalize to a fresh empty
array; a non-empty input array remains aliased exactly as it does upstream.
The PGN parser still sends one string per parsed comment to visitors, while
tree traversal sends the node's actual array once. TypeScript visitor methods
therefore honestly accept `string | string[]` at that boundary. Export emits
each stored entry as its own `{ ... }` comment, preserves entry whitespace,
and removes braces from comment content.

## Deprecated API removals

The `f2b04523` and `b2657ebc` states deliberately remove deprecated behavior
rather than retaining TypeScript-only aliases. `BaseVisitor.parseSan()` is no
longer an interception point: `readGame()` calls `beginParseSan()` and then
parses the recognized token on the board itself. `PovWdl` no longer exposes
`iter()`, `len()`, `getitem()`, or equality with arrays, and `Wdl` no longer
exposes `iter()` or `reversed()`.

Python supplies value equality for `Wdl` and `PovWdl` through dataclasses.
TypeScript preserves that semantic explicitly with `equals()`: `Wdl` compares
its three numeric fields, while `PovWdl` compares the relative `Wdl` by value
and requires the same exact `turn`; both also require the same runtime class,
as Python dataclass equality does. In particular, opposite-turn values that
normalize to the same White point of view are no longer equal.

## Update discipline

The intended update unit is the next commit on python-chess `master`'s
first-parent history together with the corresponding TypeScript source and test
changes. Do not update the Python pin independently of its translation.

The distinction matters because upstream uses feature branches. Replaying every
commit in the reachable DAG would expose temporary feature-branch states,
including changes that are revised or reverted before merge, and would require
moving the gitlink sideways between divergent branches. Follow the stable
first-parent sequence instead:

```text
previous upstream master state
        │
        ├─ feature-branch edits → revisions → fixes
        │
        └─ merge commit on master
                    │
                    ▼
one chess.ts synchronization commit for the merge's first-parent diff
```

For a non-merge commit, translate that commit's direct diff. For a merge commit,
translate the aggregate diff from its first parent to the reviewed merge result;
do not separately expose the branch's intermediate states. Keep one chess.ts
commit per first-parent state and identify the full upstream SHA in the commit
message or an `Upstream-Commit` trailer. A Python-only, documentation-only, or
currently unimplemented-module step still receives an explicit synchronization
commit recording why no TypeScript runtime change applies.

Clone this repository with `--recurse-submodules`, or initialize an existing
checkout before testing:

```sh
git submodule update --init
```

The sync check verifies both the exact submodule commit and the relevant file
blobs. Advance the gitlink to exactly the next first-parent state only in the
same change that translates and verifies that state's source and test
differences.
