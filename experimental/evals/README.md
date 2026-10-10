# `experimental/evals/` — what a model writes, measured

Nearly every abap2UI5 example on the public web builds its view with the frozen
`z2ui5_cl_xml_view`. A model asked for an app answers from that, confidently,
in an API that is no longer the one to use — which is why the documentation has
a [Building with AI](https://abap2ui5.github.io/docs/get_started/ai.html) page,
why the framework ships `AGENTS.md`, `llms.txt`, a plugin and an MCP server,
and why `frozen-view-builder` is a rule here at all.

Whether any of that moves the number is a **measurement**. This is the
instrument.

It does not call a model. No keys, no vendor list, no per-run cost, and no
pretence that this repository knows which models matter next month: you run the
prompts, keep the answers, and the harness scores them with the gate that is
already here.

## The protocol

1. **Fresh session per model, nothing in the context.** No documentation pasted
   in front of it, no project open, no follow-up questions. What is being
   measured is what the model brings on its own — the situation a developer who
   just asks is in. A session that has already read abap2UI5 documentation
   (including an agent working in this repository) is contaminated and cannot
   produce a baseline.
2. `node experimental/evals/score.mjs --prompts` prints the twelve prompts.
   They are phrased the way a user asks, and deliberately name no class, no
   interface and no builder.
3. Save each answer as `<prompt-id>.clas.abap` in one directory — one directory
   per run, named for what it measures: `opus-5-blank`, `opus-5-with-llms-txt`,
   `gpt-6-mcp-server`.
4. Score it:

   ```sh
   node experimental/evals/score.mjs <answers-dir> --label opus-5-blank
   node experimental/evals/score.mjs <answers-dir> --label opus-5-blank \
        --render --json-out experimental/evals/results/2026-10-10-opus-5-blank.json
   ```

Keep the JSON summaries (small, comparable, worth committing). The raw answers
are yours to keep or discard; `answers/` under this directory is gitignored so
a run does not land in a commit by accident.

## What the numbers mean

The run uses the linter's **defaults** — UI5 1.71, fail on warning,
distribution unset — because that is the verdict a consumer gets with no
configuration, which is the situation the measured code would land in.

| row | reading |
| --- | --- |
| **current builder** | the answer builds its view with `z2ui5_cl_ui5_view_builder`, so the whole gate applied to it. This is the headline number |
| **frozen builder** | the answer used `z2ui5_cl_xml_view`. It may well run; no view check was possible, and it is the API the public web taught |
| no view built | an app class that never produced a view — a `main( )` that only sends messages, or a stub |
| not an app class | the answer was not ABAP implementing `z2ui5_if_app` at all (a UI5 controller, a CAP service, prose) |
| clean | current builder, no findings, and with `--render` the view actually loads |
| **Controls and members** | invented names: a control, property, aggregation or enum value UI5 does not have. The failure mode a model has and a human does not |
| Version and deprecation | written against a UI5 newer than the floor, or a deprecated or non-existent icon |
| the remaining categories | the linter's own taxonomy, with its own titles — a rule added there appears here without this directory being touched |

`--render` is the stronger half: it answers whether the view **loads** rather
than whether it names real controls, and a view that fails to load is an app
that shows nothing. It needs `@abap2ui5/linter-render` and a browser, so it is
off by default.

## What this does not measure

- **Whether the app does what was asked.** The gate reads the view, not the
  intent: an answer can be clean and still filter nothing. Read the answers.
- **Variance.** One run of one model is one sample; the same prompt answered
  twice differs. A number that moved by one answer out of twelve has not moved.
- **Twelve prompts** are a probe, not a benchmark. They were chosen for the
  idioms where answers go wrong (value help, navigation between apps, state
  across a roundtrip, icons), not for coverage.
- **Anything about the model's reasoning.** Only its output, and only through
  this gate.

## Why it lives in `experimental/`

Same reason as `experimental/github-app/`: it is not part of any release, the
npm `files` allowlist does not carry it, and it is not wired into `npm test` —
a scoring run needs answers, which CI does not have. It is documentation that
happens to execute.
