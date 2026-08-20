# Generated test compiler contract

Read this document before changing `scripts/python_test_compiler/`, the
generated-test selection, assertion-oracle machinery, or generated artifacts.
For the upstream synchronization workflow, read [`UPSTREAM.md`](UPSTREAM.md).

## Source fidelity and compiler generality

The production translation contract uses the
[**glasses test**](py-to-ts-tips.md#translation-contract-the-same-program-in-different-syntax):
after removing Python and TypeScript syntax from corresponding blocks, their
program—their ideas, control flow, local steps, expression order, and
comments—should be indistinguishable. The generated-test compiler has no one
corresponding target block, so its related test is about generality rather than
line-for-line shape.

After setting aside the unavoidable names of the Python and TypeScript public
APIs, a reader of the compiler should be able to see the supported language
forms and target contracts, but not reconstruct a particular `python-chess`
test, fixture, assertion, or chess-domain control-flow story that motivated a
rule.

Syntax lowering may grow only by adding a reusable, fail-closed rule over an
AST form and proved operand or flow shapes. Its preconditions and emitted
TypeScript semantics must be stated independently of the selected test that
first needs the rule. A rule must therefore apply to every source with those
preconditions, or reject it; it may not inspect a test identity, source span,
variable name, fixture literal, expected assertion value, or surrounding test
logic to decide how to lower it. A finite literal set is allowed only when it
is a stable target API domain, not when it recognizes a particular test.

Assertion-oracle canonicalization may likewise grow only by adding a reusable,
fail-closed cross-runtime value representation with explicit matching rules on
both the Python and TypeScript sides. It must be tested independently of the
assertion that first needs it; do not add a value-specific escape hatch merely
to serialize one selected test result.

The target registry may name `python-chess` and `chess.ts` symbols where their
public APIs differ. Such an entry is an axiom about a member, constructor, or
call shape—not a recipe for one source sequence. It must describe the complete
accepted shape and fail for unproved inputs; do not add a special contract just
because one upstream assertion needs a convenient result.

Test identities and source spans belong only to selection, provenance, oracle,
and diagnostic bookkeeping. The expected-divergence manifest may use one to
select the generic harness wrapper for an observed assertion mismatch or error,
including whether execution can continue after that observation. It may never
supply replacement lowering for the original AST or copied assertion operands.
Neither it nor a registry entry is a backdoor for test-specific compilation.

When a selected test exposes unsupported syntax or semantics, first add the
smallest general rule in the appropriate compiler layer. Cover that rule with
focused synthetic compiler cases that vary the operands or structure beyond the
motivating test, plus a rejecting case at its proof boundary. Then add the
upstream test identity to the selection and regenerate all artifacts. If that
general rule is not yet justified, leave the upstream method as a visible TODO;
do not hand-recreate its body in a TypeScript-native contract test.
