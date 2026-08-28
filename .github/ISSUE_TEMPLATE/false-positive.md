---
name: False positive — a rule reports correct code
about: The linter flagged something that is right
title: '<rule-id> on <the shape it flagged>'
labels: false-positive
---

**Rule id**
<!-- The id printed at the end of the reported line, e.g. unknown-binding-path -->

**The finding**
```
<!-- the reported line, verbatim -->
```

**The source it reported**
```abap
" the smallest chain or class that still produces it
```

**Why it is correct**
<!-- What the framework or UI5 actually does here. This is the part that
     decides the fix: a rule that lights up correct code is wrong before the
     code is, and the shape you show is what the exemption gets written from. -->

**Version**
<!-- `npx abap2ui5lint --version`, and the `ui5` / `distribution` from your
     abap2ui5lint.jsonc if you have one -->
