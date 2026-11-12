/*
 * lib/cli/watch - the CLI's --watch loop (cli.mjs), moved out of it. The run
 * itself stays in cli.mjs and is handed in: `resolveRun( )` re-reads the
 * settings, `runOnce( )` runs and reports, `dropWarm( )` closes a kept
 * renderer, `started( )` tells the CLI the loop is up (a usage error is
 * printed from then on, not fatal).
 */
import fs from 'fs';
import path from 'path';
import { shownPath } from './support.mjs';

/*
 * --watch: the run above, again on every change.
 *
 * The audience is the developer whose editor has no linter in it - Eclipse
 * ADT, with abapGit pulling the classes into a checkout - for whom the loop
 * is save, pull, read. Everything given on the command line is watched: a
 * directory recursively (fs.watch's own recursion where the platform has it,
 * one watcher per subdirectory where it does not - there a directory created
 * later is not seen until the next start), a named file through its parent
 * directory (an editor that saves by rename replaces the inode a watcher on
 * the file itself would keep following), plus the config file and the
 * baseline, each by name. Events are debounced (a save is often two or three
 * of them), a change during a run queues one more run rather than a parallel
 * one, and the settings are resolved again on every run so an edited config
 * takes effect without a restart.
 *
 * A watch never fails: the exit code of each run is what the report says
 * about the corpus, not what the process says about itself, and the only way
 * out is Ctrl+C, which is exit 0.
 */
const WATCH_DEBOUNCE_MS = 250;
// what a directory walk collects (collectFiles): the rest is noise - the
// cache file, a badge, an editor's swap file
const WATCHED_IN_DIR = /\.(clas\.abap|view\.xml|fragment\.xml)$/i;
const SKIPPED_SEGMENT = (name) => name === 'node_modules' || name.startsWith('.');

export async function watchLoop({ resolveRun, runOnce, dropWarm, started }) {
  const first = resolveRun();
  const watchers = [];
  const changed = new Set();
  let timer = null;
  let running = false;

  const hasFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  const stamp = () => new Date().toTimeString().slice(0, 8);
  const announce = () => {
    console.error(`abap2ui5lint: watching ${first.paths.join(', ')}`
      + `${first.configFile ? ` and ${shownPath(first.configFile)}` : ''}`
      + `${first.opt.baseline && hasFile(first.opt.baseline) ? ` and ${shownPath(first.opt.baseline)}` : ''}`
      + ' - Ctrl+C stops');
  };

  const rerun = async () => {
    if (running) return;
    running = true;
    const names = [...changed];
    changed.clear();
    console.error(`\n${'-'.repeat(8)} ${stamp()}  changed: ${names.join(', ')} ${'-'.repeat(8)}`);
    try {
      await runOnce(resolveRun());
    } catch (e) {
      // a config error, a bad path or a crashed gate is one line and the
      // loop goes on: the next save is the fix
      console.error(`abap2ui5lint: ${e.code === 'ERR_USAGE' ? e.message : (e.stack ?? e.message)}`);
    }
    announce();
    running = false;
    // what arrived while the run was busy is one more run, not a lost one
    if (changed.size) timer = setTimeout(rerun, WATCH_DEBOUNCE_MS);
  };
  const schedule = (name) => {
    changed.add(name);
    if (running) return;
    clearTimeout(timer);
    timer = setTimeout(rerun, WATCH_DEBOUNCE_MS);
  };

  const watch = (dir, opts, onEvent) => {
    const w = fs.watch(dir, opts, onEvent);
    // a watcher that dies (the directory removed under it) is reported, not fatal
    w.on('error', (e) => console.error(`abap2ui5lint: watch on ${dir}: ${e.message}`));
    watchers.push(w);
    return w;
  };
  /* A file by name: its directory, filtered to the one basename. */
  const watchFile = (file) => {
    const abs = path.resolve(file);
    watch(path.dirname(abs), {}, (_, filename) => {
      if (filename === path.basename(abs)) schedule(shownPath(file));
    });
  };
  /* A tree: recursive where the platform offers it, else one watcher per
   * subdirectory (node_modules and dot-directories skipped, as in the walk). */
  const relevant = (rel) => {
    const segments = rel.split(/[\\/]/);
    return WATCHED_IN_DIR.test(rel) && !segments.some(SKIPPED_SEGMENT);
  };
  const watchTree = (dir) => {
    const abs = path.resolve(dir);
    const shown = shownPath(dir);
    const onEvent = (base) => (_, filename) => {
      if (!filename) return;
      const rel = base ? path.join(base, filename) : filename;
      if (relevant(rel)) schedule(path.join(shown, rel));
    };
    try {
      watch(abs, { recursive: true }, onEvent(''));
      return;
    } catch (e) {
      if (e.code !== 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') throw e;
    }
    const walk = (at, rel) => {
      watch(at, {}, onEvent(rel));
      for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
        if (entry.isDirectory() && !SKIPPED_SEGMENT(entry.name)) walk(path.join(at, entry.name), path.join(rel, entry.name));
      }
    };
    walk(abs, '');
  };

  /* The watchers go up BEFORE the first run, and that run counts as a
   * running one: with the render gate it is seconds of browser launch and UI5
   * boot, and a file saved in that window - after the run had collected, with
   * nothing watching yet - was never seen; the loop then reported the old
   * state until the next save. What arrives during the first run is one more
   * run after it, exactly as during any other. A path that is not there is
   * left to the first run, which says so and exits 2. */
  running = true;
  for (const p of first.paths) {
    let isDir;
    try { isDir = fs.statSync(p).isDirectory(); } catch { continue; }
    if (isDir) watchTree(p); else watchFile(p);
  }
  /* The class index reads the configured paths whatever the run checks
   * (indexOnlySources), so a saved superclass is a change to this run's
   * verdict too. */
  const watchedRoots = new Set(first.paths.map((p) => path.resolve(p)));
  for (const p of first.indexPaths ?? []) {
    if (watchedRoots.has(path.resolve(p))) continue;
    let isDir;
    try { isDir = fs.statSync(p).isDirectory(); } catch { continue; }
    if (isDir) watchTree(p); else watchFile(p);
  }
  if (first.configFile) watchFile(first.configFile);
  if (first.opt.baseline && hasFile(first.opt.baseline)) watchFile(first.opt.baseline);

  // the first run is an ordinary one: bad usage still exits 2, because the
  // loop has not started yet and a wrong path is not something a save corrects
  await runOnce(first);
  started();
  announce();
  running = false;
  if (changed.size) timer = setTimeout(rerun, WATCH_DEBOUNCE_MS);

  const stop = async () => {
    for (const w of watchers) w.close();
    await dropWarm();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
