---
name: Rule proposal
about: App knowledge that could become a static check
title: 'rule: <what it would catch>'
labels: rule-proposal
---

**What goes wrong**
<!-- The mistake, and how it shows up. The mission is to encode app-building
     knowledge as static checks, so an agent learns a rule from a finding
     instead of from a document — a proposal is strongest when it names a real
     case that cost somebody time. -->

**The defective shape, and the legal one next to it**
```abap
" wrong

" right — the neighbouring form the rule must leave alone
```

**What a rule would need to decide it**
<!-- The UI5 metadata snapshot, the reconstructed view tree, the class's own
     TYPES, one of the framework's closed sets (frontend actions, released
     APIs, the icon registry), or something else. A check that cannot be
     decided from those is worth saying so too. -->

**Severity**
<!-- error: the app breaks · warning: it will not survive the target system ·
     hint: worth knowing, never wrong by itself -->
