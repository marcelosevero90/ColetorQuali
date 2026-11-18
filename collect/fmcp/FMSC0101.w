&ANALYZE-SUSPEND _VERSION-NUMBER UIB_v8r12 GUI
&ANALYZE-RESUME
/* Connected Databases 
          mgespec          PROGRESS
*/
&Scoped-define WINDOW-NAME wMaintenance


/* Temp-Table and Buffer definitions                                    */
DEFINE TEMP-TABLE tt-fmsc-usuar-mestre NO-UNDO LIKE fmsc-usuar-mestre
       field r-rowid as rowid.



&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CUSTOM _DEFINITIONS wMaintenance 
/*:T*******************************************************************************
** Copyright TOTVS S.A. (2009)
** Todos os Direitos Reservados.
**
** Este fonte e de propriedade exclusiva da TOTVS, sua reproducao
** parcial ou total por qualquer meio, so podera ser feita mediante
** autorizacao expressa.
*******************************************************************************/
{include/i-prgvrs.i FMSC0101 1.00.00.000}

/* Chamada a include do gerenciador de licen‡as. Necessario alterar os parametros */
/*                                                                                */
/* <programa>:  Informar qual o nome do programa.                                 */
/* <m¢dulo>:  Informar qual o m¢dulo a qual o programa pertence.                  */

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i FMSC0101 CDP}
&ENDIF

CREATE WIDGET-POOL.

/* Preprocessors Definitions ---                                      */
&GLOBAL-DEFINE Program        FMSC0101
&GLOBAL-DEFINE Version        1.00.00.001

&GLOBAL-DEFINE Folder         YES
&GLOBAL-DEFINE InitialPage    1

&GLOBAL-DEFINE FolderLabels   Geral,Estoque,Compras,Cr‚dito,Produ‡Æo

&GLOBAL-DEFINE First          YES
&GLOBAL-DEFINE Prev           YES
&GLOBAL-DEFINE Next           YES
&GLOBAL-DEFINE Last           YES
&GLOBAL-DEFINE GoTo           YES
&GLOBAL-DEFINE Search         YES

&GLOBAL-DEFINE Add            YES
&GLOBAL-DEFINE Copy           YES
&GLOBAL-DEFINE Update         YES
&GLOBAL-DEFINE Delete         YES
&GLOBAL-DEFINE Undo           YES
&GLOBAL-DEFINE Cancel         YES
&GLOBAL-DEFINE Save           YES

&GLOBAL-DEFINE ttTable        tt-fmsc-usuar-mestre
&GLOBAL-DEFINE hDBOTable      h-FMSBO0101
&GLOBAL-DEFINE DBOTable       fmsc-usuar-mestre

&GLOBAL-DEFINE page0KeyFields tt-fmsc-usuar-mestre.ep-codigo tt-fmsc-usuar-mestre.cod-usuario
&GLOBAL-DEFINE page0Fields    
&GLOBAL-DEFINE page1Fields    tt-fmsc-usuar-mestre.cod-estabel-pad tt-fmsc-usuar-mestre.int-2 
&GLOBAL-DEFINE page2Fields    tt-fmsc-usuar-mestre.l-estoque tt-fmsc-usuar-mestre.l-permis-estoq[1] ~
                                                             tt-fmsc-usuar-mestre.l-permis-estoq[2] ~
                                                             tt-fmsc-usuar-mestre.l-permis-estoq[3] ~
                                                             tt-fmsc-usuar-mestre.l-permis-estoq[4] ~
                                                             tt-fmsc-usuar-mestre.l-permis-estoq[5] 
                                                             
&GLOBAL-DEFINE page3Fields    tt-fmsc-usuar-mestre.l-compras  tt-fmsc-usuar-mestre.l-permis-compras[1]
&GLOBAL-DEFINE page4Fields    tt-fmsc-usuar-mestre.l-credito  tt-fmsc-usuar-mestre.l-permis-credito[1]
&GLOBAL-DEFINE page5Fields    tt-fmsc-usuar-mestre.l-producao tt-fmsc-usuar-mestre.l-permis-rep-ordem-prod[1] ~
                                                              tt-fmsc-usuar-mestre.l-permis-est-ordem-prod[1]

/* Parameters Definitions ---                                           */

/* Local Variable Definitions ---                                       */
DEFINE NEW GLOBAL SHARED VAR adm-broker-hdl         AS HANDLE    NO-UNDO.
DEFINE VARIABLE wh-pesquisa                         AS HANDLE    NO-UNDO.

/* Local Variable Definitions (DBOs Handles) --- */
DEFINE VARIABLE {&hDBOTable} AS HANDLE NO-UNDO.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&ANALYZE-SUSPEND _UIB-PREPROCESSOR-BLOCK 

/* ********************  Preprocessor Definitions  ******************** */

&Scoped-define PROCEDURE-TYPE Maintenance
&Scoped-define DB-AWARE no

/* Name of designated FRAME-NAME and/or first browse and/or first query */
&Scoped-define FRAME-NAME fpage0

/* Standard List Definitions                                            */
&Scoped-Define ENABLED-FIELDS tt-fmsc-usuar-mestre.cod-usuario 
&Scoped-define ENABLED-TABLES tt-fmsc-usuar-mestre
&Scoped-define FIRST-ENABLED-TABLE tt-fmsc-usuar-mestre
&Scoped-Define ENABLED-OBJECTS rtToolBar rtKeys btFirst btPrev btNext ~
btLast btGoTo btSearch btAdd btCopy btUpdate btDelete btUndo btCancel ~
btSave btQueryJoins btReportsJoins btExit btHelp fi-nome-usuar 
&Scoped-Define DISPLAYED-FIELDS tt-fmsc-usuar-mestre.cod-usuario 
&Scoped-define DISPLAYED-TABLES tt-fmsc-usuar-mestre
&Scoped-define FIRST-DISPLAYED-TABLE tt-fmsc-usuar-mestre
&Scoped-Define DISPLAYED-OBJECTS fi-nome-usuar 

/* Custom List Definitions                                              */
/* List-1,List-2,List-3,List-4,List-5,List-6                            */

/* _UIB-PREPROCESSOR-BLOCK-END */
&ANALYZE-RESUME



/* ***********************  Control Definitions  ********************** */

/* Define the widget handle for the window                              */
DEFINE VARIABLE wMaintenance AS WIDGET-HANDLE NO-UNDO.

/* Menu Definitions                                                     */
DEFINE SUB-MENU smFile 
       MENU-ITEM miFirst        LABEL "&Primeiro"      ACCELERATOR "CTRL-HOME"
       MENU-ITEM miPrev         LABEL "&Anterior"      ACCELERATOR "CTRL-CURSOR-LEFT"
       MENU-ITEM miNext         LABEL "&Pr¢ximo"       ACCELERATOR "CTRL-CURSOR-RIGHT"
       MENU-ITEM miLast         LABEL "&éltimo"        ACCELERATOR "CTRL-END"
       RULE
       MENU-ITEM miGoTo         LABEL "&V  Para"       ACCELERATOR "CTRL-T"
       MENU-ITEM miSearch       LABEL "&Pesquisa"      ACCELERATOR "CTRL-F5"
       RULE
       MENU-ITEM miAdd          LABEL "&Incluir"       ACCELERATOR "CTRL-INS"
       MENU-ITEM miCopy         LABEL "&Copiar"        ACCELERATOR "CTRL-C"
       MENU-ITEM miUpdate       LABEL "&Alterar"       ACCELERATOR "CTRL-A"
       MENU-ITEM miDelete       LABEL "&Eliminar"      ACCELERATOR "CTRL-DEL"
       RULE
       MENU-ITEM miUndo         LABEL "&Desfazer"      ACCELERATOR "CTRL-U"
       MENU-ITEM miCancel       LABEL "&Cancelar"      ACCELERATOR "CTRL-F4"
       RULE
       MENU-ITEM miSave         LABEL "&Salvar"        ACCELERATOR "CTRL-S"
       RULE
       MENU-ITEM miQueryJoins   LABEL "&Consultas"    
       MENU-ITEM miReportsJoins LABEL "&Relat¢rios"   
       RULE
       MENU-ITEM miExit         LABEL "&Sair"          ACCELERATOR "CTRL-X".

DEFINE SUB-MENU smHelp 
       MENU-ITEM miContents     LABEL "&Conte£do"     
       RULE
       MENU-ITEM miAbout        LABEL "&Sobre..."     .

DEFINE MENU mbMain MENUBAR
       SUB-MENU  smFile         LABEL "&Arquivo"      
       SUB-MENU  smHelp         LABEL "&Ajuda"        .


/* Definitions of the field level widgets                               */
DEFINE BUTTON btAdd 
     IMAGE-UP FILE "image\im-add":U
     IMAGE-INSENSITIVE FILE "image\ii-add":U
     LABEL "Add" 
     SIZE 4 BY 1.25
     FONT 4.

DEFINE BUTTON btCancel 
     IMAGE-UP FILE "image\im-can":U
     IMAGE-INSENSITIVE FILE "image\im-can":U
     LABEL "Cancel" 
     SIZE 4 BY 1.25
     FONT 4.

DEFINE BUTTON btCopy 
     IMAGE-UP FILE "image\im-copy":U
     IMAGE-INSENSITIVE FILE "image\ii-copy":U
     LABEL "Copy" 
     SIZE 4 BY 1.25
     FONT 4.

DEFINE BUTTON btDelete 
     IMAGE-UP FILE "image\im-era":U
     IMAGE-INSENSITIVE FILE "image\ii-era":U
     LABEL "Delete" 
     SIZE 4 BY 1.25
     FONT 4.

DEFINE BUTTON btExit 
     IMAGE-UP FILE "image\im-exi":U
     IMAGE-INSENSITIVE FILE "image\ii-exi":U
     LABEL "Exit" 
     SIZE 4 BY 1.25
     FONT 4.

DEFINE BUTTON btFirst 
     IMAGE-UP FILE "image\im-fir":U
     IMAGE-INSENSITIVE FILE "image\ii-fir":U
     LABEL "First":L 
     SIZE 4 BY 1.25.

DEFINE BUTTON btGoTo 
     IMAGE-UP FILE "image\im-enter":U
     IMAGE-INSENSITIVE FILE "image\ii-enter":U
     LABEL "Go To" 
     SIZE 4 BY 1.25.

DEFINE BUTTON btHelp 
     IMAGE-UP FILE "image\im-hel":U
     IMAGE-INSENSITIVE FILE "image\ii-hel":U
     LABEL "Help" 
     SIZE 4 BY 1.25
     FONT 4.

DEFINE BUTTON btLast 
     IMAGE-UP FILE "image\im-las":U
     IMAGE-INSENSITIVE FILE "image\ii-las":U
     LABEL "Last":L 
     SIZE 4 BY 1.25.

DEFINE BUTTON btNext 
     IMAGE-UP FILE "image\im-nex":U
     IMAGE-INSENSITIVE FILE "image\ii-nex":U
     LABEL "Next":L 
     SIZE 4 BY 1.25.

DEFINE BUTTON btPrev 
     IMAGE-UP FILE "image\im-pre":U
     IMAGE-INSENSITIVE FILE "image\ii-pre":U
     LABEL "Prev":L 
     SIZE 4 BY 1.25.

DEFINE BUTTON btQueryJoins 
     IMAGE-UP FILE "image\im-joi":U
     IMAGE-INSENSITIVE FILE "image\ii-joi":U
     LABEL "Query Joins" 
     SIZE 4 BY 1.25
     FONT 4.

DEFINE BUTTON btReportsJoins 
     IMAGE-UP FILE "image\im-pri":U
     IMAGE-INSENSITIVE FILE "image\ii-pri":U
     LABEL "Reports Joins" 
     SIZE 4 BY 1.25
     FONT 4.

DEFINE BUTTON btSave 
     IMAGE-UP FILE "image\im-sav":U
     IMAGE-INSENSITIVE FILE "image\ii-sav":U
     LABEL "Save" 
     SIZE 4 BY 1.25
     FONT 4.

DEFINE BUTTON btSearch 
     IMAGE-UP FILE "image\im-sea":U
     IMAGE-INSENSITIVE FILE "image\ii-sea":U
     LABEL "Search" 
     SIZE 4 BY 1.25.

DEFINE BUTTON btUndo 
     IMAGE-UP FILE "image\im-undo":U
     IMAGE-INSENSITIVE FILE "image\ii-undo":U
     LABEL "Undo" 
     SIZE 4 BY 1.25
     FONT 4.

DEFINE BUTTON btUpdate 
     IMAGE-UP FILE "image\im-mod":U
     IMAGE-INSENSITIVE FILE "image\ii-mod":U
     LABEL "Update" 
     SIZE 4 BY 1.25
     FONT 4.

DEFINE VARIABLE fi-nome-usuar AS CHARACTER FORMAT "X(256)":U 
     VIEW-AS FILL-IN 
     SIZE 42 BY .88 NO-UNDO.

DEFINE RECTANGLE rtKeys
     EDGE-PIXELS 2 GRAPHIC-EDGE  NO-FILL   
     SIZE 90 BY 2.25.

DEFINE RECTANGLE rtToolBar
     EDGE-PIXELS 2 GRAPHIC-EDGE    
     SIZE 90 BY 1.5
     BGCOLOR 7 .

DEFINE VARIABLE fi-nome-estab AS CHARACTER FORMAT "X(256)":U 
     VIEW-AS FILL-IN 
     SIZE 42 BY .88 NO-UNDO.

DEFINE RECTANGLE RECT-19
     EDGE-PIXELS 2 GRAPHIC-EDGE  NO-FILL   
     SIZE 12 BY 4.

DEFINE RECTANGLE RECT-21
     EDGE-PIXELS 2 GRAPHIC-EDGE  NO-FILL   
     SIZE 28 BY 6.25.

DEFINE RECTANGLE RECT-22
     EDGE-PIXELS 2 GRAPHIC-EDGE  NO-FILL   
     SIZE 28 BY 2.42.

DEFINE RECTANGLE RECT-23
     EDGE-PIXELS 2 GRAPHIC-EDGE  NO-FILL   
     SIZE 28 BY 2.42.

DEFINE RECTANGLE RECT-24
     EDGE-PIXELS 2 GRAPHIC-EDGE  NO-FILL   
     SIZE 31 BY 3.67.


/* ************************  Frame Definitions  *********************** */

DEFINE FRAME fpage0
     btFirst AT ROW 1.13 COL 1.57 HELP
          "Primeira ocorrˆncia"
     btPrev AT ROW 1.13 COL 5.57 HELP
          "Ocorrˆncia anterior"
     btNext AT ROW 1.13 COL 9.57 HELP
          "Pr¢xima ocorrˆncia"
     btLast AT ROW 1.13 COL 13.57 HELP
          "éltima ocorrˆncia"
     btGoTo AT ROW 1.13 COL 17.57 HELP
          "V  Para"
     btSearch AT ROW 1.13 COL 21.57 HELP
          "Pesquisa"
     btAdd AT ROW 1.13 COL 31 HELP
          "Inclui nova ocorrˆncia"
     btCopy AT ROW 1.13 COL 35 HELP
          "Cria uma c¢pia da ocorrˆncia corrente"
     btUpdate AT ROW 1.13 COL 39 HELP
          "Altera ocorrˆncia corrente"
     btDelete AT ROW 1.13 COL 43 HELP
          "Elimina ocorrˆncia corrente"
     btUndo AT ROW 1.13 COL 47 HELP
          "Desfaz altera‡äes"
     btCancel AT ROW 1.13 COL 51 HELP
          "Cancela altera‡äes"
     btSave AT ROW 1.13 COL 55 HELP
          "Confirma altera‡äes"
     btQueryJoins AT ROW 1.13 COL 74.72 HELP
          "Consultas relacionadas"
     btReportsJoins AT ROW 1.13 COL 78.72 HELP
          "Relat¢rios relacionados"
     btExit AT ROW 1.13 COL 82.72 HELP
          "Sair"
     btHelp AT ROW 1.13 COL 86.72 HELP
          "Ajuda"
     tt-fmsc-usuar-mestre.cod-usuario AT ROW 3.25 COL 21 COLON-ALIGNED WIDGET-ID 4
          VIEW-AS FILL-IN 
          SIZE 16 BY .88
     fi-nome-usuar AT ROW 3.25 COL 37.14 COLON-ALIGNED NO-LABEL WIDGET-ID 6
     rtToolBar AT ROW 1 COL 1
     rtKeys AT ROW 2.67 COL 1
    WITH 1 DOWN NO-BOX KEEP-TAB-ORDER OVERLAY 
         SIDE-LABELS NO-UNDERLINE THREE-D 
         AT COLUMN 1 ROW 1
         SIZE 90 BY 17.46
         FONT 1 WIDGET-ID 100.

DEFINE FRAME fPage5
     tt-fmsc-usuar-mestre.l-producao AT ROW 1.5 COL 8 WIDGET-ID 24
          LABEL "Habilitar Produ‡Æo"
          VIEW-AS TOGGLE-BOX
          SIZE 17 BY .83
     tt-fmsc-usuar-mestre.l-permis-rep-ordem-prod[1] AT ROW 4.17 COL 10 WIDGET-ID 26
          LABEL "PermissÃÆo Reporte Ordem Prod"
          VIEW-AS TOGGLE-BOX
          SIZE 28 BY .83
     tt-fmsc-usuar-mestre.l-permis-est-ordem-prod[1] AT ROW 5.5 COL 10 WIDGET-ID 28
          LABEL "PermissÃÆo Estorno Ordem Prod"
          VIEW-AS TOGGLE-BOX
          SIZE 27 BY .83
     "Op‡äes" VIEW-AS TEXT
          SIZE 7 BY .54 AT ROW 3 COL 10 WIDGET-ID 16
     RECT-24 AT ROW 3.33 COL 8 WIDGET-ID 4
    WITH 1 DOWN KEEP-TAB-ORDER OVERLAY 
         SIDE-LABELS NO-UNDERLINE THREE-D 
         AT COLUMN 3.57 ROW 6.63
         SIZE 84.43 BY 10.88
         FONT 1 WIDGET-ID 500.

DEFINE FRAME fPage4
     tt-fmsc-usuar-mestre.l-credito AT ROW 1.5 COL 8 WIDGET-ID 2
          VIEW-AS TOGGLE-BOX
          SIZE 16 BY .83
     tt-fmsc-usuar-mestre.l-permis-credito[1] AT ROW 4.17 COL 10 WIDGET-ID 6
          LABEL "Avalia‡Æo de Cr‚dito"
          VIEW-AS TOGGLE-BOX
          SIZE 21 BY .83
     "Op‡äes" VIEW-AS TEXT
          SIZE 7 BY .54 AT ROW 3 COL 10 WIDGET-ID 8
     RECT-23 AT ROW 3.33 COL 8 WIDGET-ID 4
    WITH 1 DOWN KEEP-TAB-ORDER OVERLAY 
         SIDE-LABELS NO-UNDERLINE THREE-D 
         AT COLUMN 3.57 ROW 6.63
         SIZE 84.43 BY 10.88
         FONT 1 WIDGET-ID 400.

DEFINE FRAME fPage1
     tt-fmsc-usuar-mestre.cod-estabel-pad AT ROW 1.75 COL 20 COLON-ALIGNED WIDGET-ID 12
          VIEW-AS FILL-IN 
          SIZE 8 BY .88
     fi-nome-estab AT ROW 1.75 COL 28.14 COLON-ALIGNED NO-LABEL WIDGET-ID 14
     tt-fmsc-usuar-mestre.int-2 AT ROW 3.38 COL 22.86 NO-LABEL WIDGET-ID 16
          VIEW-AS RADIO-SET VERTICAL
          RADIO-BUTTONS 
                    "Estoque", 1,
"Compras", 2,
"Cr‚dito", 3,
"Produ‡Æo", 4
          SIZE 10.29 BY 3.5
     "Aba Principal:" VIEW-AS TEXT
          SIZE 9.43 BY .58 AT ROW 3.08 COL 7.43 WIDGET-ID 20
     "Aba Principal:" VIEW-AS TEXT
          SIZE 9.43 BY .58 AT ROW 3.08 COL 7.43 WIDGET-ID 26
     "Aba Principal no APP:" VIEW-AS TEXT
          SIZE 15 BY .58 AT ROW 3.13 COL 6.86 WIDGET-ID 40
     RECT-19 AT ROW 3.17 COL 22 WIDGET-ID 36
    WITH 1 DOWN KEEP-TAB-ORDER OVERLAY 
         SIDE-LABELS NO-UNDERLINE THREE-D 
         AT COLUMN 3.57 ROW 6.63
         SIZE 84.43 BY 10.88
         FONT 1 WIDGET-ID 100.

DEFINE FRAME fPage2
     tt-fmsc-usuar-mestre.l-estoque AT ROW 1.5 COL 8 WIDGET-ID 2
          VIEW-AS TOGGLE-BOX
          SIZE 16 BY .83
     tt-fmsc-usuar-mestre.l-permis-estoq[1] AT ROW 3.83 COL 10 WIDGET-ID 6
          LABEL "Requisi‡Æo Atendimento"
          VIEW-AS TOGGLE-BOX
          SIZE 21 BY .83
     tt-fmsc-usuar-mestre.l-permis-estoq[2] AT ROW 4.83 COL 10 WIDGET-ID 8
          LABEL "Requisi‡Æo Devolu‡Æo"
          VIEW-AS TOGGLE-BOX
          SIZE 21 BY .83
     tt-fmsc-usuar-mestre.l-permis-estoq[3] AT ROW 5.83 COL 10 WIDGET-ID 10
          LABEL "Transferˆncia Material"
          VIEW-AS TOGGLE-BOX
          SIZE 21 BY .83
     tt-fmsc-usuar-mestre.l-permis-estoq[4] AT ROW 6.83 COL 10 WIDGET-ID 12
          LABEL "Invent rio"
          VIEW-AS TOGGLE-BOX
          SIZE 21 BY .83
     tt-fmsc-usuar-mestre.l-permis-estoq[5] AT ROW 7.83 COL 10 WIDGET-ID 14
          LABEL "Recebimento F¡sico"
          VIEW-AS TOGGLE-BOX
          SIZE 19 BY .83
     "Op‡äes" VIEW-AS TEXT
          SIZE 8 BY .54 AT ROW 2.75 COL 9 WIDGET-ID 16
     RECT-21 AT ROW 3 COL 8 WIDGET-ID 4
    WITH 1 DOWN KEEP-TAB-ORDER OVERLAY 
         SIDE-LABELS NO-UNDERLINE THREE-D 
         AT COLUMN 3.57 ROW 6.63
         SIZE 84.43 BY 10.88
         FONT 1 WIDGET-ID 200.

DEFINE FRAME fPage3
     tt-fmsc-usuar-mestre.l-compras AT ROW 1.5 COL 8 WIDGET-ID 2
          VIEW-AS TOGGLE-BOX
          SIZE 16 BY .83
     tt-fmsc-usuar-mestre.l-permis-compras[1] AT ROW 4.17 COL 10 WIDGET-ID 6
          LABEL "Aprova‡Æo MLA"
          VIEW-AS TOGGLE-BOX
          SIZE 21 BY .83
     "Op‡äes" VIEW-AS TEXT
          SIZE 7 BY .54 AT ROW 3 COL 10 WIDGET-ID 16
     RECT-22 AT ROW 3.33 COL 8 WIDGET-ID 4
    WITH 1 DOWN KEEP-TAB-ORDER OVERLAY 
         SIDE-LABELS NO-UNDERLINE THREE-D 
         AT COLUMN 3.57 ROW 6.63
         SIZE 84.43 BY 10.88
         FONT 1 WIDGET-ID 300.


/* *********************** Procedure Settings ************************ */

&ANALYZE-SUSPEND _PROCEDURE-SETTINGS
/* Settings for THIS-PROCEDURE
   Type: Maintenance
   Allow: Basic,Browse,DB-Fields,Window,Query
   Add Fields to: Neither
   Other Settings: COMPILE
   Temp-Tables and Buffers:
      TABLE: tt-fmsc-usuar-mestre T "?" NO-UNDO mgespec fmsc-usuar-mestre
      ADDITIONAL-FIELDS:
          field r-rowid as rowid
      END-FIELDS.
   END-TABLES.
 */
&ANALYZE-RESUME _END-PROCEDURE-SETTINGS

/* *************************  Create Window  ************************** */

&ANALYZE-SUSPEND _CREATE-WINDOW
IF SESSION:DISPLAY-TYPE = "GUI":U THEN
  CREATE WINDOW wMaintenance ASSIGN
         HIDDEN             = YES
         TITLE              = ""
         HEIGHT             = 17.46
         WIDTH              = 90
         MAX-HEIGHT         = 17.46
         MAX-WIDTH          = 90
         VIRTUAL-HEIGHT     = 17.46
         VIRTUAL-WIDTH      = 90
         RESIZE             = yes
         SCROLL-BARS        = no
         STATUS-AREA        = yes
         BGCOLOR            = ?
         FGCOLOR            = ?
         KEEP-FRAME-Z-ORDER = yes
         THREE-D            = yes
         MESSAGE-AREA       = no
         SENSITIVE          = yes.
ELSE {&WINDOW-NAME} = CURRENT-WINDOW.

ASSIGN {&WINDOW-NAME}:MENUBAR    = MENU mbMain:HANDLE.
/* END WINDOW DEFINITION                                                */
&ANALYZE-RESUME

&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CUSTOM _INCLUDED-LIB wMaintenance 
/* ************************* Included-Libraries *********************** */

{maintenance/maintenance.i}

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME




/* ***********  Runtime Attributes and AppBuilder Settings  *********** */

&ANALYZE-SUSPEND _RUN-TIME-ATTRIBUTES
/* SETTINGS FOR WINDOW wMaintenance
  NOT-VISIBLE,,RUN-PERSISTENT                                           */
/* REPARENT FRAME */
ASSIGN FRAME fPage1:FRAME = FRAME fpage0:HANDLE
       FRAME fPage2:FRAME = FRAME fpage0:HANDLE
       FRAME fPage3:FRAME = FRAME fpage0:HANDLE
       FRAME fPage4:FRAME = FRAME fpage0:HANDLE
       FRAME fPage5:FRAME = FRAME fpage0:HANDLE.

/* SETTINGS FOR FRAME fpage0
   FRAME-NAME                                                           */
/* SETTINGS FOR FRAME fPage1
                                                                        */
/* SETTINGS FOR FRAME fPage2
                                                                        */
/* SETTINGS FOR TOGGLE-BOX tt-fmsc-usuar-mestre.l-permis-estoq[1] IN FRAME fPage2
   EXP-LABEL                                                            */
/* SETTINGS FOR TOGGLE-BOX tt-fmsc-usuar-mestre.l-permis-estoq[2] IN FRAME fPage2
   EXP-LABEL                                                            */
/* SETTINGS FOR TOGGLE-BOX tt-fmsc-usuar-mestre.l-permis-estoq[3] IN FRAME fPage2
   EXP-LABEL                                                            */
/* SETTINGS FOR TOGGLE-BOX tt-fmsc-usuar-mestre.l-permis-estoq[4] IN FRAME fPage2
   EXP-LABEL                                                            */
/* SETTINGS FOR TOGGLE-BOX tt-fmsc-usuar-mestre.l-permis-estoq[5] IN FRAME fPage2
   EXP-LABEL                                                            */
/* SETTINGS FOR FRAME fPage3
                                                                        */
/* SETTINGS FOR TOGGLE-BOX tt-fmsc-usuar-mestre.l-permis-compras[1] IN FRAME fPage3
   EXP-LABEL                                                            */
/* SETTINGS FOR FRAME fPage4
                                                                        */
/* SETTINGS FOR TOGGLE-BOX tt-fmsc-usuar-mestre.l-permis-credito[1] IN FRAME fPage4
   EXP-LABEL                                                            */
/* SETTINGS FOR FRAME fPage5
                                                                        */
/* SETTINGS FOR TOGGLE-BOX tt-fmsc-usuar-mestre.l-permis-est-ordem-prod[1] IN FRAME fPage5
   EXP-LABEL                                                            */
/* SETTINGS FOR TOGGLE-BOX tt-fmsc-usuar-mestre.l-permis-rep-ordem-prod[1] IN FRAME fPage5
   EXP-LABEL                                                            */
/* SETTINGS FOR TOGGLE-BOX tt-fmsc-usuar-mestre.l-producao IN FRAME fPage5
   EXP-LABEL                                                            */
IF SESSION:DISPLAY-TYPE = "GUI":U AND VALID-HANDLE(wMaintenance)
THEN wMaintenance:HIDDEN = yes.

/* _RUN-TIME-ATTRIBUTES-END */
&ANALYZE-RESUME


/* Setting information for Queries and Browse Widgets fields            */

&ANALYZE-SUSPEND _QUERY-BLOCK FRAME fpage0
/* Query rebuild information for FRAME fpage0
     _Options          = "SHARE-LOCK KEEP-EMPTY"
     _Query            is NOT OPENED
*/  /* FRAME fpage0 */
&ANALYZE-RESUME

&ANALYZE-SUSPEND _QUERY-BLOCK FRAME fPage1
/* Query rebuild information for FRAME fPage1
     _Options          = "SHARE-LOCK KEEP-EMPTY"
     _Query            is NOT OPENED
*/  /* FRAME fPage1 */
&ANALYZE-RESUME

 



/* ************************  Control Triggers  ************************ */

&Scoped-define SELF-NAME wMaintenance
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL wMaintenance wMaintenance
ON END-ERROR OF wMaintenance
OR ENDKEY OF {&WINDOW-NAME} ANYWHERE DO:
  /* This case occurs when the user presses the "Esc" key.
     In a persistently run window, just ignore this.  If we did not, the
     application would exit. */
  IF THIS-PROCEDURE:PERSISTENT THEN RETURN NO-APPLY.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL wMaintenance wMaintenance
ON WINDOW-CLOSE OF wMaintenance
DO:
  /* This event will close the window and terminate the procedure.  */
  APPLY "CLOSE":U TO THIS-PROCEDURE.
  RETURN NO-APPLY.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btAdd
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btAdd wMaintenance
ON CHOOSE OF btAdd IN FRAME fpage0 /* Add */
OR CHOOSE OF MENU-ITEM miAdd in MENU mbMain DO:
    RUN addRecord IN THIS-PROCEDURE.    
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btCancel
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btCancel wMaintenance
ON CHOOSE OF btCancel IN FRAME fpage0 /* Cancel */
OR CHOOSE OF MENU-ITEM miCancel IN MENU mbMain DO:
    RUN cancelRecord IN THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btCopy
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btCopy wMaintenance
ON CHOOSE OF btCopy IN FRAME fpage0 /* Copy */
OR CHOOSE OF MENU-ITEM miCopy IN MENU mbMain DO:
    RUN copyRecord IN THIS-PROCEDURE. 
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btDelete
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btDelete wMaintenance
ON CHOOSE OF btDelete IN FRAME fpage0 /* Delete */
OR CHOOSE OF MENU-ITEM miDelete IN MENU mbMain DO:     
    RUN deleteRecord IN THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btExit
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btExit wMaintenance
ON CHOOSE OF btExit IN FRAME fpage0 /* Exit */
OR CHOOSE OF MENU-ITEM miExit IN MENU mbMain DO:
    APPLY "CLOSE":U TO THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btFirst
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btFirst wMaintenance
ON CHOOSE OF btFirst IN FRAME fpage0 /* First */
OR CHOOSE OF MENU-ITEM miFirst IN MENU mbMain DO:
    RUN getFirst IN THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btGoTo
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btGoTo wMaintenance
ON CHOOSE OF btGoTo IN FRAME fpage0 /* Go To */
OR CHOOSE OF MENU-ITEM miGoTo IN MENU mbMain DO:
    RUN goToRecord IN THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btHelp
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btHelp wMaintenance
ON CHOOSE OF btHelp IN FRAME fpage0 /* Help */
OR CHOOSE OF MENU-ITEM miContents IN MENU mbMain DO:
    {include/ajuda.i}
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btLast
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btLast wMaintenance
ON CHOOSE OF btLast IN FRAME fpage0 /* Last */
OR CHOOSE OF MENU-ITEM miLast IN MENU mbMain DO:
    RUN getLast IN THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btNext
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btNext wMaintenance
ON CHOOSE OF btNext IN FRAME fpage0 /* Next */
OR CHOOSE OF MENU-ITEM miNext IN MENU mbMain DO:
    RUN getNext IN THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btPrev
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btPrev wMaintenance
ON CHOOSE OF btPrev IN FRAME fpage0 /* Prev */
OR CHOOSE OF MENU-ITEM miPrev IN MENU mbMain DO:
    RUN getPrev IN THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btQueryJoins
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btQueryJoins wMaintenance
ON CHOOSE OF btQueryJoins IN FRAME fpage0 /* Query Joins */
OR CHOOSE OF MENU-ITEM miQueryJoins IN MENU mbMain DO:
    RUN showQueryJoins IN THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btReportsJoins
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btReportsJoins wMaintenance
ON CHOOSE OF btReportsJoins IN FRAME fpage0 /* Reports Joins */
OR CHOOSE OF MENU-ITEM miReportsJoins IN MENU mbMain DO:
    RUN showReportsJoins IN THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btSave
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btSave wMaintenance
ON CHOOSE OF btSave IN FRAME fpage0 /* Save */
OR CHOOSE OF MENU-ITEM miSave IN MENU mbMain DO:
    RUN saveRecord IN THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btSearch
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btSearch wMaintenance
ON CHOOSE OF btSearch IN FRAME fpage0 /* Search */
OR CHOOSE OF MENU-ITEM miSearch IN MENU mbMain DO:
    {method/zoomreposition.i &ProgramZoom="fmczo/FMSZO0101.w"} 
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btUndo
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btUndo wMaintenance
ON CHOOSE OF btUndo IN FRAME fpage0 /* Undo */
OR CHOOSE OF MENU-ITEM miUndo IN MENU mbMain DO:
    RUN undoRecord IN THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME btUpdate
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL btUpdate wMaintenance
ON CHOOSE OF btUpdate IN FRAME fpage0 /* Update */
OR CHOOSE OF MENU-ITEM miUpdate IN MENU mbMain DO:
    RUN updateRecord IN THIS-PROCEDURE.
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define FRAME-NAME fPage1
&Scoped-define SELF-NAME tt-fmsc-usuar-mestre.cod-estabel-pad
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL tt-fmsc-usuar-mestre.cod-estabel-pad wMaintenance
ON LEAVE OF tt-fmsc-usuar-mestre.cod-estabel-pad IN FRAME fPage1 /* Estabel Pad */
DO:
    ASSIGN fi-nome-estab:SCREEN-VALUE IN FRAME fpage1 = ''.
    FIND FIRST estabelec NO-LOCK
        WHERE estabelec.cod-estabel = tt-fmsc-usuar-mestre.cod-estabel-pad:INPUT-VALUE IN FRAME fpage1 NO-ERROR.
    IF AVAIL estabelec THEN DO:
        ASSIGN fi-nome-estab:SCREEN-VALUE IN FRAME fpage1 = estabelec.nome.
    END.
    RETURN "OK".  
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL tt-fmsc-usuar-mestre.cod-estabel-pad wMaintenance
ON MOUSE-SELECT-DBLCLICK OF tt-fmsc-usuar-mestre.cod-estabel-pad IN FRAME fPage1 /* Estabel Pad */
DO:
    {include/zoomvar.i &prog-zoom="adzoom/z01ad107.w"
                       &campo="tt-fmsc-usuar-mestre.cod-estabel-pad"
                       &campo2="fi-nome-estab"
                       &campozoom="cod-estabel"
                       &campozoom2="nome"
                       &frame="fPage1"}  
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define FRAME-NAME fpage0
&Scoped-define SELF-NAME tt-fmsc-usuar-mestre.cod-usuario
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL tt-fmsc-usuar-mestre.cod-usuario wMaintenance
ON LEAVE OF tt-fmsc-usuar-mestre.cod-usuario IN FRAME fpage0 /* Usu rio */
DO:
    ASSIGN fi-nome-usuar:SCREEN-VALUE IN FRAME fpage0 = ''.
    FIND FIRST usuar_mestre NO-LOCK
        WHERE usuar_mestre.cod_usuario = tt-fmsc-usuar-mestre.cod-usuario:INPUT-VALUE IN FRAME fpage0 NO-ERROR.
    IF AVAIL usuar_mestre THEN DO:
        ASSIGN fi-nome-usuar:SCREEN-VALUE IN FRAME fpage0 = usuar_mestre.nom_usuario.
    END.
    RETURN "OK".
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL tt-fmsc-usuar-mestre.cod-usuario wMaintenance
ON MOUSE-SELECT-DBLCLICK OF tt-fmsc-usuar-mestre.cod-usuario IN FRAME fpage0 /* Usu rio */
DO:
  
    {include/zoomvar.i &prog-zoom="fnzoom/z01fn017.w"
                       &campo="tt-fmsc-usuar-mestre.cod-usuario"
                       &campo2="fi-nome-usuar"
                       &campozoom="cod_usuario"
                       &campozoom2="nom_usuario"
                       &frame="fPage0"}    
  
  
  
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&Scoped-define SELF-NAME miAbout
&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CONTROL miAbout wMaintenance
ON CHOOSE OF MENU-ITEM miAbout /* Sobre... */
DO:
  {include/sobre.i}
END.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


&UNDEFINE SELF-NAME

&ANALYZE-SUSPEND _UIB-CODE-BLOCK _CUSTOM _MAIN-BLOCK wMaintenance 


/*:T--- L¢gica para inicializa‡Æo do programam ---*/
tt-fmsc-usuar-mestre.cod-usuario:LOAD-MOUSE-P('image/lupa.cur').
tt-fmsc-usuar-mestre.cod-estabel-pad:LOAD-MOUSE-P('image/lupa.cur').
{maintenance/mainblock.i}

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME


/* **********************  Internal Procedures  *********************** */

&ANALYZE-SUSPEND _UIB-CODE-BLOCK _PROCEDURE afterDisplayFields wMaintenance 
PROCEDURE afterDisplayFields :
/*------------------------------------------------------------------------------
  Purpose:     
  Parameters:  <none>
  Notes:       
------------------------------------------------------------------------------*/
        
    APPLY 'leave' TO tt-fmsc-usuar-mestre.cod-usuario       IN FRAME fpage0.    
    APPLY 'leave' TO tt-fmsc-usuar-mestre.cod-estabel-pad   IN FRAME fpage1.    

    RETURN "OK".

END PROCEDURE.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME

&ANALYZE-SUSPEND _UIB-CODE-BLOCK _PROCEDURE beforeSaveFields wMaintenance 
PROCEDURE beforeSaveFields :
/*------------------------------------------------------------------------------
  Purpose:     
  Parameters:  <none>
  Notes:       
------------------------------------------------------------------------------*/
    IF tt-fmsc-usuar-mestre.l-estoque:INPUT-VALUE IN FRAME fpage2 THEN DO:        
        IF  tt-fmsc-usuar-mestre.l-permis-estoq[1]:INPUT-VALUE IN FRAME fpage2 = NO AND
            tt-fmsc-usuar-mestre.l-permis-estoq[2]:INPUT-VALUE IN FRAME fpage2 = NO AND
            tt-fmsc-usuar-mestre.l-permis-estoq[3]:INPUT-VALUE IN FRAME fpage2 = NO AND
            tt-fmsc-usuar-mestre.l-permis-estoq[4]:INPUT-VALUE IN FRAME fpage2 = NO AND
            tt-fmsc-usuar-mestre.l-permis-estoq[5]:INPUT-VALUE IN FRAME fpage2 = NO THEN DO:
            
            RUN utp/ut-msgs.p (INPUT "show",
                               INPUT 17006,
                               INPUT "M¢dulo de estoque deve ter ao menos uma op‡Æo!~~Selecione uma das op‡äes para ser apresentada no APP na aba 'Estoque'!").
                
            RETURN "NOK".            
        END.        
    END.
    IF tt-fmsc-usuar-mestre.l-compras:INPUT-VALUE IN FRAME fpage3 THEN DO:        
        IF  tt-fmsc-usuar-mestre.l-permis-compras[1]:INPUT-VALUE IN FRAME fpage3 = NO THEN DO:
            
            RUN utp/ut-msgs.p (INPUT "show",
                               INPUT 17006,
                               INPUT "M¢dulo de compras deve ter ao menos uma op‡Æo!~~Selecione uma das op‡äes para ser apresentada no APP na aba 'Compras'!").
                
            RETURN "NOK".            
        END.        
    END.   
    IF tt-fmsc-usuar-mestre.l-credito:INPUT-VALUE IN FRAME fpage4 THEN DO:        
        IF  tt-fmsc-usuar-mestre.l-permis-credito[1]:INPUT-VALUE IN FRAME fpage4 = NO THEN DO:
            
            RUN utp/ut-msgs.p (INPUT "show",
                               INPUT 17006,
                               INPUT "M¢dulo de cr‚dito deve ter ao menos uma op‡Æo!~~Selecione uma das op‡äes para ser apresentada no APP na aba 'Cr‚dito'!").
                
            RETURN "NOK".            
        END.        
    END.    
    IF tt-fmsc-usuar-mestre.l-producao:INPUT-VALUE IN FRAME fpage5 THEN DO:        
        IF  tt-fmsc-usuar-mestre.l-permis-rep-ordem-prod[1]:INPUT-VALUE IN FRAME fpage5 = NO AND
            tt-fmsc-usuar-mestre.l-permis-est-ordem-prod[1]:INPUT-VALUE IN FRAME fpage5 = NO THEN DO:
            
            RUN utp/ut-msgs.p (INPUT "show",
                               INPUT 17006,
                               INPUT "M¢dulo de produ‡Æo deve ter ao menos uma op‡Æo!~~Selecione uma das op‡äes para ser apresentada no APP na aba 'Produ‡Æo'!").
                
            RETURN "NOK".            
        END.        
    END.     
       

    RETURN "OK".
    
END PROCEDURE.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME

&ANALYZE-SUSPEND _UIB-CODE-BLOCK _PROCEDURE goToRecord wMaintenance 
PROCEDURE goToRecord :
/*:T------------------------------------------------------------------------------
  Purpose:     Exibe dialog de V  Para
  Parameters:  
  Notes:       
------------------------------------------------------------------------------*/
    DEFINE BUTTON btGoToCancel AUTO-END-KEY 
         LABEL "&Cancelar" 
         SIZE 10 BY 1
         BGCOLOR 8.
    
    DEFINE BUTTON btGoToOK AUTO-GO 
         LABEL "&OK" 
         SIZE 10 BY 1
         BGCOLOR 8.
    
    DEFINE RECTANGLE rtGoToButton
         EDGE-PIXELS 2 GRAPHIC-EDGE  
         SIZE 58 BY 1.42
         BGCOLOR 7.
    
    DEFINE VARIABLE rGoTo AS ROWID NO-UNDO.
    
    DEFINE VARIABLE c-cod-usuario LIKE {&ttTable}.cod-usuario 
     VIEW-AS FILL-IN 
     SIZE 14 BY .88 NO-UNDO.
    
    DEFINE FRAME fGoToRecord
        c-cod-usuario     AT ROW 1.21 COL 17.72  COLON-ALIGNED 
        btGoToOK          AT ROW 3.63 COL 2.14
        btGoToCancel      AT ROW 3.63 COL 13
        rtGoToButton      AT ROW 3.38 COL 1
        SPACE(0.28)
        WITH VIEW-AS DIALOG-BOX KEEP-TAB-ORDER SIDE-LABELS NO-UNDERLINE 
             THREE-D SCROLLABLE TITLE "V  Para Usu rio" FONT 1
             DEFAULT-BUTTON btGoToOK CANCEL-BUTTON btGoToCancel.
    
/*tech1139 - FO 1338.917 - 10/07/2006  */
    RUN utp/ut-trfrrp.p (input Frame fGoToRecord:Handle).
    {utp/ut-liter.i "V _Para_Usu rio"}
    ASSIGN FRAME fGoToRecord:TITLE = RETURN-VALUE.
/*tech1139 - FO 1338.917 - 10/07/2006  */

    ON "CHOOSE":U OF btGoToOK IN FRAME fGoToRecord DO:
        ASSIGN c-cod-usuario .
        
        RUN goToKey IN {&hDBOTable} (INPUT c-cod-usuario  ).
        IF RETURN-VALUE = "NOK":U THEN DO:
            RUN utp/ut-msgs.p (INPUT "SHOW":U, INPUT 2, INPUT "tt-fmsc-usuar-mestre":U).
            
            RETURN NO-APPLY.
        END.
        
        /*:T Retorna rowid do registro corrente do DBO */
        RUN getRowid IN {&hDBOTable} (OUTPUT rGoTo).
        
        /*:T Reposiciona registro com base em um rowid */
        RUN repositionRecord IN THIS-PROCEDURE (INPUT rGoTo).

        APPLY "GO":U TO FRAME fGoToRecord.
    END.
            
    ENABLE c-cod-usuario btGoToOK btGoToCancel 
        WITH FRAME fGoToRecord. 
    
    WAIT-FOR "GO":U OF FRAME fGoToRecord.
    
END PROCEDURE.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME

&ANALYZE-SUSPEND _UIB-CODE-BLOCK _PROCEDURE initializeDBOs wMaintenance 
PROCEDURE initializeDBOs :
/*:T------------------------------------------------------------------------------
  Purpose:     Inicializa DBOs
  Parameters:  
  Notes:       
------------------------------------------------------------------------------*/
    
    /*:T--- Verifica se o DBO j  est  inicializado ---*/
    IF NOT VALID-HANDLE({&hDBOTable}) OR
       {&hDBOTable}:TYPE <> "PROCEDURE":U OR
       {&hDBOTable}:FILE-NAME <> "fmcbo/FMSBO0101.p":U THEN DO:
        {btb/btb008za.i1 fmcbo/FMSBO0101.p YES}
        {btb/btb008za.i2 fmcbo/FMSBO0101.p '' {&hDBOTable}}
    END.
    
    RUN openQueryStatic IN {&hDBOTable} (INPUT "Main":U) NO-ERROR.
    
    RETURN "OK":U.
END PROCEDURE.

/* _UIB-CODE-BLOCK-END */
&ANALYZE-RESUME

