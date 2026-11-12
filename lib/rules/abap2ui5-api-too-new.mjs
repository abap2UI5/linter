import { defineRule } from '../rule.mjs';
import { ABAP2UI5_SINCE } from '../abap2ui5-since.mjs';

/* release order of `1.140.0`-shaped strings */
const newer = (a, b) => {
  if (a === 'main') return true; // on main, in no release yet
  const x = a.split('.').map(Number); const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

function check({ code, abap2ui5, report }) {
  /* A name of the client API the abap2UI5 release the app runs on does not
   * have yet. Every other rule here judges against abap2UI5's main (the
   * manifest, the mirrors), which is right for a framework that ships from
   * main and wrong for an app on an installation that is not updated: the
   * class does not activate there. Judged only when the release is given
   * (`abap2ui5` in the config, --abap2ui5) and only for names
   * data/abap2ui5-since.json dates - anything older than its first release
   * is not judged, and a name it does not know is not judged either. Read
   * from `code`, the source with literal content blanked, so a name quoted
   * in a string is no use of it. */
  if (!abap2ui5) return;
  const seen = new Set();
  const hit = (kind, name, since, offset) => {
    if (!since || !newer(since, abap2ui5)) return;
    report({ member: kind, value: name, since, installed: abap2ui5, dedupe: String(offset), offset });
    seen.add(name);
  };
  for (const m of code.matchAll(/(?:z2ui5_if_client\s*=>|->)\s*cs_event-(\w+)/gi)) {
    const name = m[1].toUpperCase();
    hit('cs_event', name, ABAP2UI5_SINCE.clientEvents[name], m.index + m[0].length - m[1].length);
  }
  for (const m of code.matchAll(/\b\w*client\s*->\s*(\w+)\s*\(/gi)) {
    const name = m[1].toLowerCase();
    hit('method', name, ABAP2UI5_SINCE.clientMethods[name], m.index + m[0].lastIndexOf(m[1]));
  }
}

export default defineRule({
  id: 'abap2ui5-api-too-new',
  severity: 'error',
  category: 'version',
  scope: 'app',
  summary: 'a name of the client API newer than the abap2UI5 release the app runs on — the class does not activate there',
  detail: 'The linter knows abap2UI5 as its `main` branch is today. An app does not run on main: it runs on the release its system has installed, and a `client->cs_event-…` constant or a `client->…( )` method added later does not exist there — the class does not activate, which a systemless pipeline only learns when the transport is imported. With `"abap2ui5": "1.140.0"` in `abap2ui5lint.jsonc` (or `--abap2ui5 1.140.0`; the release is the `version` constant of `z2ui5_if_app` on that system) every such name is reported with the release that brought it. The dates come from `data/abap2ui5-since.json`, read out of `z2ui5_if_client` at every release tag; a name already in its first release is not judged, and without the setting nothing is. Update the installation, or write the app without the newer name.',
  example: `client->follow_up_action( client->_event_client( client->cs_event-set_focus ) ).   " "abap2ui5": "1.140.0" - SET_FOCUS came with 1.142.0`,
  remedy: `" update abap2UI5 to 1.142.0 or later, or move the focus another way on 1.140.0`,
  message: (f) => `${f.member === 'cs_event' ? `cs_event-${String(f.value).toLowerCase()}` : `client->${f.value}( )`} ${f.since === 'main' ? 'is on abap2UI5\'s main and in no release yet' : `came with abap2UI5 ${f.since}`} — the configured release ${f.installed} does not have it, so the class does not activate there; update abap2UI5 or do without it`,
  check,
});
