import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'separate-lifecycle-ifs',
  summary: 'lifecycle checks in separate `IF` blocks instead of one `IF`/`ELSEIF` chain',
  detail: 'The lifecycle flags (`check_on_init`, `check_on_event`, `check_on_navigated`, …) are not all mutually exclusive, so separate `IF` blocks can execute more than one branch on a single roundtrip — the classic symptom is work done twice after a navigation. One `IF`/`ELSEIF` chain makes the branches exclusive by construction. The guard idiom is exclusive too and is never reported: an `IF` block that leaves the method (`IF client->check_on_event( \\`GO\\` ). … RETURN. ENDIF.`) cannot flow into the next block.',
  example: `IF client->check_on_init( ).
  " …
ENDIF.
IF client->check_on_navigated( ).   " a second IF: both branches can run
  " …
ENDIF.`,
  remedy: `IF client->check_on_init( ).
  " …
ELSEIF client->check_on_navigated( ).
  " …
ENDIF.`,
  fixNote: 'Adjacent blocks are folded: an `ENDIF.` followed by nothing but the next lifecycle `IF` becomes one `ELSEIF`. A block that carries an `ELSE`, or statements between the two, is reported without a fix. So is the one pair the fold would break: a `check_on_init( )` block that seeds and displays nothing, followed by a `check_on_navigated( )` block that displays — `check_on_init` implies `check_on_navigated`, so today both run on the first roundtrip, and folded, the first screen would stay empty. Repeat the display in the init arm (the guide\'s shape) or move the seed there; that is a decision, not a mechanical edit.',
});
