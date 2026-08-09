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
latest of those indistinguishable snapshots. We select the later commit as the
canonical pin so the repository has one deterministic baseline.

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
from that one gitlink. Generated TypeScript tests retain the upstream class,
method, and source line so future changes can be reviewed one upstream
first-parent state at a time.

The sync check verifies the Git blobs for the pinned implementation, `test.py`,
and every selected PGN fixture before running the translated suite. A generated
TODO ledger accounts for every upstream test method, including tests for modules
that chess.ts has not implemented yet.

## Source-fidelity contract

`chess.ts` translates the pinned implementation; it does not independently
reimplement the same API. Behavioral parity is necessary, but a translation is
not faithful when it reaches the same result through different decomposition,
control flow, state transitions, or abstractions.

Use the **glasses test**: mentally remove Python syntax and TypeScript syntax
from corresponding blocks. Their classes, methods, branches, local steps,
expression order, and comments should then be indistinguishable. Preserve those
features even when a target-specific refactor appears cleaner or more
idiomatic.

This gives developers who know `python-chess` immediate implementation-level
familiarity. It also provides an auditable provenance story for an unaffiliated
public port and minimizes judgment during updates: an upstream source hunk has
one obvious target location and one direct TypeScript expression.

JavaScript runtime differences are the exception, not permission to redesign a
block. When Python relies on a primitive JavaScript lacks or implements
differently, put one small semantic adapter in the target file's
`Custom declarations (no mirror in python-chess)` section. Keep chess-domain
logic in the source-shaped translated body. Examples include tuple ordering,
Unicode code-point length, and Python float formatting.

Never fold a target-only bug fix or behavior change into an upstream
synchronization. Preserve the selected Python behavior, pursue the correction
upstream, or make an intentional divergence a separate explicitly approved and
documented change. [`AGENTS.md`](AGENTS.md) is the concise mandatory contract;
[`py-to-ts-tips.md`](py-to-ts-tips.md) records the established language
mappings.

## Test translation boundary

Run the complete check from the repository root with:

```sh
npm --prefix chess test
```

The current boundary translates 84 of the 282 methods in the frozen upstream
suite: all Square, Move, Piece, LegalMoveGenerator, BaseBoard, and SquareSet
tests; 36 Board tests; 12 PGN tests; and 2 engine score tests. The generated
`chess/test/upstream-todos.test.ts` ledger keeps the other 198 methods visible.

All 84 upstream bodies are emitted into
`chess/test/python-generated.test.ts` by the deterministic compiler in
`scripts/python_test_compiler/`. None is maintained as a hand-written
TypeScript test. The compiler also carries all 57 Python comments and all 465
upstream assertion calls in those methods into the generated file.

The other Vitest files are explicitly not translations:

- `python-assertion-oracle.test.ts` and `errors.test.ts` test compiler/runtime
  infrastructure and the target error taxonomy.
- `core-parity-contracts.test.ts` and `pgn-parity-contracts.test.ts` characterize
  TypeScript API contracts and edge cases that are useful beyond the selected
  upstream bodies.

No file other than `python-generated.test.ts` may register an upstream test
identity. The compiler test suite enforces that rule.

## What "generated" and "oracle" mean

The automatic translation in this repository applies to the selected upstream
**test bodies**, not to the production TypeScript implementation. The test
system creates two artifacts through separate paths:

```text
SYNTAX PATH
python-chess/test.py -> AST compiler -> python-generated.test.ts -> run against chess.ts -> actual TypeScript assertion events

RUNTIME PATH
python-chess/test.py -> tracing TestCase against pinned Python -> python-assertion-oracle.generated.ts (expected Python assertion events)

COMPARISON
actual TypeScript event 1..n -> exact ordered match -> expected Python event 1..n
```

The first path checks source translation. It reads the frozen Python syntax
tree and emits a TypeScript test body without running that body. The second
path checks runtime behavior. It runs the original Python method against the
pinned Python implementation and records each passing assertion as a portable
event. That known-good event stream is the **assertion oracle**, also called a
golden assertion trace.

During Vitest execution, each translated assertion first performs its normal
TypeScript assertion against `chess.ts`. The harness then records the assertion
kind and its operands and requires them to match the next Python event. Checking
both layers matters: a compiler bug could mistranslate an expected expression
and still emit a TypeScript assertion that passes. The oracle detects that its
operands or execution order differ from the original Python run. It also
detects missing, extra, or reordered assertions when a loop or branch is
translated incorrectly.

Oracle values cross the language boundary only through an explicit canonical
form. For example, moves use UCI, boards use FEN, integers use exact decimal
strings, and non-integral numbers use their IEEE-754 bits. Unsupported values
fail generation rather than falling back to object internals or display text.

There are 465 assertion calls in the 84 selected source methods but 5,060
runtime oracle events because many calls execute repeatedly inside loops. These
figures describe one test selection at the pinned commit; they are integrity
counts, not separate tests written by hand.

The three generated artifacts are
`chess/test/python-generated.test.ts`,
`chess/test/python-generated.provenance.json`, and
`chess/test/python-assertion-oracle.generated.ts`. Regenerate them with
`python3 scripts/sync_python_chess_tests.py`; do not edit them directly.

## Deterministic compiler architecture

The compiler is deliberately built from small, composable rules:

1. `source.py` parses the frozen file once into Python's AST, tokenizes it once,
   validates the exact 84-method selection, and assigns every comment token to
   its method.
2. `target.py` defines immutable target shapes such as `BIGINT`, `MOVE`,
   `array_of(MOVE)`, nullable values, and finite domain shapes such as
   `WDL_MODEL`. It also carries flow evidence such as exact sequence length.
3. `registry.py` declares the finite chess.ts symbol, property, call, keyword,
   constructor, exception, protocol, and result contracts needed by the
   selected source. Missing or incompatible contracts remain `UNKNOWN` and
   cannot participate in semantic operations.
4. `native.py` lowers one proved operation at a time: truthiness, equality,
   ordering, containment, and set algebra. Each rule accepts only shapes for
   which the emitted TypeScript has the same meaning.
5. `lower.py` recursively handles one Python statement or expression kind at a
   time, lowers its children, and assembles the result. It has no textual or
   coercive fallback. Generation fails unless every semantic AST node and every
   comment token is claimed.
6. `gaps.py` owns the source-addressed expected-divergence mechanism. Its
   current manifest is empty: all 84 selected methods execute normally. It
   contains no replacement TypeScript or copied assertion operands.
7. `assertion_oracle.py` produces the golden assertion trace described above:
   it executes every selected method against the frozen Python implementation
   and records its runtime assertions. The TypeScript harness consumes those
   observations in exact order using a finite, fail-closed value vocabulary.
8. `suite.py` renders the generated test and
   `chess/test/python-generated.provenance.json`, including exact source spans,
   source hashes, normalized AST hashes, comments, assertion counts, and gap
   metadata for every method.

Generated tests use native TypeScript operations such as `.length`,
`Array.from()`, `Set`, bigint operators, and production `.equals()` methods.
They do not import a Python-semantics runtime or emit `py.*` compatibility
calls. The assertion oracle compares all 5,060 runtime observations from all
84 selected methods with the frozen Python run; `excludedMethods` is empty.

Integral oracle values compare by exact mathematical value across TypeScript
`number`, TypeScript `bigint`, and Python `int`. Non-integral binary64 values
compare by their exact IEEE-754 bits. This prevents decimal formatting from
hiding a float difference while preserving Python's integer-subclass behavior
for `SquareSet`.

Compiler-created bindings use source-aware fresh names. A shared bind-once rule
preserves left-to-right evaluation when an emitted operation must reference an
operand more than once. Integer arithmetic is checked with
`Number.isSafeInteger()` instead of silently rounding. Source bindings that
collide after identifier normalization, unsupported Python function-scope
leakage, unproved protocols, unclaimed syntax, and unclaimed comments all fail
compilation.

Mutable exact-length facts are dropped on aliasing or mutation, including
mutations inside loops and `assertRaises` callbacks. `Game.add_line()` can
therefore refine a broad `GameNode` result to `ChildNode` only from an
unaliasable, unchanged, exact positive sequence length. A runtime class guard
makes that target-only narrowing visible. Empty or unknown-length inputs keep
the public broad result.

Dereferencing any nullable result uses one general bind-once null guard. It
does not depend on a test name, literal value, or surrounding assertion, and it
does not use a postfix non-null assertion.

## Compiler decision boundary

The compiler cannot be API-independent: Python and chess.ts differ in naming,
constructor syntax, keyword layout, accepted representations, and some return
types. Those unavoidable axioms have one auditable home and are never inferred
from a test identity.

| Mapping | Why it exists | Evidence required |
| --- | --- | --- |
| Python call to TypeScript `new` | Python syntax does not distinguish construction. | A named constructor contract with exact positional and keyword shapes. |
| Python keywords to an options object or positional tail | The public APIs encode optional arguments differently. | The registered call contract; unknown or misplaced keywords fail. |
| Python exception family to chess.ts constructor | The target exposes the Python-named error hierarchy. | A registered constructor and explicit message capability. |
| `SquareSet(number)` to `SquareSet(BigInt(number))` | The target mask representation is bigint. | A proved safe integral-number shape. |
| Bitboard transform of `SquareSet` to `transform(value.int())` | Python's type is an `int` subclass; TypeScript uses a wrapper. | A registered transform and `SquareSet` operand. |
| Local legal-move board to concrete `Board` | Python uses a structural protocol; the target constructor is concrete. | A local object with the required zero-argument generator method. This is the sole current marked type escape. |
| `StringIO.getvalue()` to `StringIO.getValue()` | The equivalent target helper has a different name. | A `StringIO` receiver and exact zero-argument contract. |
| Non-empty `Game.add_line()` to `ChildNode` | Python guarantees the last added child; the target declaration is broad. | Exact positive sequence length plus a runtime `ChildNode` guard. |
| Nullable member access | Python fails on `None`; TypeScript exposes `null`. | A nullable proved shape; bind once, check, then expose the required shape. |
| `enumerate()` and tuple loop binding | JavaScript exposes indexed iteration through `entries()`. | A proved iterable element and a same-arity tuple of names. |
| Reassigned String/File exporter local | Python variables are dynamically typed. | Two registered exporter shapes; emit one explicit union declaration while flow keeps the current subtype. |
| Engine WDL model string | The target uses a finite string union. | A literal in the registered model set; arrays emit `satisfies WdlModel[]`, not a cast. |
| Mixed PGN arrow list | The API accepts `Arrow` or a square pair. | Every element must be a proved `Arrow` or exact two-number tuple. |

Everything else is recursive syntax lowering or shape-directed native
semantics. None of these mappings is selected by test name, source line,
variable name, or surrounding assertion.

A compiler “proof” here means machine-checked evidence inside this finite
translation surface, not a formal proof of both libraries. Registry entries are
the small human-reviewable axioms. Confidence comes from reviewing those once,
then relying on exhaustive AST/comment claiming, deterministic regeneration,
target typechecking, the independent Python assertion oracle, and native
contract tests.

Generated type assertions are inventoried. The sole current escape is the
adjacent `protocol-adapter: legal-move-generator-board` marker. Generated code
has no parity-gap casts, missing-capability casts, unmarked assertions, or
postfix non-null assertions.

## Resolved parity pass

The current empty gap manifest is the result of fixing production root causes
together with their selected upstream tests:

- Piece value equality and Python-compatible representation.
- Complete EPD fifth-field parsing, Python whitespace splitting for move
  operands, and whole-token numeric parsing that rejects JavaScript prefix
  coercion without partially mutating the board.
- Castling-right stack truthiness and legal/pseudo-legal iterator delegation.
- BaseBoard default construction, copy/factory polymorphism, and Chess960 king
  placement.
- SquareSet iterability, set-to-set inputs, and `SquareSet` result types.
- PGN `FileExporter`, demotion swaps, annotation parsing/formatting, exact
  binary-float rounding, Unicode code-point wrapping, and comment sanitization.
- Engine Score ordering/equality and WDL value equality.

The TypeScript-native contract files cover cases outside the 84 selected
bodies, including malformed EPD numeric suffixes, multi-whitespace move lists,
subclass-preserving factories, duplicate PGN variations, Unicode wrapping, and
round-half-even boundaries.

An untranslated upstream method remains a visible `test.todo`. To translate
another one, add its identity to `TRANSLATED_TESTS`, then add the smallest
missing syntax or semantic rule and a focused compiler/runtime test. Do not add
a parallel hand-written upstream body. Regenerate with:

```sh
node scripts/run_python.mjs scripts/sync_python_chess_tests.py
```

The sync script rejects stale output or provenance, modified frozen blobs,
unclaimed syntax/comments, stale gap selectors, duplicate source-line claims,
mismatched identities, and incomplete oracle metadata. Focused compiler tests
live in `test_transpilation_helper.py` and run as part of
`npm --prefix chess test`.

## Frozen upstream verification

The selected upstream commit was run directly under Python 3.14.5:

```text
Ran 282 tests
OK (skipped=14)
```

The skips require optional Crafty, Gaviota, or Syzygy resources. The Square,
Move, Piece, and complete Board classes ran without failures, confirming that
the fixed TypeScript divergences were not failures already present upstream.

## Update discipline

The intended update unit is the next commit on python-chess `master`'s
first-parent history together with the corresponding TypeScript source and test
changes. Do not update the Python pin independently of its translation.

Upstream uses feature branches. Replaying every reachable commit would expose
temporary branch states and move the gitlink sideways between histories. Follow
the stable first-parent sequence instead:

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

For a non-merge commit, translate its direct diff. For a merge commit, translate
the aggregate diff from its first parent to the reviewed merge result. Keep one
chess.ts commit per first-parent state and identify the full upstream SHA in the
commit message or an `Upstream-Commit` trailer. A Python-only,
documentation-only, or currently unimplemented-module step still receives an
explicit synchronization commit explaining why no TypeScript runtime change
applies.

For each first-parent state:

1. Record the old and new full upstream SHAs and inspect their Python diff
   before editing TypeScript.
2. For every changed Python hunk, locate the corresponding TypeScript class,
   method, expression, and nearby comments. If the correspondence is not
   obvious, resolve that fidelity problem before translating the update.
3. Reproduce the Python edit in the same relative location, order, and
   structural shape using only the direct TypeScript syntax equivalent.
4. If the edit reaches a real language-runtime mismatch, add or reuse the
   smallest primitive adapter in the custom-declarations boundary. Do not move
   domain logic into it.
5. Preserve upstream comments and update generated tests through the compiler;
   do not hand-maintain a parallel translation.
6. Review the final Python and TypeScript diffs side by side. Every target hunk
   must map either to an upstream hunk in this state or to a documented adapter
   required by that hunk. Remove unrelated cleanup and target-only fixes.
7. Advance the submodule and commit the source, generated tests, provenance,
   and gitlink together as that one synchronization state, then run the complete
   verification suite.

This is intentionally a low-decision process. A synchronization PR should be
reviewable by following aligned source hunks rather than by rediscovering the
chess behavior or trusting a new implementation.

Clone with `--recurse-submodules`, or initialize an existing checkout before
testing:

```sh
git submodule update --init
```

The sync check verifies both the exact submodule commit and the relevant file
blobs. Advance the gitlink to exactly the next first-parent state only in the
same change that translates and verifies that state's source and test changes.
