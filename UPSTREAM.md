# python-chess baseline

`chess.ts` is a mechanical TypeScript translation of
[`python-chess`](https://github.com/niklasf/python-chess). The `python-chess/`
submodule pins this selected upstream baseline:

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
tests; 36 Board tests; and 6 PGN game-tree tests. The generated
`chess/test/upstream-todos.test.ts` file is the canonical, mechanically checked
count of the remaining work.

All 76 upstream method bodies are emitted into
`chess/test/python-generated.test.ts` by the deterministic compiler in
`scripts/python_test_compiler/`; none is maintained as a hand-written
TypeScript test. The compiler also carries all 53 Python comments in those
methods and all 406 upstream assertion calls into the generated file.

The 13 hand-written runtime tests in this baseline are not translations:
`python-assertion-oracle.test.ts` has five integrity tests for the finite oracle
and `errors.test.ts` has eight contract tests for the target error taxonomy.
They test translation infrastructure and the explicit TypeScript runtime
boundary. This PR contains no chess.ts-only product characterization tests.

The compiler is deliberately layered from small target-language facts outward:

1. `source.py` parses the frozen file once into Python's AST, tokenizes it once,
   validates the exact 76-method selection, and assigns every comment token to
   its method.
2. `target.py` defines immutable target shapes such as `BIGINT`, `MOVE`,
   `array_of(MOVE)`, and nullable values, plus flow evidence such as an exact
   sequence length or a repeated proved attribute shape. These values carry
   evidence used by later rules; they are not runtime type guesses.
3. `registry.py` contains the finite chess.ts symbol, property, call, and Python
   exception contracts needed by the selected source. Call contracts own target
   naming, constructor-versus-call syntax, keyword layout, structural protocols,
   argument adapters, result adapters, and dependent result refinements. Their
   constructors reject inconsistent adapter indices, overlapping adapters,
   invalid keyword layouts, and refinements on non-sequence arguments. A missing
   or incompatible contract remains `UNKNOWN`; it never acquires semantics from
   a similarly named method or constant.
4. `native.py` lowers one proved operation at a time: truthiness, equality,
   containment, and native set algebra. Each rule accepts only the shapes for
   which the emitted TypeScript has the same meaning and otherwise fails.
5. `lower.py` recursively handles one Python statement or expression kind at a
   time, composes the smaller target rules, and carries lexical flow facts.
   Parent handlers lower their children and assemble the result; there is no
   textual or coercive fallback. Generation fails unless every semantic AST
   node and every comment token is claimed. Python identifier segments use the
   repository's deterministic snake-case-to-camel-case rule, and `tsc` then
   checks the generated calls against the real TypeScript API.
6. `gaps.py` overlays current chess.ts parity gaps by exact upstream test and
   AST source span. It contains no replacement test bodies or copied upstream
   assertion operands. Its recursive AST fingerprint includes every node type,
   field name, empty/default value, and scalar type without depending on
   `ast.dump()` formatting, so Python 3.12 and newer supported interpreters
   produce the same provenance hash.
7. `assertion_oracle.py` executes every selected method that has no declared
   parity gap against the frozen Python implementation and records its runtime
   assertion observations. The TypeScript harness consumes those observations
   in exact order using a finite, fail-closed value vocabulary.
8. `suite.py` renders the test file and
   `chess/test/python-generated.provenance.json`. The provenance ledger records
   each method's exact source span, source hash, normalized AST hash, comments,
   and parity-gap cases.

Generated tests use ordinary TypeScript operations such as `.length`,
`Array.from()`, `Set`, bigint operators, domain `.equals()` methods, and explicit
assertion predicates. They do not import a Python-semantics runtime or emit
`py.*` compatibility calls. The harness evaluates each generated predicate once
and gives the oracle the original operands, so assertion checking does not hide
the selected equality or containment rule.

Compiler-created bindings use source-aware fresh names, and a shared bind-once
rule preserves Python's left-to-right evaluation order whenever a target
operation must refer to an operand more than once. JavaScript-number arithmetic
is guarded with `Number.isSafeInteger()`; an out-of-range result fails explicitly
instead of silently rounding a Python integer. Source bindings that collide
after identifier normalization, unsupported Python function-scope leakage, and
unproved protocols fail compilation. Shape-changing assignments use a general
SSA-style target binding rule; they are rejected when a generated lexical
boundary or an earlier lazy-generator capture would change Python binding
semantics. Mutable exact-length facts are dropped on aliasing or mutation,
including mutations compiled inside loops and `assertRaises` callbacks.

Narrowing a nullable API result likewise requires explicit evidence. The PGN
`add_line()` contract consumes the exact cardinality of an unaliased list value
produced by a literal or another proved eager, length-preserving list operation.
A non-empty input refines the returned node through a runtime `ChildNode` guard;
the same cardinality produces a composable repeated-`parent` fact, so a
three-move line proves two child parents without a three-move test-specific
rule. Empty, aliased, mutated, and unknown-length inputs retain the API's broad
`GameNode` result. The compiler is intentionally a finite translator for the
selected tests, not a partial Python runtime with permissive fallback behavior.

### Compiler decision boundary

The compiler cannot be API-independent: Python and chess.ts differ in names,
constructor syntax, keyword conventions, accepted target representations, and
occasionally target return types. Those unavoidable decisions have one
auditable home and must not be rediscovered from a particular test body:

- `lower.py` branches on Python AST kinds, proved shapes and flow facts, and
  explicit Python builtin/unittest constructs. A focused architecture test
  parses the module and confines qualified target API literals to the finite
  TypeScript declaration-type renderer.
- `registry.py` declaratively states each chess.ts boundary difference. For
  example, the `Game.add_line` entry—not an `if add_line` branch in the AST
  lowerer—owns its keyword object and non-empty-sequence result refinement.
- `native.py` owns type-directed Python semantics such as truthiness, equality,
  containment, and set algebra. Its Piece-equality capability probe is
  necessarily specific to `Piece`, but not to a test identity or source span:
  Python set construction must compare same-hash Pieces, while the current
  production class lacks the equality method the operation is meant to test.
- `gaps.py` is the only layer allowed to decide that a particular upstream test
  and source span expects a current production divergence. Gap-only target
  adapters and the missing `FileExporter` constructor refuse to render without
  that exact root authority.

The target-boundary exceptions that need individual justification (as distinct
from ordinary recursive AST and Python-builtin lowering) are small enough to
audit directly:

| Mapping | Why it exists | Evidence required before emission |
| --- | --- | --- |
| Python construction to TypeScript `new` | The target exposes classes, while Python call syntax does not distinguish construction. | A named constructor contract with exact positional and keyword shapes. |
| Python keywords to an options object or positional tail | The two public APIs encode optional arguments differently. | The registered call contract; unknown, duplicate, or misplaced keywords fail. |
| Python exception family to chess.ts constructor and message behavior | The target implements the Python-named error hierarchy, but `KeyError` stringification is not ordinary `Error.message` stringification. | A registered constructor and an explicit ordinary-message capability; unregistered families fail. |
| `SquareSet(number)` to `new SquareSet(BigInt(number))` | chess.ts accepts a bigint mask; the compiler's `NUMBER` shape proves a safe integral value. | The argument must have the proved integral-number shape. |
| Bitboard transform of a `SquareSet` to `transform(value.int())` | Python's `SquareSet` is an `int` subclass; chess.ts uses a wrapper object. | The callable and argument shapes must be the registered transform and `SquareSet`. |
| Local legal-move board to the target `Board` parameter | The Python protocol is structural, but the current TypeScript constructor is typed to the concrete class. | A local object with the required zero-argument `generate_legal_moves` method; the result is capability-limited to iteration/count/truthiness. |
| `StringIO.getvalue()` to `StringIO.read()` | The equivalent target helper uses a different public method name. | A `StringIO` receiver and the registered zero-argument method contract. |
| Non-empty `Game.add_line(sequence)` to `ChildNode` | The Python API guarantees the last newly added child, while the target declaration returns broad `GameNode`. | An unaliased, unmutated exact positive sequence length plus a runtime `ChildNode` guard. |
| `Piece` value equality probe | Python hashing/set semantics require equality after a hash match; production chess.ts currently lacks that method. | A proved `Piece` operation; the visible marker names the implementation gap and absence fails loudly. |
| `SquareSet` iterable/value casts and `symmetricDifference` result cast | These bridge recorded production parity defects, not ordinary translation. | The exact registered gap root and exact AST cause identity. |
| Missing `FileExporter` constructor | The selected upstream test covers a capability chess.ts does not implement yet. | The exact registered gap root and exact AST cause identity; lookup fails with a named error. |

Everything else is recursive syntax lowering or shape-directed native semantics;
none of the rows is selected by test name, source line, variable name, literal
move list, or surrounding assertion.

Here, a compiler “proof” means machine-checked evidence inside this finite
translation surface, not a formal proof of the two libraries. Registry entries
are the small, human-reviewable axioms that state how two intentionally
different public APIs correspond. Once an entry is accepted, a test body cannot
override it: operands must acquire its required shapes and flow facts through
the ordinary recursive rules, or compilation fails. Confidence therefore comes
from reviewing the finite boundary contracts once, then relying on exhaustive
AST/comment claiming, deterministic regeneration, strict target typechecking,
and the independent frozen-Python assertion oracle for every use.

Tests also prove that test identities occur only in selection/gap data, target
escape markers occur only in the registry/native contract layers, local board
test doubles are matched structurally rather than by the name `MockBoard`, and
array-backed Piece sets use the ordinary iterable lowering path. Adding a new
API difference therefore means adding or extending a target contract, not
matching another convenient AST snippet from an upstream test.

Generated TypeScript assertions are also inventoried. A type escape is admitted
only when its adjacent marker identifies the exact parity gap, missing
capability, or test-double protocol that requires it; ordinary generated paths
do not use non-null assertions or unmarked casts.

`ValueError` and `KeyError` are public chess.ts error classes with the exact
Python names. Move errors inherit from `ValueError`, and translated
`assertRaises` blocks reference the concrete constructors directly. The
cross-runtime contract covers family, name, and inheritance; message text uses
the existing TypeScript rendering and is not promised to reproduce Python
`repr()` byte-for-byte.

The generated suite, provenance file, and
`chess/test/python-assertion-oracle.generated.ts` are regenerated in memory by
CI. The oracle currently checks all 1,917 runtime assertion events from the 61
gap-free methods. Its other 15 methods are explicitly excluded by the same
exact parity-gap manifest rather than silently omitted. The focused compiler
tests exercise its atomic rules and rejected inputs, validate every gap
selector, and prove that no other `.test.ts` file registers an upstream method.
The assertion oracle and public error contracts have focused runtime tests.

An untranslated upstream test is a visible `test.todo`. Fifteen translated
methods reach 51 exact assertion/error boundaries associated with eight
current parity gaps. A mismatch boundary runs the original upstream assertion
and requires it to fail specifically as an assertion. It does not treat an
exception raised while evaluating an operand as the known mismatch. It also
does not pin which non-upstream value caused the mismatch, so a different wrong
value remains a failing upstream assertion and can satisfy the marker. Error
boundaries are narrower: the compiler evaluates the exact source-selected
cause and checks its error family and message while retaining the complete
outer assertion in generated, typechecked dead code. A marker fails when the
upstream behavior starts passing, while assertions before and after a
continuing boundary still run. The eight roots are seven implementation/port
defect groups covering eight defects, plus one intentionally unimplemented
capability:

- `Piece` has no public value-equality implementation. Eleven exact boundaries
  require the missing `.equals()` capability; set construction uses hashes only
  to choose candidates, as Python does, and never manufactures equality from a
  hash or representation.
- EPD operation parsing truncates the fifth field before parsing it.
- Empty JavaScript arrays do not preserve Python list truthiness in castling
  cleanup.
- legal and pseudo-legal generator iterators return a nested iterator instead
  of delegating to it.
- `BaseBoard` defaults to an empty board instead of the starting position.
- The `SquareSet` value-semantics group covers two stacked defects: SquareSet
  lacks the iterability required by value equality and set-to-set operations,
  and `symmetricDifference()` returns a raw bigint instead of a `SquareSet`.
- PGN `FileExporter` is the intentionally unimplemented capability.
- `GameNode.demote()` does not perform its intended tuple swap.

These markers deliberately keep functional parity fixes out of the
test-baseline PR. The one production-facing addition here is the explicit
`ValueError`/`KeyError` taxonomy required to express upstream assertions without
accepting unrelated TypeScript errors. Replace each gap case with ordinary
generated execution in the same focused change that fixes or implements its
root cause.

To translate another upstream test, add its identity to
`TRANSLATED_TESTS`, then add the smallest missing syntax or semantic rule and a
focused compiler/runtime test. Do not add a parallel hand-written upstream
body. Regenerate all checked artifacts with:

```sh
node scripts/run_python.mjs scripts/sync_python_chess_tests.py
```

The sync script uses the TypeScript compiler AST to accept only real top-level
registrations. It rejects stale generated output or provenance, modified frozen
blobs, unclaimed Python syntax/comments, stale gap selectors, duplicate
source-line claims, mismatched class/method identities, and incomplete runtime
metadata. The compiler's focused unit tests live in
`test_transpilation_helper.py` and run as part of `npm --prefix chess test`.

## Frozen upstream verification

The selected upstream commit was also run directly under Python 3.14.5:

```text
Ran 282 tests
OK (skipped=14)
```

The skips require optional Crafty, Gaviota, or Syzygy resources. The Square,
Move, Piece, and complete Board test classes ran 92 tests with no skips or
failures. This verifies that the known TypeScript parity gaps are not failures
already present upstream.

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
