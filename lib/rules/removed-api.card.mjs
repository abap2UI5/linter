import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'removed-api',
  summary: 'a name abap2UI5 removed, or moved to another repository — with the release and what to write instead',
  detail: 'abap2UI5 is older than its current API: `client->set_nav_back( )`, `cs_event-wizard_set_next_step`, `z2ui5_if_app~check_initialized` and the built-in popups are what years of public examples show, and therefore what a developer returning to it — or a language model — writes first. Several of those names are gone. abaplint says so truthfully and briefly (`Method "set_nav_back" not found`); it cannot say that the method was removed in 1.143.0 and that `follow_up_action( )` took its place. This rule can, because the documentation publishes exactly that as data: the table on [Deprecations](https://abap2ui5.github.io/docs/resources/deprecations) is generated into `api/deprecations.json`, and the linter carries a copy (`data/deprecations.json`). Nothing in the sentence is the linter\'s own — the status, the release, the successor and the repository are the entry\'s. Judged: an object name (`z2ui5_cl_pop_js_loader`), a method called on `client`, a `cs_event-…` constant, an attribute of `z2ui5_if_app`, a parameter or a structure component passed in a `client->` call. A **removed** name is an error: on the release named, and on every later one, the class does not compile. A **moved** name is a warning: the object still exists, unchanged, in the repository the finding names, and compiles wherever that repository is installed next to abap2UI5 — which this run cannot see. Not reported here, because another rule already reports the very token: the objects `non-released-api` knows (the whole former `src/99`, `z2ui5_if_exit`, `z2ui5_cl_http_handler`), `_bind_edit( )` (`obsolete-binder`), the `*_model_update( )` methods (`obsolete-model-update`), `_bind( view = … )` (`obsolete-bind-argument`) and `get( )-viewname` (`get-viewname-removed`). A name that is only *deprecated* still compiles and is left to the `obsolete-*` rules. An object the linted repository defines itself is never reported, and neither is a name in a string or a comment. On an installation that stays on a release older than the one named, the finding is ahead of that system: say so once in the config, `"rules": { "removed-api": "warning" }`.',
  example: `client->set_push_state( \`&my-app-state=detail\` ).            " removed in 1.144.1
client->follow_up_action( client->cs_event-set_nav_routing ).   " removed in 1.144.1
IF z2ui5_if_app~check_initialized = abap_false.           " removed in 1.143.0
ENDIF.`,
  remedy: `client->hash_set( \`&my-app-state=detail\` ).
client->follow_up_action( client->cs_event-hash_routing ).
IF client->check_on_init( ).
ENDIF.`,
});
