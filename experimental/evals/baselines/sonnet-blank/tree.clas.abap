CLASS z2ui5_cl_app_tree DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES ty_t_node TYPE STANDARD TABLE OF REF TO data WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_s_leaf,
        id    TYPE string,
        text  TYPE string,
        owner TYPE string,
      END OF ty_s_leaf.
    TYPES ty_t_leaf TYPE STANDARD TABLE OF ty_s_leaf WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_s_mid,
        id    TYPE string,
        text  TYPE string,
        owner TYPE string,
        nodes TYPE ty_t_leaf,
      END OF ty_s_mid.
    TYPES ty_t_mid TYPE STANDARD TABLE OF ty_s_mid WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_s_root,
        id    TYPE string,
        text  TYPE string,
        owner TYPE string,
        nodes TYPE ty_t_mid,
      END OF ty_s_root.
    TYPES ty_t_root TYPE STANDARD TABLE OF ty_s_root WITH DEFAULT KEY.

    DATA mt_tree TYPE ty_t_root.

  PROTECTED SECTION.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.

  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_tree IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mt_tree = VALUE #(
          ( id = '1000' text = 'Company' owner = 'CEO'
            nodes = VALUE #(
              ( id = '1100' text = 'Sales' owner = 'MUELLER'
                nodes = VALUE #(
                  ( id = '1110' text = 'Sales Europe' owner = 'SMITH' )
                  ( id = '1120' text = 'Sales USA'    owner = 'JONES' ) ) )
              ( id = '1200' text = 'IT' owner = 'MEIER'
                nodes = VALUE #(
                  ( id = '1210' text = 'Development' owner = 'KLEIN' )
                  ( id = '1220' text = 'Operations'  owner = 'BRAUN' ) ) ) ) ) ).
      view_display( client ).
    ENDIF.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).
    DATA(page) = view->shell( )->page( title = 'Cost Centre Tree' ).

    DATA(tree) = page->tree( items = client->_bind( mt_tree ) ).

    tree->items( )->standard_tree_item(
        title = '{TEXT}'
        info  = '{OWNER}' ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
