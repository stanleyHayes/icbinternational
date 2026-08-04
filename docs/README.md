# Documentation

The Reliance Bank documentation set. Reading order for a new engineer is `docs/ONBOARDING.md`;
everything else is reference.

| Document                   | What it is                                                                 |
| -------------------------- | -------------------------------------------------------------------------- |
| `docs/ONBOARDING.md`       | Clone → first PR: setup, the unbreakable rules, the agent workflow         |
| `docs/ARCHITECTURE.md`     | System shape, layering, the ledger, providers, what exists vs. planned     |
| `docs/API.md`              | Envelopes, errors, headers, idempotency, pagination, the full route map    |
| `docs/RUNBOOK.md`          | Operating the local stack: start/stop/reset, verification, common failures |
| `docs/DOMAIN-GLOSSARY.md`  | Banking vocabulary as this codebase uses it — binding definitions          |
| `docs/DECISIONS.md`        | ADR log: each decision, what it rules out, what would make us revisit      |
| `docs/HANDOFFS.md`         | Open cross-task change requests (orchestrator-maintained)                  |
| `docs/CONTRACT_CHANGES.md` | Contract Change Protocol proposals (orchestrator-maintained)               |
| `docs/CHANGELOG-AGENTS.md` | One line per completed task (orchestrator-maintained)                      |

Also: `agent_plan.md` at the repo root is the build plan and task board, and the root `README.md` is
the two-minute overview.

House rules for these documents:

- **Trust the code over the docs.** Much of the system is being built concurrently; where a document
  and the tree disagree, the tree is right — and the fix is a PR against the document, not a shrug.
- Mark unbuilt areas as **planned** (with the task id, e.g. A-08) rather than describing them as if
  they exist.
- Keep the tone: short, direct, opinionated. A document that says everything says nothing.
- `SHOWCASE.md` — the generated dataset: who the eight customers are and why
