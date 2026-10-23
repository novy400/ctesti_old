## Agent skills

### Shared IBM i system: approval before load tests

The IBM i target belongs to a third party. Before any remote load, stress,
volume, endurance or high-concurrency test, explain the planned number of
calls/messages, data volume, duration, resource impact and cleanup scope,
then wait for the user's explicit approval for that campaign. An instruction
to implement or qualify a ticket, an executable test, or an environment flag
does not grant this approval. Announcing that a test will run is not approval.
Use local simulations or small remote fixtures with reduced thresholds while
approval is absent. Never rerun a volume test merely to diagnose its failure
without renewed approval. Keep volume campaigns disabled by default.

For requested cleanup, identify the exact cTestI jobs and resources, verify
ownership and state, and target only those resources. Keep local evidence.
If safe deletion cannot be verified or the current profile lacks authority,
report what remains for the system owner; do not broaden permissions, stop
jobs, purge shared queues or change system settings as a workaround.

### Issue tracker

Issues live in GitHub Issues for `novy400/ctesti`.
Before reading or publishing tickets, read `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage labels use their default names.
Before triaging issues, read `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `GLOSSARY.md` and `docs/adr/`.
Before exploring the codebase, read `docs/agents/domain.md`.
