/*
 * check-worker — one thread of checkFiles( )'s property-gate pool (`jobs`).
 *
 * Runs exactly what the sequential loop in index.mjs runs for one file -
 * checkXmlSource( ) or checkAbapSource( ) with the run's options and the file
 * - and posts the result back. Nothing is decided here: which file is next,
 * the order of the results and what a run reports stay with the caller, so a
 * pooled run and a sequential one produce the same results in the same order.
 *
 * The options arrive once, as workerData (structured-cloned: everything
 * checkFiles( ) is handed except the two callbacks, which never reach a
 * check). Each message is one file: { i, file, src, xml }; the answer is
 * { i, result } or { i, error } - an exception is the caller's to rethrow,
 * as the sequential loop would have thrown it.
 */
import { parentPort, workerData } from 'node:worker_threads';
// check.mjs, not the entry point: a thread has no use for the renderer
import { checkAbapSource, checkXmlSource } from './check.mjs';

const opts = workerData;

parentPort.on('message', ({ i, file, src, xml }) => {
  try {
    const result = xml ? checkXmlSource(src, { ...opts, file }) : checkAbapSource(src, { ...opts, file });
    result.file = file;
    parentPort.postMessage({ i, result });
  } catch (e) {
    parentPort.postMessage({ i, error: { message: e?.message ?? String(e), stack: e?.stack } });
  }
});
