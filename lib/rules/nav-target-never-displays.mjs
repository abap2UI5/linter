import { defineRule } from '../rule.mjs';
import { navTargetsOf } from '../guide-rules.mjs';

function check({ src, classIndex, report }) {
  /* The first rule that reads ANOTHER class's body. `nav_app_call( )` hands
   * the screen to the called app; an app whose class neither displays
   * anything nor hands control on (a leave, a further call, a message box)
   * leaves the browser on the CALLER's view while the session sits in the
   * called app - every event of that view now arrives at a class that does
   * not handle it. Judged only for a class the run's index holds (the
   * configured paths), that declares z2ui5_if_app, has no superclass that
   * could display for it, and never hands its client to another object
   * (which may display): `shows` in classIndexOf( ) is 'no' only then. A
   * class the index does not hold is somebody else's and not judged. */
  if (!classIndex) return;
  for (const name of navTargetsOf(src)) {
    const facts = classIndex.get(name);
    if (!facts || facts.shows !== 'no' || facts.superclass) continue;
    // a class name is word characters and `/` (a namespace) - escaped whole all the same
    const literal = name.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
    const at = src.search(new RegExp(`\\bnav_app_call\\s*\\([^)]*\\b${literal}\\b`, 'i'));
    report({ value: name, offset: at < 0 ? 0 : at });
  }
}

export default defineRule({
  id: 'nav-target-never-displays',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  message: (f) => `nav_app_call( ) hands the session to ${f.value}, which never displays anything and never hands control on - the browser keeps this app's view while its events reach ${f.value}; give ${f.value} a check_on_navigated( ) branch that displays its view`,
  check,
});
