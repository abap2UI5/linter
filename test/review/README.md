Regression sections of the review rounds and audits, one file per topic -
`round-<date>.mjs` for a day's review round, `audit-<date>.mjs` for an audit,
`corpus-<date>.mjs` for a corpus sweep, and a named file (`watch.mjs`,
`portable.mjs`, `cc-mirrors.mjs`, `timing-sweep.mjs`, ...) for a topic that
keeps growing. `test/run.mjs` loads every `*.mjs` here after its own sections
(and before the rule-coverage gate) and hands each file's default export the
harness: `{ section, assert, f, FIX, tempDir, checkAbapSource,
checkXmlSource, checkFiles, prepareAbap }`. Use the checks from that object
(they are the observed ones, so they count for the rule-coverage gate), never
a direct import of lib/.
