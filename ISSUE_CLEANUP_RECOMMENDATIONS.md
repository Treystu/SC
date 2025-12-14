# Issue Cleanup & Verification Recommendations

**Date:** 2025-12-13

Based on a consolidation of repository documentation and an audit of the current codebase, the following cleanup actions are recommended.

## 🚨 Critical Architecture Mismatch

**Severity: CRITICAL**

- **Finding:** The iOS application (`ios/SovereignCommunications`) implements a mesh network using **JSON-based messaging** (`try? JSONDecoder().decode(...)`), whereas the Core library and Roadmap specify a **Binary Protocol** (109-byte header).
- **Implication:** The current iOS app **cannot communicate** with the planned Android or Web clients. It is effectively a standalone prototype.
- **Action Required:**
  - Create a specific issue: "Refactor iOS to use `@sc/core` binary protocol via JavaScriptCore or Swift port."
  - **Mark current iOS issues as "Blocked"** until a decision is made on how to integrate the Core logic (shared JS vs. native rewrite).

## 🧹 Documentation Cleanup Refactoring

The following files have been moved to `docs/archive/` to reduce noise. You should rely on `V1_ROLLOUT_MASTER_PLAN.md` as your single source of truth.

- `REMAINING_TODOS.md`
- `V1_PRODUCTION_ROADMAP.md`
- `PROGRESS.md`
- `V1_TODO_FIXES_COMPLETE.md`
- `docs/V1_GITHUB_ISSUES.md`

## 📋 GitHub Issue Cleanup Recommendations

### 1. Close "Phase 1" Issues

Many low-level "Phase 1" tasks in the `V1_PRODUCTION_ROADMAP.md` (now archived) appear to be completed (e.g., Core Build Fixes).

- **Recommendation:** Bulk close issues tagged `Phase 1` regarding basic "Build Fixes" or "Repo Setup" if the CI is currently green (which it appears to be for Core/Web).

### 2. Consolidate "Feature" Issues

There are redundant issues between "Implement Feature X" and "Test Feature X".

- **Recommendation:** Merge Testing requirements into the Acceptance Criteria of the Implementation issue to reduce noise.

### 3. Prioritize "Sovereignty" Issues

To align with the 1M+ user goal, prioritize:

- **#130** (Bootstrapping) -> This is the key to 1M+ users (can't update lists manually).
- **#129** (Encryption) -> Key for Sovereignty.
- **Phase 7/10** (DHT) -> Key for Scale.

## ✅ Next Immediate Steps

1.  **Verify Android Protocol:** Check if `MeshNetworkService.kt` uses the Binary Protocol or if it also uses JSON. If it uses JSON, you have a system-wide rewrite needed.
2.  **Adopt Master Plan:** Use `V1_ROLLOUT_MASTER_PLAN.md` for high-level tracking and GitHub Issues for execution.
