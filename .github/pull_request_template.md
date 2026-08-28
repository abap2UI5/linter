<!--
AGENTS.md is the contract. The short version of what a change owes:
-->

## What this changes

<!-- One or two sentences. What is different afterwards, from a user's side. -->

## Why

<!-- The defect, the report, the corpus finding. A rule needs the case that
     produced it: "measured on X, N findings, all real" is the strongest form. -->

## Checks

- [ ] `npm test` passes (`npm ci && npx playwright install chromium` first — the render gate needs a browser)
- [ ] Generated artefacts regenerated and committed if a rule moved:
      `npm run generate-schema`, `npm run generate-rules-page`
- [ ] No new runtime dependency (this package has zero, and keeps zero)

## If this adds or changes a rule

A rule moves four places together — forgetting one has happened:

- [ ] the emit site in `lib/`
- [ ] its severity in `SEVERITY_BY_TYPE` (`lib/findings.mjs`) — that is also what registers the id
- [ ] an entry in `RULE_DOCS` (`lib/rule-docs.mjs`): category, summary, detail, example
- [ ] a fixture in `test/fixtures/` **and its negative counter-case** — the suite has to see the defect *and* leave the neighbouring legal form alone

- [ ] Measured against a real corpus before shipping (`node cli.mjs <corpus> --no-render --json`), and the finding count is in the description above. A rule that lights up the corpus is usually wrong before the corpus is.

## Downstream

<!-- A changed severity, finding type or reconstructor changes what consumers
     say. `downstream.yml` runs them on this PR - a red job there is a rollout
     decision to take here, not necessarily a defect. -->

- [ ] Downstream jobs read, and any new findings on the corpora accounted for
