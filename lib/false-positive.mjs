/*
 * false-positive — the issue a finding the linter has wrong is reported with.
 *
 * A baseline entry marked in `falsePositives` (lib/baseline.mjs) is a record
 * that a rule misfired, kept in the one repository where nobody can fix the
 * rule. This turns that record into the report the rule's maintainers need:
 * the sections of `.github/ISSUE_TEMPLATE/false-positive.md`, filled from
 * what the run already knows - the rule, the finding as it was printed, the
 * source around it, the reason the mark gives, and the versions.
 *
 *   falsePositiveIssue({ finding, file, reason, source, version, ui5, distribution })
 *     -> { title, body, url }
 *
 * `url` opens GitHub's new-issue form with title and body in the query. It
 * carries the SOURCE EXCERPT only as long as the whole stays under what a
 * browser and GitHub accept; past that the excerpt is left to be pasted from
 * the printed body. Nothing is sent anywhere by this module or by the CLI -
 * the code leaves the machine when a person opens the link and submits.
 *
 * No finding is emitted here.
 */
import { severityOf } from './findings.mjs';

export const ISSUES_URL = 'https://github.com/abap2UI5/linter/issues/new';
/* GitHub answers 414 a little past 8 kB of URL; the query is percent-encoded,
 * so the budget is on the encoded form. */
const URL_BUDGET = 6000;
/* Lines of source shown on each side of the reported line. */
const CONTEXT_LINES = 6;

/** The lines around `line` (1-based) of `source`, as text - or '' when the
 *  source or the line is unknown. */
export function sourceExcerpt(source, line, context = CONTEXT_LINES) {
  if (typeof source !== 'string' || !Number.isInteger(line) || line < 1) return '';
  const lines = source.split(/\r?\n/);
  if (line > lines.length) return '';
  return lines.slice(Math.max(0, line - 1 - context), Math.min(lines.length, line + context)).join('\n').replace(/\s+$/, '');
}

const fence = (text, lang = '') => {
  // a fence longer than any run of backticks inside it - ABAP string
  // templates and backtick literals are everywhere in a builder chain
  const longest = Math.max(2, ...[...String(text).matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}${lang}\n${text}\n${ticks}`;
};

/** The issue for ONE finding marked as a false positive. */
export function falsePositiveIssue({ finding, file = null, reason, source = null, version = null, ui5 = null, distribution = null }) {
  const f = finding;
  const where = f.line ? `${f.line}:${f.column ?? 1}` : '';
  const reported = [file ? `${file}` : null, `  ${[where, severityOf(f), f.message, f.type].filter(Boolean).join('  ')}`]
    .filter(Boolean).join('\n');
  const excerpt = sourceExcerpt(source, f.line);
  const subject = (f.control ? [f.control, f.member].filter(Boolean).join(' ') : f.value || f.member) || 'correct code';
  const title = `${f.type} on ${String(subject).slice(0, 80)}`;
  const versions = [
    version ? `@abap2ui5/linter ${version}` : null,
    ui5 ? `ui5 ${ui5}` : null,
    distribution ? `distribution ${distribution}` : null,
  ].filter(Boolean).join(', ');
  const sections = (withSource) => [
    `**Rule id**\n${f.type}`,
    `**The finding**\n${fence(reported)}`,
    `**The source it reported**\n${withSource && excerpt
      ? fence(excerpt, 'abap')
      : '<!-- paste the smallest chain or class that still produces it -->'}`,
    `**Why it is correct**\n${reason}`,
    `**Version**\n${versions || '<!-- npx --no-install abap2ui5lint --version -->'}`,
  ].join('\n\n');
  const body = sections(true);
  const urlOf = (text) => `${ISSUES_URL}?${new URLSearchParams({ template: 'false-positive.md', labels: 'false-positive', title, body: text })}`;
  const full = urlOf(body);
  return { title, body, url: full.length <= URL_BUDGET ? full : urlOf(sections(false)) };
}
