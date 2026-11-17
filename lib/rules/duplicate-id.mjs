import { defineRule } from '../rule.mjs';
import { isBinding } from '../ui5-meta.mjs';

function check({ full, idsSeen, node, report }) {
  // an id written twice is a duplicate-ID error at runtime
  // a value the reconstruction had to GUESS at (an id built from a LOOP
  // index) is the same for every row here and distinct at runtime -
  // reporting it as a duplicate reports the reconstruction, not the app
  const idAttr = node.attrs.find(([n]) => n === 'id');
  if (idAttr && !isBinding(idAttr[1]) && !node.guessedAttrs?.has('id')) {
    if (idsSeen.has(idAttr[1])) {
      report({ control: full, member: 'id', value: idAttr[1], offset: idAttr[2] ?? node.offset });
    }
    idsSeen.add(idAttr[1]);
  }

}

export default defineRule({
  id: 'duplicate-id',
  severity: 'error',
  category: 'structure',
  scope: 'node',
  message: (f) => `id="${f.value}" is used twice — duplicate ID error at runtime`,
  check,
});
