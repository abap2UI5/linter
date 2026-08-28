---
name: False negative — something broke that the linter should have caught
about: A defect that reached a running system with a green gate
title: 'not caught: <what broke>'
labels: false-negative
---

**What broke, on a real system**
<!-- The symptom: a view that did not load, a binding that stayed empty, an
     import that produced a stub. This is the most valuable kind of report
     there is — every rule in this linter was written from one. -->

**The source**
```abap
" the smallest class or view that still has the defect
```

**What the linter said**
<!-- `npx abap2ui5lint <file>` output. "Success! No findings detected." is a
     complete answer here. -->

**Would a static check have seen it?**
<!-- Optional, but it is the question a rule is written from: what would a rule
     need to KNOW to decide this — the UI5 metadata, the class's own types, one
     of the framework's closed sets, or something no static read can reach? -->

**Version**
<!-- `npx abap2ui5lint --version` -->
