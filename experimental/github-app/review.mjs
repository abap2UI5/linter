/*
 * What the App does per pull request, and the one thing that makes a hosted
 * App feasible at all: the property gate takes SOURCE, not a checkout.
 *
 * `checkAbapSource`/`checkXmlSource` are synchronous and in-memory, so this
 * service fetches the changed files over the API and lints them in the
 * request - no clone, no temp directory, no working tree to clean up after a
 * crash. The render gate is the opposite (Chromium plus ~140 MB of OpenUI5
 * per run) and is deliberately NOT here: it stays in the consumer's own CI,
 * where the Action already runs it.
 */
import { checkAbapSource, checkXmlSource } from '../../lib/index.mjs';
import { severityRank } from '../../lib/findings.mjs';
import { parseConfig } from '../../lib/config.mjs';
import { problemsOf, summarize as summarizeResults } from '../../lib/report.mjs';
import { api, fileAt, paginate } from './github.mjs';

/** The abapGit naming convention the CLI scans a directory by. A file the
 *  gate cannot read is not worth an API round trip. */
export const CHECKABLE = /\.(clas\.abap|view\.xml|fragment\.xml)$/;

const LEVEL = { error: 'failure', warning: 'warning', hint: 'notice' };

/** GitHub's own limits, not ours: 50 annotations per request, 255 characters
 *  of title, 64 KB of message. Exceeding any of them fails the whole call. */
const PER_REQUEST = 50;

/** Lint one file in memory. Returns findings only - the caller decides what
 *  a finding means for the check's conclusion. */
export function lintSource(path, source, config = {}) {
  const opts = {
    minUi5: config.ui5 || config.minUi5 || '1.71',
    distribution: config.distribution || 'sapui5',
    allow: config.allow || [],
    rules: config.rules || {},
    file: path,
    render: false,
    properties: true,
  };
  const isXml = /\.(view|fragment)\.xml$/.test(path) || /^\s*</.test(source);
  const result = isXml ? checkXmlSource(source, opts) : checkAbapSource(source, opts);
  return result.findings;
}

/*
 * Findings become check-run annotations. Two GitHub behaviours are worth
 * knowing rather than discovering: an annotation on a line OUTSIDE the pull
 * request's diff is accepted by the API and then not shown on the Files tab
 * (it only appears in the check's own output), and columns are rejected
 * unless the annotation is a single line.
 *
 * The severity, the wording and the ORDER all come from `problemsOf`
 * (lib/report.mjs) rather than from a second walk over the findings: the App
 * exists to say the same thing the CLI says, and this file had drifted into
 * its own copy of that decision. Only the payload SHAPE is App business —
 * check-run annotation objects, not the workflow-command strings
 * `githubAnnotations` writes for the Action.
 */
export function toAnnotations(path, findings) {
  return problemsOf({ findings, renderErrors: [] }).map((p) => {
    const line = Math.max(1, p.line || 1);
    const a = {
      path,
      start_line: line,
      end_line: line,
      annotation_level: LEVEL[p.severity] || 'notice',
      message: String(p.message).slice(0, 65000),
      title: String(p.rule || 'finding').slice(0, 255),
    };
    if (p.column > 0) {
      a.start_column = p.column;
      a.end_column = p.column;
    }
    return a;
  });
}

/** The repo's own `abap2ui5lint.jsonc`, so the App agrees with what the CLI
 *  and the Action would say. Absent is fine - the defaults apply.
 *
 *  Through `parseConfig`, which is the CLI's own loader: parsing the text here
 *  by hand meant an unknown key or an unknown rule id - both of which stop the
 *  CLI dead - was silently ignored by the App, so the two disagreed about the
 *  very file that exists to make them agree. */
export async function configAt(token, owner, repo, ref) {
  for (const name of ['abap2ui5lint.jsonc', 'abap2ui5lint.json']) {
    const raw = await fileAt(token, owner, repo, name, ref);
    if (raw === null) continue;
    // a broken config is the repo's problem, but silently linting with
    // different settings than they configured would be ours
    return parseConfig(name, raw);
  }
  return {};
}

/** conclusion + the human sentence at the top of the check. The COUNTS come
 *  from lib/report.mjs's summarize, so a severity override or a render-error
 *  waiver weighs here exactly what it weighs in the CLI's count line. */
export function summarize(files, findings, failOn = 'warning') {
  const { totals: counts } = summarizeResults([{ findings, renderErrors: [] }]);
  /* `never` is a threshold above every severity, not a severity: severityRank
   * floors an unknown name at 0, so reading it as a rank made "never fail"
   * mean "fail on a hint" - the App reporting a red check on exactly the
   * config that tells the CLI to stay green. cli.mjs has always used Infinity
   * here; this is the same line. */
  const threshold = failOn === 'never' ? Infinity : severityRank(failOn);
  const failing = problemsOf({ findings, renderErrors: [] })
    .filter((p) => severityRank(p.severity) >= threshold);

  if (!files.length) {
    return { conclusion: 'neutral', title: 'nothing to check', summary: 'No abap2UI5 app class, view or fragment changed in this pull request.' };
  }
  if (!findings.length) {
    return { conclusion: 'success', title: `${files.length} file(s), no findings`, summary: `Property gate over ${files.length} changed file(s): clean.` };
  }
  const parts = Object.entries(counts).filter(([, n]) => n).map(([s, n]) => `${n} ${s}${n === 1 ? '' : 's'}`);
  return {
    conclusion: failing.length ? 'failure' : 'success',
    title: `${findings.length} finding(s) in ${files.length} file(s)`,
    summary: [
      `Property gate over ${files.length} changed file(s): ${parts.join(', ')}.`,
      failing.length
        ? `${failing.length} at or above \`${failOn}\`, which is what fails this check.`
        : `Nothing at or above \`${failOn}\`, so this check passes.`,
      '',
      'The render gate (a real `XMLView.create` against OpenUI5) does not run here — it needs a browser and the OpenUI5 packages. Run it in your own CI with the [Action](https://github.com/abap2UI5/linter#github-action) or locally with `npx @abap2ui5/linter`.',
    ].join('\n'),
  };
}

/*
 * The whole per-pull-request flow. Annotations are posted in batches because
 * of the 50-per-request cap: the first batch rides along with the completed
 * check run, the rest are PATCHed on. GitHub merges annotations across
 * updates rather than replacing them.
 */
export async function reviewPullRequest({ token, owner, repo, number, headSha }) {
  const config = await configAt(token, owner, repo, headSha);
  const changed = (await paginate(token, `/repos/${owner}/${repo}/pulls/${number}/files`))
    .filter((f) => f.status !== 'removed' && CHECKABLE.test(f.filename));

  const findings = [];
  const annotations = [];
  const checked = [];
  for (const file of changed) {
    const source = await fileAt(token, owner, repo, file.filename, headSha);
    if (source === null) continue; // over 1 MB, or vanished between the two calls
    const found = lintSource(file.filename, source, config);
    checked.push(file.filename);
    findings.push(...found);
    annotations.push(...toAnnotations(file.filename, found));
  }

  const { conclusion, title, summary } = summarize(checked, findings, config.failOn || 'warning');
  const run = await api(token, 'POST', `/repos/${owner}/${repo}/check-runs`, {
    name: 'abap2UI5-linter (property gate)',
    head_sha: headSha,
    status: 'completed',
    conclusion,
    output: { title, summary, annotations: annotations.slice(0, PER_REQUEST) },
  });

  for (let i = PER_REQUEST; i < annotations.length; i += PER_REQUEST) {
    await api(token, 'PATCH', `/repos/${owner}/${repo}/check-runs/${run.id}`, {
      output: { title, summary, annotations: annotations.slice(i, i + PER_REQUEST) },
    });
  }
  return { checked: checked.length, findings: findings.length, conclusion };
}
