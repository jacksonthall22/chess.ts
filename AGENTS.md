# Translation contract

The primary design constraint of this repository is **source fidelity to the
pinned `python-chess` implementation**, not merely API or behavioral parity.
Read the corresponding Python before changing code under `chess/`.

## The glasses test

Imagine removing Python syntax from the source and TypeScript syntax from the
port. The remaining program—its ideas, decomposition, control flow, state
transitions, and comments—should be indistinguishable.

For every translated class, method, or block:

- preserve source order, control-flow shape, branches, local decomposition,
  expression order, and comments;
- translate names and syntax only as required by the languages and the public
  TypeScript naming convention;
- do not refactor, deduplicate, extract, optimize, or substitute an idiomatic
  TypeScript design when the Python structure has a direct expression; and
- treat behaviorally equivalent but structurally different code as an
  unfaithful translation that should be corrected.

This is a product property. A core audience for `chess.ts` already knows the
internals of `python-chess`; familiar implementation structure lets those
developers transfer that knowledge immediately. Exact correspondence also
makes an unaffiliated port easier to audit and lets future upstream diffs be
translated with little interpretation.

## Language boundaries

Most Python in this project—assignments, branches, loops, exceptions,
functions, and classes—has a direct TypeScript form. A target-only adapter is
justified only when JavaScript lacks the relevant Python primitive or gives it
different semantics, for example Python tuple ordering, Unicode `len()`, or
round-half-even float formatting.

Keep such adapters small and explicit in the file's
`Custom declarations (no mirror in python-chess)` section. An adapter should
replace one language primitive, not rearrange chess logic or decide product
policy. Keep the translated method body source-shaped and call the adapter at
the exact point where Python uses the unavailable primitive. Document the
semantic mismatch the adapter bridges.

Target-only declarations are an exception budget. Before adding or retaining
one, identify a valid input for which the closest direct JavaScript expression
differs from pinned Python. Prefer an inline native TypeScript expression when
it is exact, even if it is slightly longer; do not extract a one-use helper for
readability or deduplication. Reuse the established primitive adapters in
`chess/utils.ts` when applicable. Keep value-specific mechanics private to the
smallest unavoidable adapter, and add a parity test for the semantic mismatch.
See the adapter decision rule and comparison convention in
[`py-to-ts-tips.md`](py-to-ts-tips.md).

Do not silently fix an upstream bug only in TypeScript. Preserve the pinned
behavior in synchronization work. Pursue the fix upstream first, or make any
intentional divergence a separate, explicitly approved and documented change.

## Required workflow for core changes

1. Confirm the exact `python-chess` gitlink and open the pinned Python block
   beside the TypeScript block.
2. Map every changed TypeScript hunk to exact Python lines or to one narrowly
   documented language adapter used by those lines.
3. If a hunk cannot be explained by that mapping, remove it or stop and obtain
   an explicit decision before keeping a divergence.
4. Preserve comments and make the smallest source-shaped correction.
5. Run the translated upstream suite and the deterministic assertion oracle.

For the first-parent upstream synchronization process, read
[`UPSTREAM.md`](UPSTREAM.md). For established syntax mappings and exceptional
language patterns, read [`py-to-ts-tips.md`](py-to-ts-tips.md).
