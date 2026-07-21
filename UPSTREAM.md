# python-chess synchronization

`chess.ts` is a mechanical TypeScript translation of
[`python-chess`](https://github.com/niklasf/python-chess). The `python-chess/`
submodule currently pins:

```text
d1dce61a45ed3784ce867ec0218d6fb3ca47e735
v1.10.0-72-gd1dce61a
2024-04-18 — Bump Sphinx to 7.3.6
```

This upstream state changes only the Python documentation toolchain. It is an
explicit TypeScript semantic no-op; advancing the pin still records that the
state was reviewed rather than silently skipped.

### Synchronization log

| Upstream state | TypeScript disposition |
| --- | --- |
| `8e91525e` | Added Stockfish 16.1 WDL source and test behavior. |
| `315052c0` | Python annotation correction; TypeScript already used `ply: number`. |
| `d1dce61a` | Python documentation dependency only; not applicable. |

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
bringing the current total to 84 passing upstream methods and 198 explicit
TODOs. Seven chess.ts-only characterizations cover the original three game-tree
cases plus polymorphic `BaseBoard` construction, Python-compatible float
formatting, Unicode-aware PGN wrapping, and comment sanitization.

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

This does not imply that all of chess.ts is proven equivalent: the 198 TODOs
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
