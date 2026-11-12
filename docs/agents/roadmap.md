# Roadmap — open candidates, and the rules of the trade

What is not built yet, and what a new rule has to clear before it ships. Short
on purpose: where a rule CAME from, what it was measured on and why it is
shaped the way it is lives in `docs/agents/rule-history.md`, round by round.
When a candidate ships, delete it here and write its paragraph there.

## Open candidates

Each with what it needs and what it must not report. A candidate without a
case that happened is a wish; it goes into abap2UI5's `backlog/` first.

- **A sub-app that builds into its host's handle** (samples 105/112:
  `view_parent->tag( … )` on a handle the host hands over; render skipped
  today). `nav-target-never-displays` showed the class index can carry facts
  about other classes; this one needs it to carry each class's builder entry
  points AND the host's slot the sub-app fills - which the host decides at
  runtime, BY NAME, in sample 338. Report nothing until a corpus case shows
  a defect the reconstruction would find.
- **A seed in a method the start path calls conditionally** - the branch
  analysis behind `enum-bound-to-conditional-field` reads branches inside
  each span; a method called from one arm of an IF counts as running.
- **The published schema of the `--format json` report** - the last open
  item of the 1.0 criteria (`docs/agents/release.md`).
- **Fixes for the frequent fixless findings** - `npm run fix-coverage` over
  the corpora (2026-11-12): `member-too-new`, `control-too-new`,
  `aggregation-too-new` (a version decision), `editable-control-without-binding`
  and `missing-accessibility` (a text only the author has) lead; none is
  mechanical, which is why they have none. Rerun it before writing a fix.

## Rules of the trade

**A corpus run also measures the RECONSTRUCTOR, not only the rule.** The
`relative-binding-without-context` round found two model defects that had
been invisible because they cancel each other out: a `DATA t_x TYPE
ty_t_x.` (a **named** table type, not the inline `STANDARD TABLE OF`
form) was modelled as a **scalar**, so the render gate silently rendered
an empty aggregation and never instantiated the template — and fixing
that surfaced the second one, an **unseeded** table being given an
invented all-empty row, which the render gate then rejects on the first
enum or date property (`"" is of type string, expected sap.m.AvatarShape`).
Now: unseeded tables are empty for the renderer and a declared row in the
shape, the same split the scalars already had.

**Measure a new rule against the samples-controls corpus before shipping it.**
`node cli.mjs /path/to/samples-controls/src --no-render --json` over its ports
(the count lives in that repo's generated `STATUS.md`, never here), diffed per
finding type against `main`, is what caught three separate
false-positive shapes: an event raised by a `message_box_display( onclose = )`
callback rather than `client->_event( )`, dispatch leaking across an
`ENDMETHOD`, and a `<style>` check scoped to the ABAP *statement* — which on
a builder chain is the entire view. A rule that lights up the corpus is
usually wrong before the corpus is.

**And check the rule can see anything at all.** Zero findings on the corpus
proves nothing on its own: `unused-public-attribute` was verified by
injecting a dead attribute into a real port (caught) and by counting what it
judges in silence (120 PUBLIC declarations across 37 of 60 sampled ports, all
correctly referenced). A rule that parses nothing is also a rule that reports
nothing.
