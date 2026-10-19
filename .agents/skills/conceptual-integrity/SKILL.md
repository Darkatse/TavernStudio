---
name: conceptual-integrity
description: >
  Keeps a codebase converging instead of piling up: one kind of thing, one
  path. Traces the shared need behind scattered code, fixes disagreements at
  their source instead of compensating downstream, finishes migrations by
  deleting the old path, and makes the call instead of hedging with flags,
  fallbacks, wrappers, and parallel implementations. Use when planning or
  designing a feature, refactoring, adding an entry point, integration,
  provider, or capability, reviewing a plan, design doc, or diff, deciding
  which tests to add or delete, syncing with an upstream codebase, or when the
  user asks for conceptual integrity, a
  unified architecture, maintainability, less tech debt, fewer special cases,
  or no more patch pile-up. Not for one-line fixes or non-coding requests.
license: MIT
---

# Conceptual Integrity

The goal is long-term maintainability. A maintainer should understand the
system through a few coherent concepts, know where to change a rule, and
extend a feature along a structure that already exists.

The method: **one kind of thing, one path.** Spend complexity merging paths at
the source, never compensating around them.

Coding agents drift the other way. Each step optimizes the diff in front of
it: a branch for the new caller, a fallback just in case, a wrapper around code
that feels off-limits, the old path kept for compatibility. Each looks
reasonable alone. Together they are the codebase nobody can change.

## Facts first

Read the project's own rules before planning: `AGENTS.md`, `CONTRIBUTING.md`,
architecture and contract docs. They hold this project's boundaries, contracts,
and past trade-offs. This skill is the method for applying them; where they are
specific, they win.

Then trace the real flow of data, state, and behavior end to end. Find what
several entry points actually share and where the current complexity comes
from. Source code, real usage, and reproducible behavior are the evidence.

## Contracts are hard; implementation is not

The hard boundary is a contract someone actually depends on: a public API, a
file format, a protocol, an event or DOM convention, timing that users or
extensions rely on. Name the consumer, and keep that entry as a thin door into
the shared mechanism.

Everything else is implementation, and implementation is a design choice you
may change: existing code, inherited or upstream code, and the docs describing
them. An inherited inconsistency or old bug is not a contract; fix it at the
source. Treating every existing line as untouchable is what produces shims and
parallel paths.

## Converge at the source

- Put shared semantics in one place. Each entry point supplies its own data and
  context; the shared mechanism owns the shared behavior.
- State has one source of truth. Everything else derives from it or goes
  through it.
- When writers or entry points disagree, change them to follow one protocol.
  Do not reconcile downstream with observers, sync jobs, or patches. If an API
  call changes a value behind the UI's back, route it through the setter the UI
  already uses; do not add a watcher that re-renders the UI.
- Fix a bug where all callers route through, not only in the caller the ticket
  names.
- Semantics draw the boundary. Merge rules that mean the same thing; keep real
  differences explicit. A platform adapter is a real difference. A branch for
  one provider of the same capability usually is not. No shared need, no
  shared abstraction.
- One concept, one name, across code, parameters, errors, and docs, following
  conventions users already know.

## Decide

Hedging is how complexity gets in without anyone choosing it.

- Recommend one approach and state the trade-off in a line. Do not hand back a
  menu.
- Do not add a flag, option, or config to avoid making a decision.
- Do not keep an old path "for compatibility" unless you can name its consumer.
- Do not add a fallback for a state you do not understand. Fail fast with
  context. A recovery path must be expected, explicit, and visible to the
  caller.
- Ask the maintainer only about decisions that change behavior, contracts, or
  ownership. Once aligned, carry the change all the way through.

## Finish the move

A refactor that leaves two structures standing has made things worse.

- Build the shared mechanism completely, then move features onto it.
- Migrate every real caller. Delete the replaced code, branches, bypasses, and
  their tests, fixtures, and fakes in the same change, and update the docs that
  described them. A new layer on top of the old structure is not done.
- Stage the work if you must; every stage advances the same architecture.
- A larger change now is fine when it removes duplicated paths, hidden
  knowledge, and recurring patches. Judge the whole system's cost to
  understand and change, not the size of this diff.

## Tests must earn their place

Agents write tests by reflex: one per change, one per layer, one for each
branch they just added. Many of them pin implementation, and a test that pins
implementation turns it into a contract the next refactor has to fight. Every
test is code someone has to maintain.

- No test by default. Write one only for observable, stable behavior; a
  non-trivial invariant or boundary; or a defect that actually happened and
  was just fixed. A change to a contract, such as a file format, protocol, or
  data migration, keeps one minimal runnable test. "Code changed", coverage,
  and "just in case" are not reasons.
- Never assert source text, literals, obvious control flow, direct delegation,
  internals, or removed features. Never add a regression test for a bug that
  has not happened.
- One behavior, one guard, at the highest layer that already observes the
  whole flow. Extend an existing behavior test before writing a new one, and do
  not repeat an assertion another layer already makes.
- Deleting a test that guards nothing is progress, not lost coverage.

## Keep complexity proportional

- Count simplicity in concepts, dependencies, and hidden knowledge, not lines.
  Choose the simplest design that fully solves the real problem.
- 60/95: cover about 95% of real cases with about 60% of the complexity. Rare
  cases without evidence wait until they happen.
- Do not build mechanisms for problems that have not appeared. Do not repeat
  the same defense at every layer; guard once, at the boundary that owns it.
- A mechanism the real problem needs stays. Two mechanisms guarding different
  invariants are not duplication.
- When a bug or review comment arrives, first try to generalize an existing
  rule or delete the condition that caused the divergence. Appended special
  cases compound; one generalized rule often dissolves several.

## Signatures of a pile-up

Check your own plan against these before implementing. When reviewing, report
one line per finding: `file:line: <tag> what is split. → where it converges.`

| Tag | Signature |
|---|---|
| `split-path` | One job done by two pipelines, or a per-caller branch for something every caller needs. |
| `second-truth` | A cache, mirror, or flag duplicating state owned elsewhere. |
| `compensation` | An observer, sync, retry, or patch downstream reconciling an upstream disagreement. |
| `half-move` | Old and new structures both alive; callers or docs not migrated. |
| `special-case` | A one-off condition where a generalized rule would remove several. |
| `extra-layer` | A wrapper, adapter, interface, or factory with no shared need, often around code that could simply change. |
| `defensive-layer` | A fallback that guesses on unknown state, a catch-all branch that absorbs new variants, or the same guard at every layer. |
| `hedge` | A flag, option, or kept-alive path that exists to postpone a decision. |
| `test-pile` | A test that pins implementation, repeats an assertion another layer makes, guards a bug that never happened, or exists only because code changed. |

End with `net: -<N> paths`, counting paths, sources of truth, and special cases
a maintainer no longer has to learn. If nothing is split: `Coherent. Ship.`

## Done

Check every touched entry point: does it now go through the shared mechanism?
Then ask whether a maintainer has one fewer path to understand. Finally, the
next-change test: would the next developer find the rule faster, know where to
change it, and extend the feature along the same clear path?

Passing tests check behavior. They do not tell you the design is done.

## Boundaries

- Not for typos, one-line fixes, or tasks with no structural decision.
- Not a license to rewrite. Converge within the problem's semantic scope. When
  convergence reaches beyond the task, propose it in one line and ask; do not
  silently expand, and do not silently skip.
- Principles serve judgment. When new facts overturn an earlier decision,
  change the design.
