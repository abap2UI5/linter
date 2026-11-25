import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'style-block-per-view',
  summary: 'a `<style>` block of more than 2 KB in a view the class displays from an event branch',
  detail: 'The usual way to give an abap2UI5 app its own CSS is a `core:HTML` whose `content` is a `<style>` block. The view is XML sent with the response, so the stylesheet travels with every `view_display( )` - and an app that rebuilds its view on every event sends it on every roundtrip; a palette copied into each app\'s view is the same kilobytes again for every app. Two cheaper places exist: the installation\'s exit, `z2ui5_if_ui5_exit=>ty_s_http_config-styles_css`, which the HTTP handler writes into the page head once per page load, and a view displayed once, which a roundtrip that only changes data updates through the model. Reported: a sheet whose literal CSS is 2048 bytes or more (a fixed threshold - a rule takes no options), in a method or constant the class reaches from `main( )` on a path through an event arm (a `WHEN` of the event `CASE`, `check_on_event( )`, the `ELSE` of a lifecycle fork) or unconditionally, and through no `check_on_init( )` / `check_on_navigated( )` arm. Not reported: a smaller block, a view displayed only on init or navigation, a path through any other condition only, a sheet whose method nothing in the class calls, and a sheet built from data (a variable concatenated in, a template with an embedded expression) - it changes per roundtrip and its size is the data\'s. A native `html:style` element is not read. A hint: the view works, it is only heavy.',
  example: `METHOD z2ui5_if_app~main.
  " … every event:
  client->view_display( view->stringify( ) ).   " the view carries a 9 KB <style>`,
  remedy: `METHOD z2ui5_if_app~main.
  IF client->check_on_init( ).
    client->view_display( view->stringify( ) ).   " displayed once
  ENDIF.
  " the palette: z2ui5_if_ui5_exit, ty_s_http_config-styles_css`,
});
