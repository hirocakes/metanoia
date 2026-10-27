---
name: build
description: Run the full cycle for a task in one shot — think, plan, analyze, then build — recovering context from the codebase instead of re-reading the conversation. Use when the user invokes /skill:build or asks to take an item from request to working code without back-and-forth.
metadata:
  category: workflow
---

# Build — think, plan, analyze, create

One command that takes a task from request to working code without making the
user re-explain context or making anyone re-scan the conversation.

The task text supplied with the command is the input. If no task was supplied,
ask for it in one short message and stop — do not guess.

## Core rule

Recover context from the **repo and tool output**, not from conversation memory.
Assume prior chat detail may be lost or stale. Everything you need should be
re-derived by reading files, running searches, and checking git. Never ask the
user to repeat something you can find in the codebase.

Work through the four phases below in order. Do not skip to building just
because the task looks simple, and do not stop at a plan when building was
asked for.

## Phase 1 — Think

Do this silently, then state the result in at most a few lines.

- Restate the task in one sentence: what changes, for whom, done when.
- Identify the smallest scope that satisfies it. Name explicitly what you are
  leaving out.
- List unknowns and assumptions. Resolve each one by reading the code before
  moving on; only genuinely unresolvable ones go to the user.
- Recall relevant prior decisions from project files (AGENTS.md, README,
  docs, TODO), not from chat history.

Output: task statement, scope in/out, and any assumptions you are committing to.

## Phase 2 — Plan

Write a short ordered plan with `write_todos` — only the steps this task
actually needs, no speculative extras. Each step should be verifiable on its
own. Keep it to the minimum sequence that ends in a checked result.

Output: the todo list, then immediately start step 1.

## Phase 3 — Analyze

Verify the plan against reality before editing anything.

- Read the files the change touches, with real line numbers — search first,
  don't guess paths.
- Check the project's package manager, lockfile, existing libraries, and
  conventions; follow them rather than introducing new ones.
- Confirm or discard every assumption from Phase 1. If one fails, update the
  plan before continuing instead of forcing the original plan through.
- Note risks: shared behavior, tests that depend on this code, data or config
  that could break.

Output: one short update saying what you found and anything the plan changed.

## Phase 4 — Build

- Make the fewest edits that meet the scope. Prefer editing existing files
  over creating new ones.
- Mark each todo completed as you finish it, before starting the next.
- Verify with the smallest relevant check: a focused compile, typecheck, build,
  or existing test that covers the changed logic. Run only what the change
  needs. Do not weaken tests or add suppressions to make a check pass.
- If a check cannot run (missing dependencies, no credentials), say so plainly
  rather than claiming a pass.

Output: the final self-contained summary — what changed, which files, what was
actually checked and its result, and any limitations or follow-ups.

## Pacing and communication

- Give a one-line update at each phase boundary and when a finding changes the
  direction. No tool-by-tool narration, no filler.
- When the plan is obvious, compress phases: think and analyze can happen in
  the same pass over the files. The phases are for thinking, not for ceremony —
  the visible result must still be plan → build → verified summary.
- Stop and ask only for a blocker you cannot resolve yourself: a decision with
  materially different reasonable answers, missing credentials, or a
  destructive/irreversible action. Otherwise commit to a reasonable reading of
  the request and proceed.

## Done means

The task is complete, the checks were run and reported honestly, and a single
final message stands on its own — so no one has to scroll back through the
conversation to understand what happened.
