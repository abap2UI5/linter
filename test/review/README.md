Regression sections of the 2026-09 review round, one file per topic.
`test/run.mjs` loads every `*.mjs` here after its own sections and hands each
file's default export the harness: `{ section, assert, f, FIX, tempDir,
checkAbapSource, checkXmlSource, checkFiles, prepareAbap }`. Use the checks
from that object (they are the observed ones, so they count for the
rule-coverage gate), never a direct import of lib/.
