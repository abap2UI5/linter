import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'abap2ui5-api-too-new',
  summary: 'a name of the client API newer than the abap2UI5 release the app runs on — the class does not activate there',
  detail: 'The linter knows abap2UI5 as its `main` branch is today. An app does not run on main: it runs on the release its system has installed, and a `client->cs_event-…` constant or a `client->…( )` method added later does not exist there — the class does not activate, which a systemless pipeline only learns when the transport is imported. With `"abap2ui5": "1.140.0"` in `abap2ui5lint.jsonc` (or `--abap2ui5 1.140.0`; the release is the `version` constant of `z2ui5_if_app` on that system) every such name is reported with the release that brought it. The dates come from `data/abap2ui5-since.json`, read out of `z2ui5_if_client` at every release tag; a name already in its first release is not judged, and without the setting nothing is. Update the installation, or write the app without the newer name.',
  example: `client->follow_up_action( client->_event_client( client->cs_event-set_focus ) ).   " "abap2ui5": "1.140.0" - SET_FOCUS came with 1.142.0`,
  remedy: `" update abap2UI5 to 1.142.0 or later, or move the focus another way on 1.140.0`,
});
