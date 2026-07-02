# Prompt for Fable: Evaluate PR #221 and produce an implementable backlog

Copy everything below the line into Fable.

---

You are auditing the `treystu/sc` repository (Sovereign Communications / SCM, a P2P mesh messaging app with web, iOS, and Android clients on top of a shared `core/` TypeScript library). Your job is **not** to write code. Your job is to (1) determine the true state of the work just merged, and (2) produce a concrete, sequenced backlog of tasks small enough that a Sonnet-tier or Haiku-tier coding agent can pick up any single item and implement it without needing to re-derive this analysis.

## What was just merged

PR #221 ("Add X3DH key exchange protocol and enhanced peer discovery", merge commit `68953cd`) added a "Unified Node Architecture": ~15,100 insertions across 24 files, including:

- `core/src/crypto/x3dh.ts` (724 lines) + `x3dh.test.ts`
- `core/src/discovery/enhanced.ts` (375 lines, `EnhancedPeerDiscovery`) + test
- `core/src/mesh/dht/records.ts` (478 lines) + test
- `core/src/node/index.ts`, `capabilities.ts`, `registration.ts`, `services.ts` (~2000 lines combined, a new node capability/registration/services layer) + tests
- `core/src/transport/manager.ts` (461 lines, `TransportManager`) + test
- `core/src/transport/websocket.ts` (469 lines)
- `core/src/storage/CapabilityStore.ts` (223 lines)
- A follow-up commit (`2c93b03`) claiming to fix "security vulnerabilities in X3DH and Peer Discovery," plus another (`80ab443`) adding "verification tests"

## Ground truth you must establish first (do not skip this)

1. **Wiring check.** As of this writing, `core/src/index.ts` (the package's public export surface) does **not** export anything from `node/`, `discovery/enhanced.ts`, `transport/manager.ts`, `mesh/dht/records.ts`, or `crypto/x3dh.ts` — confirmed by grep, zero matches. Likewise, `web/src`, `android/`, and `ios/` have zero references to `UnifiedNode`, `NodeCapabilit*`, `TransportManager`, `X3DH`, or `EnhancedPeerDiscovery`. Verify this yourself (it may have changed). If confirmed, this is the headline finding: PR #221 shipped a large, tested, but **fully disconnected** subsystem — none of it is reachable from the running web/mobile apps or from the existing `mesh/network.ts` / `discovery/peer.ts` / `transport/webrtc.ts` code paths that the app actually uses today.
2. **Don't trust the repo's self-reported status docs.** The root of this repo contains ~25 files like `TODO_COMPLETION_REPORT.md`, `FINAL_COMPLETION_REPORT.md`, `CODEBASE_UNIFICATION_COMPLETE.md`, `MESH_NETWORK_FIX_COMPLETE.md`, `REMAINING_WORK.md`, `UNIFIED_SYSTEM_STATUS.md`, etc., produced by prior agent sessions, many marking their own work "✅ COMPLETED" and declaring the app "READY FOR 1M USER ROLLOUT." Treat every claim in these files as unverified until you check the actual code. Do not add another one of these summary docs — that pattern is the problem, not the solution.
3. **Run the test suite for real.** `core/node_modules` is not currently installed. `cd core && npm install && npm test` (jest) before trusting any "tests pass" claim, and separately try `npm run build` (tsc) to check for type errors the new code may have introduced or left latent (e.g. unused exports, `any` leakage). Report actual pass/fail counts and any build errors, not assumptions.
4. **Check for duplication, not just disconnection.** The codebase already has `mesh/discovery.ts`, `discovery/peer.ts`, `discovery/http-bootstrap.ts`, `mesh/bootstrap-discovery.ts`, `transport/webrtc.ts`, `transport/webrtc-enhanced.ts`, `mesh/dht.ts` / `mesh/dht/index.ts`, and `crypto/index.ts` (existing key-exchange code) predating this PR. Determine whether the new `discovery/enhanced.ts`, `transport/manager.ts`, and `crypto/x3dh.ts` are meant to **replace** these, run **alongside** them, or are simply an unintegrated parallel implementation nobody decided how to merge. Read both old and new files where they overlap.

## What to produce

A single markdown backlog (this is the deliverable — output it directly, don't just describe it). Requirements for every task in it:

- **Numbered, single-purpose, independently implementable.** If a task requires understanding two unrelated subsystems, split it.
- **Exact file paths and symbol names** the implementer needs to touch (e.g. "add `export * from './node/index.js'` to `core/src/index.ts` line ~168, matching the existing export style") — not vague instructions like "integrate the node module."
- **A stated acceptance check**: a specific test to run, a specific behavior to observe, or a specific command whose output should change (e.g. "`npm run build` in `core/` should still pass with 0 errors" or "a new integration test in `core/src/node/integration.test.ts` should exercise this path and pass"). No task should rely on the implementer's judgment call about "done."
- **A suggested tier**: mark each task `[Haiku]` if it's mechanical (wiring an export, adding a config flag, deleting dead duplicate code, updating a stale doc) or `[Sonnet]` if it requires multi-file reasoning, an actual design decision (e.g. deciding how X3DH replaces/coexists with the existing crypto handshake), or touching security-sensitive crypto/auth code. When in doubt, mark it Sonnet — never mark a crypto-correctness task Haiku.
- **Explicit dependency ordering** between tasks (e.g. "must follow #3, which establishes whether X3DH replaces or supplements the existing handshake").
- **No task that requires re-reading this whole PR to understand** — each task's description must be self-contained enough that an implementer who has only read that one bullet (plus the referenced files) can start immediately.

Organize the backlog into these buckets, in this order:

1. **Verification tasks** (run tests/build, confirm or refute the disconnection finding above, confirm or refute the "security vulnerabilities fixed" claim in commit `2c93b03` by identifying what the actual vulnerability was and whether the fix is complete)
2. **Decision-gated integration tasks** (things that can't proceed until someone — you, in this pass — decides replace-vs-coexist for the overlapping subsystems in point 4 above; state your recommended decision explicitly with a one-paragraph rationale, then write the tasks assuming that decision)
3. **Wiring tasks** (export the new modules, connect `TransportManager`/`EnhancedPeerDiscovery`/node registration into the actual app entry points in `web/src/bootstrap.ts` and wherever `mesh/network.ts` is initialized, so the code is reachable and testable end-to-end, not just unit-tested in isolation)
4. **Cleanup tasks** (delete or archive superseded old code once the new path is wired and verified; do not leave both live)
5. **Remaining known debt**, cross-checked against `REMAINING_WORK.md` — note which of its claims still hold and which are stale, rather than assuming it's accurate

Keep the whole output focused on this PR's scope and its immediate integration debt. Do not re-litigate unrelated open items in the ~25 status docs unless they directly block wiring in this new architecture.
