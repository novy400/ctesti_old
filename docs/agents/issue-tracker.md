# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `novy400/ctesti`.
Use the `gh` CLI with explicit `--repo novy400/ctesti`,
including when the local directory has no Git remote.

## Conventions

- Create: `gh issue create --repo novy400/ctesti --title "..." --body-file <file>`
- Read: `gh issue view <number> --repo novy400/ctesti --json number,title,body,labels,comments`
- List: `gh issue list --repo novy400/ctesti --state open --json number,title,body,labels`
- Comment: `gh issue comment <number> --repo novy400/ctesti --body-file <file>`
- Apply or remove labels: `gh issue edit <number> --repo novy400/ctesti --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --repo novy400/ctesti --comment "..."`

For multiline bodies, write the exact text to a temporary file and
pass it with `--body-file`.

Use the role mapping in `triage-labels.md`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill operations

When asked to publish to the issue tracker, create a GitHub issue.
When asked to fetch a ticket, read the referenced GitHub issue.

## Wayfinding operations

- Map: one issue labelled `wayfinder:map`, containing Notes,
  Decisions-so-far, and Fog.
- Child: one issue per ticket, linked as a GitHub sub-issue.
  If unavailable, add it to a task list in the map and put
  `Part of #<map>` in the child.
- Type: use `wayfinder:research`, `wayfinder:prototype`,
  `wayfinder:grilling`, or `wayfinder:task`.
- Blocking: use native GitHub issue dependencies when available.
  Otherwise record `Blocked by: #<number>` in the child body.
  A ticket is unblocked when all blockers are closed.
- Frontier: choose the first open, unblocked, unassigned child
  in map order.
- Claim: assign the ticket to the driving developer before work.
- Resolve: comment with the answer, close the ticket, and append
  a short answer plus its link to the map's Decisions-so-far.
