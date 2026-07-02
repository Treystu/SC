# Prompt for Fable: Own the plan to finish Sovereign Communications

Copy everything below the line into Fable. This supersedes `plans/fable-pr221-eval-prompt.md` in scope — that file's findings are folded in below as starting evidence, not as the assignment itself.

---

## Mission

You are taking ownership of `treystu/sc` (Sovereign Communications / SCM), a P2P mesh messaging app (web client, iOS, Android, all built on a shared `core/` TypeScript library). The high-level intention is: **get this app to a genuinely finished, shippable state.**

You are not being handed a task list. You are being handed the mission and the authority to figure out the task list yourself. Decide what "finished" means, decide what matters most, decide the architecture calls nobody else has made, and produce the plan that gets there. Where the previous narrower prompt (`plans/fable-pr221-eval-prompt.md`) told you which buckets to sort work into, this one doesn't — design the plan structure that fits what you actually find.

## Why this framing, and what you're walking into

This repo has been worked on by many prior agent sessions, and it shows a specific failure pattern you need to route around: agents declaring victory in a status document without the work being reachable, tested end-to-end, or wired into the running app. Evidence:

- The repo root has ~25 files like `TODO_COMPLETION_REPORT.md`, `FINAL_COMPLETION_REPORT.md`, `CODEBASE_UNIFICATION_COMPLETE.md`, `MESH_NETWORK_FIX_COMPLETE.md`, `UNIFIED_SYSTEM_STATUS.md`, `REMAINING_WORK.md` — many self-declaring completion and even "READY FOR 1M USER ROLLOUT." Treat every claim in every one of these as unverified until you check it against actual code and actual test runs. Do not add another one to the pile.
- The most recent large merge, PR #221 ("Unified Node Architecture" — X3DH key exchange, `EnhancedPeerDiscovery`, `TransportManager`, DHT records, node capability/registration/services, ~15,000 lines with tests), is — as of the last check — **not exported from `core/src/index.ts` and not referenced anywhere in `web/`, `android/`, or `ios/`**. It appears to be a large, individually-tested, but completely disconnected subsystem sitting alongside older code (`mesh/discovery.ts`, `discovery/peer.ts`, `transport/webrtc.ts`, `mesh/dht.ts`, existing crypto in `crypto/index.ts`) that the app actually runs today. Confirm this is still true, and if so, this is squarely your call to make: is the new subsystem meant to replace the old, run alongside it, or was it scope creep that should be cut? Decide, state your reasoning, and plan accordingly.
- `core/node_modules` was not installed as of the last check — nobody has actually run the test suite recently to confirm what "passing" even means right now. Don't trust "tests pass" claims in any doc; run them yourself (`cd core && npm install && npm test`, and `npm run build` for type errors) and use the real output as ground truth.

You should not assume this evidence list is complete or still current — re-verify it and go find the rest yourself. The point isn't these three bullets; it's the pattern they represent. Assume other parts of the repo have the same disease (claimed-done work that isn't) until you've checked.

## What "finished" means — your call, but anchor it

Define your own launch bar for what this app needs to actually do, for real users, before it's done. Use the app's own stated purpose (sovereign, resilient P2P mesh messaging — read `README.md` and the mission docs for intent) as the anchor, not the aspirational claims in the status docs. At minimum your definition of done should address: does the core message send/receive/mesh-relay path actually work end-to-end on each platform; is the crypto (key exchange, encryption at rest and in transit) sound and not just unit-tested in isolation; can a new user actually onboard and connect to peers; is there a coherent single security story rather than multiple half-integrated crypto subsystems. Beyond that, use your judgment about what's in scope for "finished" versus legitimate future work — and say so explicitly, so implementers aren't guessing at your intent.

## What you're producing

A prioritized, sequenced plan to get from the current real state to your definition of finished. You choose the structure (phases, milestones, tracks — whatever fits what you find), but every leaf task in it must satisfy these constraints, because the implementers picking them up are Sonnet-tier and Haiku-tier coding agents with no memory of this analysis:

- **Self-contained.** An implementer who reads only that one task (plus the files it names) can start immediately — no need to re-read your whole plan or re-derive your reasoning.
- **Exact file paths and symbols**, not vague direction ("integrate the node module" is not a task; "add `export * from './node/index.js'` to `core/src/index.ts`, matching the existing export style at line ~168" is).
- **A concrete acceptance check** — a test to run and see pass, a build command that should stay clean, a specific behavior to manually verify. No task should depend on the implementer's subjective judgment of "done."
- **A tier tag**, `[Haiku]` for mechanical/low-risk work (wiring exports, deleting confirmed-dead code, config/doc updates) and `[Sonnet]` for anything needing multi-file reasoning, an architectural judgment call, or touching crypto/auth/security-sensitive code. When unsure, tag it Sonnet — never downgrade a crypto-correctness task to Haiku.
- **Explicit dependencies** between tasks where order matters (architecture decisions gate the integration work that follows from them).

Where you make a judgment call the rest of the plan depends on — replace-vs-coexist for overlapping subsystems, what's in scope for "finished," what to do with the ~25 status docs, whether existing tests can be trusted — state the decision and a short rationale before the tasks that depend on it, so implementers know it was a decision, not an assumption.

Output the plan directly. Don't write a meta-summary of what the plan will contain — write the plan.
