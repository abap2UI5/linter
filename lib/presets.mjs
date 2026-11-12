/*
 * presets — the settings a config can start from by name:
 *
 *   { "extends": "abap2ui5:strict" }
 *
 * A preset is the BASE of an `extends` chain like a file is (lib/config.mjs,
 * resolveExtends): the extending config wins per key and the two `rules`
 * blocks merge per rule id. They exist because the same three intentions
 * were spelled out key by key in every consumer's config - samples-controls
 * switches nine rules off in one of its four, abap2UI5 raises the house
 * layout to a warning, the addons adopting the linter on old code fail on
 * errors only - and a hand-written list does not follow a new rule.
 *
 * Each is written in config keys, validated by the same loader, so a preset
 * cannot carry anything a file could not.
 */
export const PRESETS = Object.freeze({
  /* The defaults, named: failing on warnings, every rule at the severity its
   * card gives it, the opt-in rules off. What `--init` writes starts here. */
  'abap2ui5:recommended': Object.freeze({ failOn: 'warning' }),

  /* For code this project writes itself: hints fail too, and the two opt-in
   * rules that are not about portability are on - the house chain layout
   * the framework and its sample repositories are written in, and the
   * size-limit rule for a list seeded past the JSONModel's 100. */
  'abap2ui5:strict': Object.freeze({
    failOn: 'hint',
    rules: Object.freeze({
      'chain-house-layout': 'warning',
      'bound-aggregation-over-size-limit': 'warning',
    }),
  }),

  /* For a codebase adopting the linter: only what breaks fails the build;
   * warnings and hints are still reported, and a baseline
   * (--update-baseline) takes the rest. */
  'abap2ui5:adopt': Object.freeze({ failOn: 'error' }),
});

export const PRESET_PREFIX = 'abap2ui5:';
