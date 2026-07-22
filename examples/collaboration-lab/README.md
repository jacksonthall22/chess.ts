# chess.ts collaboration lab

This is both a human-operable demo and a deterministic browser acceptance
suite for `YjsGameDocument`. Two independently isolated browser clients use
the ordinary public `Game`, `GameNode`, and `Headers` APIs. A localhost relay
exchanges only state vectors and encoded updates through the public
`YjsGameDocument` boundary.

```text
BrowserContext alice ──┐
                       ├── localhost relay ── server YjsGameDocument
BrowserContext bob ────┘
```

Neither the clients nor the relay access a raw `Y.Doc`. The relay is a third
validated replica, not a second chess model.

## Run the interactive demo

From this directory:

```sh
pnpm setup
pnpm demo
```

Then open two browser windows side by side:

- <http://127.0.0.1:4173/?room=demo&actor=alice>
- <http://127.0.0.1:4173/?room=demo&actor=bob>

Both windows display a playable board, variation tree, annotations, local
semantic/update events, and the server replica's event trace. `pnpm setup`
uses pnpm for the example and its dependencies while leaving the library's
existing npm lockfile and publish workflow intact.

To create genuine concurrent changes:

1. Select **Partition** before either actor edits.
2. Add one or more moves or annotations in each window.
3. Confirm that the changes remain local and each window reports pending
   updates.
4. Select **Heal first → last** or **Heal last → first**.
5. Confirm that both visible games and all three replica state vectors
   converge.

The edits do not need to happen at the same wall-clock instant. They are
causally concurrent because neither actor observes the other actor's update
before making their own.

Select **Reverse each actor's queued updates** before healing to deliver a
descendant update before its causal predecessor. The relay visibly retains
the dependency-blocked update and retries it after the predecessor arrives.
**Redeliver latest** exercises Yjs update idempotence. **Disconnect** leaves
the local document editable; reconnecting sends the pending updates.

## Run the browser acceptance suite

Install Chromium once if Playwright has not already done so, then run:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

The suite launches the same frontend and relay used by the demo, creates two
separate Playwright `BrowserContext`s, and covers:

- different concurrent moves in both server acceptance orders;
- distinct concurrent same-move siblings;
- deletion versus an offline descendant;
- concurrent comment insertion and main-variation selection;
- reversed causal delivery with dependency retention and retry;
- duplicate delivery; and
- disconnected local editing followed by reconnection.

Tests assert the rendered public game state as well as matching semantic
fingerprints and state vectors for alice, bob, and the server replica. They use
explicit relay barriers and polling, not sleeps or simultaneous-click timing.

## Scope

This is an executable consumer fixture, not a deployable synchronization
service. It intentionally has no authentication, authorization, durable
storage, cross-process fan-out, presence protocol, or production retry policy.
Those responsibilities remain with a future application provider. The relay
listens only on `127.0.0.1`, stores rooms in memory, and exists to make the
library's synchronization contract observable and difficult to misuse.
