{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcParamUsuario MCE}
&ENDIF

DEFINE TEMP-TABLE ttUsuarParam NO-UNDO
    FIELD codUsuario        AS CHARACTER
    FIELD codEstabPad       AS CHARACTER
    FIELD TpAgrupTransf     AS INT
    /*FIELD TpAgrupAtRequis   AS INT
    FIELD TpAgrupDvRequis   AS INT
    FIELD TpAgrupInvent     AS INT*/ .


PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER.

    // Criacao do Retorno 
    DEFINE VAR oJsonArray           AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput          AS JsonObject NO-UNDO.

    DEFINE VAR c-EstabPad           AS CHAR       NO-UNDO.
    DEFINE VAR c-Usuario            AS CHAR       NO-UNDO.
    DEFINE VAR iTpAgrupTransf       AS INT        NO-UNDO.

    
    bloco:
    DO ON ERROR UNDO, RETURN 'NOK'
       ON STOP  UNDO, RETURN 'NOK'.

        aJsonPayloadArray = NEW JsonArray().
        aJsonPayloadArray = jsonInput:getJSONArray("payload") NO-ERROR.

        IF aJsonPayloadArray:LENGTH = 0 THEN DO:
             oJsonPayloadObject = CAST(jsonInput:getJSONObject("payload"), "JSONObject") NO-ERROR. 
             aJsonPayloadArray:ADD(oJsonPayloadObject). 
        END.
        IF NOT TYPE-OF(aJsonPayloadArray, JsonArray) THEN DO:
            RUN setErrorResponse('Parƒmetro NÆo ‚ Array', OUTPUT jsonOutput).
            RETURN 'NOK'. 
        END.

        DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
            //-- Cabecalho
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).
    
            ASSIGN c-Usuario = oJsonPayloadObject:GetCharacter("usuario").
        END.


        EMPTY TEMP-TABLE ttUsuarParam.

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().

        
        ASSIGN c-EstabPad = "".

        FOR FIRST usuar_mestre
            WHERE usuar_mestre.cod_usuario = c-Usuario NO-LOCK:
        END.
        IF AVAIL usuar_mestre THEN DO:

            ASSIGN iTpAgrupTransf = int(substring(usuar_mestre.cod_livre_2,56,1)) NO-ERROR.
            IF iTpAgrupTransf = ? OR iTpAgrupTransf = 0 THEN
                ASSIGN iTpAgrupTransf = 1.

            ASSIGN c-EstabPad       = substring(usuar_mestre.cod_livre_2,50,5).
            FOR FIRST usuar-mater NO-LOCK
                WHERE usuar-mater.cod-usuar = c-Usuario.
                ASSIGN c-EstabPad = substring(usuar-mater.char-1,16,3).
            END.
            IF NOT AVAIL usuar-mater OR c-EstabPad = '' THEN DO:
                FOR FIRST param-estoq FIELDS(estabel-pad) NO-LOCK.
                    ASSIGN c-EstabPad = param-estoq.estabel-pad.
                END.
            END.

            oJsonOutput = NEW JsonObject().
            oJsonOutput:ADD("codUsuario",       usuar_mestre.cod_usuario          ).
            oJsonOutput:ADD("codEstabPad",      trim(c-EstabPad)         ).
            oJsonOutput:ADD("TpAgrupTransf",    iTpAgrupTransf     ).

            /*
            iTpAgrupAtRequis  
            iTpAgrupDvRequis  
            iTpAgrupInvent    
            */
            
            oJsonArray :ADD(oJsonOutput).
        END.
        

        jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE). 

    END.

    RETURN 'OK':U.

END PROCEDURE.



