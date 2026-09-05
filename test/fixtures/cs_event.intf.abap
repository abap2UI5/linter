* A copy of z2ui5_if_client=>cs_event - abap2UI5, src/02/z2ui5_if_client.intf.abap,
* as of 2026-09-05: the closed set of event names an app may hand to
* _event_client( ) or follow_up_action( ). scripts/check-upstream.mjs reads the
* live interface (weekly, with network); this copy is what the suite reads
* offline, so every constant here has to be accepted by lib/frontend-actions.mjs
* (FRONTEND_EVENTS, FRONTEND_EVENT_ALIASES or SERVER_EVENTS) - HASH_REPLACE and
* HASH_ATTACH_CHANGED were not, and a wire naming them was reported as unknown.
INTERFACE zif_fixture_cs_event PUBLIC.

  CONSTANTS:
    BEGIN OF cs_event,

      popup_close               TYPE string VALUE `POPUP_CLOSE`,
      popover_close             TYPE string VALUE `POPOVER_CLOSE`,

      set_size_limit            TYPE string VALUE `SET_SIZE_LIMIT`,
      set_odata_model           TYPE string VALUE `SET_ODATA_MODEL`,

      cross_app_nav_to_ext      TYPE string VALUE `CROSS_APP_NAV_TO_EXT`,
      cross_app_nav_to_prev_app TYPE string VALUE `CROSS_APP_NAV_TO_PREV_APP`,

      clipboard_copy            TYPE string VALUE `CLIPBOARD_COPY`,
      set_title                 TYPE string VALUE `SET_TITLE`,
      set_favicon               TYPE string VALUE `SET_FAVICON`,
      set_focus                 TYPE string VALUE `SET_FOCUS`,
      scroll_to                 TYPE string VALUE `SCROLL_TO`,
      scroll_into_view          TYPE string VALUE `SCROLL_INTO_VIEW`,
      start_timer               TYPE string VALUE `START_TIMER`,
      system_logout             TYPE string VALUE `SYSTEM_LOGOUT`,
      keyboard_set_mode         TYPE string VALUE `KEYBOARD_SET_MODE`,
      keyboard_shortcut         TYPE string VALUE `KEYBOARD_SHORTCUT`,
      open_new_tab              TYPE string VALUE `OPEN_NEW_TAB`,
      location_reload           TYPE string VALUE `LOCATION_RELOAD`,
      set_title_launchpad       TYPE string VALUE `SET_TITLE_LAUNCHPAD`,
      download_b64_file         TYPE string VALUE `DOWNLOAD_B64_FILE`,
      urlhelper                 TYPE string VALUE `URLHELPER`,
      store_data                TYPE string VALUE `STORE_DATA`,
      play_audio                TYPE string VALUE `PLAY_AUDIO`,

      smart_variant_init        TYPE string VALUE `SMART_VARIANT_INIT`,
      filter_bar_variant_init   TYPE string VALUE `FILTER_BAR_VARIANT_INIT`,

      "Control
      control_by_id             TYPE string VALUE `CONTROL_BY_ID`,
      control_global            TYPE string VALUE `CONTROL_GLOBAL`,
      binding_call              TYPE string VALUE `BINDING_CALL`,
      bind_element              TYPE string VALUE `BIND_ELEMENT`,

      " the hash_* family - everything that reads, writes or observes the URL
      " fragment, named after its UI5 original (sap/ui/core/routing/HashChanger):
      " hash_set = setHash (a PUSHED history entry), hash_replace = replaceHash
      " (no new entry), hash_back = one consumed step back with an optional
      " fallback hash (the UI5 onNavBack pattern), hash_attach_changed =
      " attachHashChanged (registers a backend event for foreign hash changes),
      " hash_routing = the hash-based app routing modes (cs_nav_mode).
      " app_state_set_active keeps the id of the CURRENT app state in the URL.
      " hash_set / hash_routing / app_state_set_active share their wire value
      " with their obsolete spellings below - both names reach the same branch.
      " The one-word comment right before the run is its LABEL on the
      " documentation site (docs, scripts/lib/client-interface.mjs reads the
      " first line of a comment run): keep it one line, keep it last.

      "experimental
      hash_set                  TYPE string VALUE `SET_PUSH_STATE`,
      hash_replace              TYPE string VALUE `HASH_REPLACE`,
      hash_back                 TYPE string VALUE `HASH_BACK`,
      hash_attach_changed       TYPE string VALUE `HASH_ATTACH_CHANGED`,
      hash_routing              TYPE string VALUE `SET_NAV_ROUTING`,
      app_state_set_active      TYPE string VALUE `SET_APP_STATE_ACTIVE`,

      " everything from here to END OF is kept for compatibility only and is
      " NOT on the documentation site (its deprecations page names each one
      " with its successor): the site's generator drops every member under a
      " label that opens with "obsolete", so a run added here needs one

      "obsolete - the hash_* / app_state_* spellings above replace these
      set_app_state_active      TYPE string VALUE `SET_APP_STATE_ACTIVE`,
      set_push_state            TYPE string VALUE `SET_PUSH_STATE`,
      set_nav_routing           TYPE string VALUE `SET_NAV_ROUTING`,
      "obsolete - superseded by app_state_get_href( ) + cs_event-clipboard_copy:
      " the backend composes the same link itself now (the browser location
      " and the live hash ride with the requests), so the app can also SHOW it
      clipboard_app_state       TYPE string VALUE `CLIPBOARD_APP_STATE`,
      "obsolete
      image_editor_popup_close  TYPE string VALUE `IMAGE_EDITOR_POPUP_CLOSE`,
      nav_container_to          TYPE string VALUE `NAV_CONTAINER_TO`,
      nest_nav_container_to     TYPE string VALUE `NEST_NAV_CONTAINER_TO`,
      nest2_nav_container_to    TYPE string VALUE `NEST2_NAV_CONTAINER_TO`,
      popup_nav_container_to    TYPE string VALUE `POPUP_NAV_CONTAINER_TO`,
      popover_nav_container_to  TYPE string VALUE `POPOVER_NAV_CONTAINER_TO`,
      z2ui5                     TYPE string VALUE `Z2UI5`,
      wizard_set_next_step      TYPE string VALUE `WIZARD_SET_NEXT_STEP`,

    END OF cs_event.

ENDINTERFACE.
