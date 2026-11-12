CLASS z2ui5_cl_demo_app_cc_tree DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_node,
        kostl  TYPE csks-kostl,
        ktext  TYPE cskt-ktext,
        parent TYPE csks-kostl,
        children TYPE string_table,
      END OF ty_node,
      tt_node TYPE STANDARD TABLE OF ty_node WITH EMPTY KEY.

    DATA mt_nodes TYPE tt_node.

  PRIVATE SECTION.
    METHODS build_tree.

ENDCLASS.


CLASS z2ui5_cl_demo_app_cc_tree IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      build_tree( ).
    ENDIF.

    DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
      title          = 'Cost Centre Tree'
      navbuttonpress = client->_event_nav_app_leave( ) ).

    " Tree with expandable nodes; each node is a row with its children.
    lo_view->tree(
      items = client->_bind( mt_nodes )
      mode  = 'SingleSelectMaster' )->items(
        )->standard_tree_item(
          title = '{KOSTL} {KTEXT}'
        )->get_parent( ).

    client->view_display( lo_view->stringify( ) ).

  ENDMETHOD.

  METHOD build_tree.

    " Read the cost centres and their parent hierarchy from the database.
    SELECT k~kostl, t~ktext, k~kosar AS parent
      FROM csks AS k
      INNER JOIN cskt AS t ON t~kostl = k~kostl
                          AND t~spras = @sy-langu
      INTO CORRESPONDING FIELDS OF TABLE @mt_nodes
      UP TO 500 ROWS.

  ENDMETHOD.

ENDCLASS.
