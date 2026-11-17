import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'missing-on-navigated-branch',
  summary: 'a lifecycle dispatcher with no `check_on_navigated( )` branch at all',
  detail: '`check_on_init( )` means "this app INSTANCE never ran", not "the app starts" — abap2UI5 flips the flag after the very first roundtrip. So it is false on three roundtrips that put the app back on screen: a called app leaving through `nav_app_leave( )`, one of the built-in `z2ui5_cl_pop_*` value helps returning (those run over `nav_app_call` too), and a bookmarked draft being restored. All three raise `check_on_navigated( )` — a called app that leaves with an event (`nav_app_leave( event = … )`, how the confirm and select popups hand back their result) raises that event on the same roundtrip, which is why a class that calls other apps keeps its event arms AHEAD of the navigated arm. With no branch for it `main( )` does nothing, the response carries no display, and the model is pushed into a MAIN slot still holding the other app\'s view. The screen stays wrong with no error anywhere — which is why an app written this way works perfectly until the day something navigates into it. This is the complement of `missing-view-display-on-navigated`, which judges a branch that exists but never displays; the two never fire on the same class. An app whose display is not gated by the lifecycle at all — a `view_display( )` after the `IF`/`ELSEIF` chain, or the `client->nav_app_leave( )` a popup helper ends on — is correct as it stands and is not reported. The remedy is a rename, not a second branch: `check_on_init( )` implies `check_on_navigated( )` (every path to an instance\'s first `main( )` raises the navigated flag too), so dispatching the display on `check_on_navigated( )` covers the first start AND every hop back — and an `ELSEIF check_on_navigated( )` twin added under an init branch that only displays is the fork `redundant-init-display` reports. Keep a `check_on_init( )` branch only for what must happen once: `model_init( ). view_display( ).` in the init arm ahead of the navigated arm is a fork that decides something, and stays.',
  example: `IF client->check_on_init( ).
  view_display( ).
ELSEIF client->check_on_event( ).
  on_event( ).
ENDIF.`,
  remedy: `IF client->check_on_navigated( ).   " true on the first start too: check_on_init( ) implies it
  view_display( ).
ELSEIF client->check_on_event( ).
  on_event( ).
ENDIF.`,
  fixNote: 'An `ELSEIF client->check_on_navigated( ).` branch is written before the token that ends the init branch, carrying a copy of the init branch\'s own display statement — only when that branch has exactly one statement at its own level that displays (directly, or through a method of the class) and that statement reads no variable the branch declares; otherwise the finding stays without a fix. In a class that calls other apps (`nav_app_call`) the branch is written LAST in the chain instead, behind the event arms a returning app\'s event has to reach, and a chain ending in `ELSE` is left without a fix.',
});
