# GitHub App — a spike, not a product

A working prototype of the linter as a **GitHub App**: a pull request is
opened, a check run comes back with the findings annotated on the diff. No
workflow file in the consumer's repository, the way
[abaplint.app](https://blog.abaplint.app/) works next door.

It is here to answer one question — *what would this actually take?* — with
running code instead of an estimate. It is **not deployed, not registered and
not maintained as a service.** Read the limits at the bottom before treating
it as more than that.

## Why only the property gate

The linter has two gates, and they are not equally hostable:

| | property gate | render gate |
| --- | --- | --- |
| what it does | the ABAP and view rules, statically | a real `XMLView.create` in Chromium |
| what it needs | nothing but Node | a browser plus ~140 MB of `@openui5/*` |
| per run | milliseconds, in memory | seconds, and a container that can hold it |

`checkAbapSource`/`checkXmlSource` take **source, not a checkout** — so this
service fetches the changed files over the API and lints them inside the
request. No clone, no temp directory, no working tree to clean up after a
crash. That is the whole reason a hosted App is feasible at all, and it is why
the render gate deliberately stays out: it belongs in the consumer's own CI,
where [the Action](../README.md#github-action) already runs it. The check's
summary says so, so nobody reads a green check as more than it is.

This split is not new — the VS Code extension already bundles the property
gate and fetches the render gate separately. The App would be its third
consumer.

## Try it without registering anything

```sh
node github-app/dryrun.mjs test/fixtures          # what it would post
node github-app/dryrun.mjs test/fixtures --json   # the check-run payload itself
```

Same `lintSource` / `toAnnotations` / `summarize` the webhook path uses.

## Running it for real

Register an App (Settings → Developer settings → GitHub Apps) with:

- **Permissions**: `Checks: read & write`, `Contents: read`, `Pull requests: read`
- **Events**: `Pull request`, `Check run`, `Check suite`
- **Webhook URL**: wherever you host it, plus a webhook secret

```sh
APP_ID=123456 \
PRIVATE_KEY_PATH=./private-key.pem \
WEBHOOK_SECRET=... \
node github-app/server.mjs
```

`GET /health` answers `ok`; everything else must be a signed `POST`.

## What it does

1. Verifies the webhook signature over the **raw** body (HMAC-SHA256). The
   endpoint URL is public — this is the only thing that distinguishes a real
   delivery from somebody naming any repository they like.
2. Mints an installation token per delivery and never stores it.
3. Reads the repo's own `abap2ui5lint.jsonc`, so the App agrees with what the
   CLI and the Action would say about the same code.
4. Lints the changed `*.clas.abap` / `*.view.xml` / `*.fragment.xml`.
5. Posts one check run, annotations batched 50 at a time.

Dependencies: none. `node:crypto` signs the JWT, `fetch` does the rest.

## What it does NOT do — the gap between this and a product

The prototype is the easy half. What is missing is the half that makes a
service:

- **No render gate.** By design, see above.
- **No persistence.** A delivery that fails is lost; GitHub retries some
  events, not all. A real App needs a queue and idempotency on the delivery
  id.
- **No rate-limit or retry handling.** One file is one API call; a large pull
  request will hit secondary limits and simply throw.
- **No installation lifecycle.** `installation`, `installation_repositories`
  and suspension events are ignored.
- **Findings outside the diff are invisible.** GitHub accepts the annotation
  and shows it only in the check's own output, not on the Files tab. A real
  App decides deliberately what to do with those.
- **No concurrency control.** Two pushes in a row produce two check runs; the
  older one is not cancelled.
- **Nothing operational.** No metrics, no structured logging, no alerting, no
  deployment, no uptime, and nobody paying for the container.

That last group is the actual work, and it is ongoing rather than one-time —
which is why this stays a spike until someone decides to **operate** it.
abaplint solved that by making it a product with a business behind it; that is
the precedent to copy, not the code here.
