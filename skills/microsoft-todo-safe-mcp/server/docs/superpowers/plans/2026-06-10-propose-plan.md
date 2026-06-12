# Conservative Plan Proposal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local conservative plan proposal script that reads an exported backup and writes a safe-plan JSON file.

**Architecture:** Keep proposal heuristics in a pure `src/plan-proposer.ts` module, with filesystem and CLI argument handling in `scripts/propose-plan.ts`. Tests exercise the pure module and the CLI output shape.

**Tech Stack:** TypeScript, Node test runner, Node `fs/path/process`, existing safe-plan schema conventions.

---

### Task 1: Pure Plan Proposer

**Files:**

- Create: `src/plan-proposer.ts`
- Test: `scripts/plan-proposer.test.ts`

- [ ] **Step 1: Write failing tests for conservative operation selection**

Create `scripts/plan-proposer.test.ts` with tests that verify completed tasks and near-due tasks are skipped, vague tasks go to Needs Review, someday-like tasks go to Someday, and multi-step project titles create checklist items.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types scripts/plan-proposer.test.ts`

Expected: fail because `src/plan-proposer.ts` does not exist.

- [ ] **Step 3: Implement `src/plan-proposer.ts`**

Export `proposePlanFromBackup(input, options)` and small helper types. The function returns a schema version `1.0` safe plan.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types scripts/plan-proposer.test.ts`

Expected: pass.

### Task 2: CLI Wrapper

**Files:**

- Create: `scripts/propose-plan.ts`
- Modify: `package.json`
- Test: `scripts/plan-proposer.test.ts`

- [ ] **Step 1: Add CLI behavior tests**

Add tests for output path generation and backup parsing helpers without writing to Microsoft Graph.

- [ ] **Step 2: Implement CLI**

Read `--backup`, optional `--limit`, optional `--output`, write the proposed plan JSON, and print a summary. Default output path is under `safe-data/plans/`.

- [ ] **Step 3: Add npm script**

Add:

```json
"propose:plan": "node --experimental-strip-types scripts/propose-plan.ts"
```

- [ ] **Step 4: Run verification**

Run:

```powershell
corepack pnpm test
corepack pnpm run typecheck
corepack pnpm run format:check
corepack pnpm run build
```

Expected: all pass.

### Task 3: Documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/SAFE_PLAN_WORKFLOW.md`

- [ ] **Step 1: Document proposal workflow**

Add `propose:plan` between `export_backup` and `validate_plan`.

- [ ] **Step 2: Commit and push**

Run:

```powershell
git add src/plan-proposer.ts scripts/propose-plan.ts scripts/plan-proposer.test.ts package.json README.md docs/SAFE_PLAN_WORKFLOW.md docs/superpowers
git commit -m "Add conservative safe plan proposer"
git push
```
