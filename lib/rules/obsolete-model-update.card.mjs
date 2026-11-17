import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'obsolete-model-update',
  summary: '`view_model_update( )` & friends — empty methods, the model is pushed automatically',
  detail: 'The framework compares the model state before `main( )` with the state after it returned and, when they differ, sends it to every open view slot by itself. `view_model_update( )`, `nest_view_model_update( )`, `nest2_view_model_update( )`, `popup_model_update( )` and `popover_model_update( )` are therefore deliberately **empty** methods, kept in `z2ui5_if_client` only so existing apps keep compiling. A leftover call is not merely dead weight — it reads as "the model is pushed here" at a place where nothing at all happens. Delete it. The one thing that went with them is the ability to force an *unchanged* model back onto the client (a control that wrote a bound property without sending it back): rebuild the view with `view_display( )` for that.',
  example: 'client->popup_model_update( ).   " does nothing',
  remedy: '" nothing - the model travels with the roundtrip; delete the call',
  fixNote: 'The call is deleted, together with the line when it has that line to itself; a line shared with other code or a trailing comment keeps everything but the call.',
});
