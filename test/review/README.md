Regression sections, one file per TOPIC - `row-template-paths.mjs`,
`cli-flags.mjs`, `watch.mjs`, `portable.mjs` - never per date: a file named
after the day it was written says nothing about what it guards, and the next
change to the same rule has no file to go to. The date and the occasion go in
the file's header comment. (Until 2026-11 the files were named
`round-<date>.mjs`, `audit-<date>.mjs` and `corpus-<date>.mjs`; the CHANGELOG
still names them that way.)
`test/run.mjs` loads every `*.mjs` here after its own sections
(and before the rule-coverage gate) and hands each file's default export the
harness: `{ section, assert, f, FIX, tempDir, checkAbapSource,
checkXmlSource, checkFiles, prepareAbap }`. Use the checks from that object
(they are the observed ones, so they count for the rule-coverage gate), never
a direct import of lib/.
