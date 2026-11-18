{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find POST /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcParamUsuario MCE}
&ENDIF

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER.

    // Criacao do Retorno 
    DEFINE VAR oJsonArray           AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput          AS JsonObject NO-UNDO.

    DEFINE VAR c-ep-codigo          AS CHAR       NO-UNDO.
    DEFINE VAR c-Usuario            AS CHAR       NO-UNDO.
    DEFINE VAR c-Orig               AS CHAR       NO-UNDO.
    DEFINE VAR c-Valor              AS CHAR       NO-UNDO.
    
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

        ASSIGN c-ep-codigo = jsonInput:GetCharacter("codEmpresa") NO-ERROR.
        IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
            ASSIGN c-ep-codigo = jsonInput:GetCharacter("epCodigo") NO-ERROR.

        DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
            //-- Cabecalho
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).
    
            ASSIGN c-Usuario = oJsonPayloadObject:GetCharacter("usuario")
                   c-Orig    = oJsonPayloadObject:GetCharacter("origem")
                   c-Valor   = oJsonPayloadObject:GetCharacter("valor").
                   
            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN DO:
                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.
                IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
                    ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.
            END.
        END.

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().
              
        FOR FIRST usuar_mestre
            WHERE usuar_mestre.cod_usuario = c-Usuario EXCLUSIVE-LOCK:
        END.
        IF AVAIL usuar_mestre THEN DO:
            IF c-Orig = '1' THEN DO:
                ASSIGN OVERLAY(usuar_mestre.cod_livre_2,50,5) = Trim(c-Valor) .
            END.            
        END.

        /* Atualiza tamb‚m na tabela fmsc-usuar-mestre com ep-codigo */
        FOR FIRST fmsc-usuar-mestre
            WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-usuar-mestre.ep-codigo = c-ep-codigo ELSE TRUE)
              AND fmsc-usuar-mestre.cod-usuario = c-Usuario EXCLUSIVE-LOCK:
        END.
        IF AVAIL fmsc-usuar-mestre THEN DO:
            IF c-Orig = '1' THEN
                ASSIGN fmsc-usuar-mestre.cod-estabel-pad = Trim(c-Valor).
        END.

        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   'OK').
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'OK').
        jsonOutput:ADD('type',              'OK').
        jsonOutput:ADD('codEmpresa',        c-ep-codigo).
    END.

    RETURN 'OK':U.

END PROCEDURE.