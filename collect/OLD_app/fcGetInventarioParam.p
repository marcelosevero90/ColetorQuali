{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetInventarioParam MCE}
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
    DEFINE VAR dt-Invent            AS DATE       NO-UNDO.

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

        ASSIGN dt-Invent   = ?.
        ASSIGN c-ep-codigo = jsonInput:GetCharacter("codEmpresa") NO-ERROR.
        IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
            ASSIGN c-ep-codigo = jsonInput:GetCharacter("epCodigo") NO-ERROR.
        
        DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
            //-- Cabecalho
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).
    
            ASSIGN dt-Invent = oJsonPayloadObject:GetDate("dtSaldo") NO-ERROR.
            
            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN DO:
                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.
                IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
                    ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.
            END.
        END.
        
        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().        

        IF dt-Invent <> ? THEN DO:
            FOR FIRST fmsc-inventario NO-LOCK
                WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE)
                  AND fmsc-inventario.dt-saldo = dt-Invent:

                oJsonOutput = NEW JsonObject().
                oJsonOutput:ADD("codEmpresa",       fmsc-inventario.ep-codigo).
                oJsonOutput:ADD("dtSaldo",          fmsc-inventario.dt-saldo).
                oJsonOutput:ADD("indSitInv",        fmsc-inventario.ind-sit-inv).
                oJsonOutput:ADD("permContgUsFc",    fmsc-inventario.perm-contg-usuar-ficha).
                oJsonOutput:ADD("indTipoInv",       fmsc-inventario.ind-tipo-inv).
                oJsonOutput:ADD("nrContagAtiva",    (IF fmsc-inventario.nr-contag-ativa > 0 THEN fmsc-inventario.nr-contag-ativa ELSE 1)).
                
                oJsonArray :ADD(oJsonOutput).
            END.
        END.
        ELSE DO:
            FOR EACH fmsc-inventario NO-LOCK
                WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE):

                oJsonOutput = NEW JsonObject().
                oJsonOutput:ADD("codEmpresa",       fmsc-inventario.ep-codigo).
                oJsonOutput:ADD("dtSaldo",          fmsc-inventario.dt-saldo).
                oJsonOutput:ADD("indSitInv",        fmsc-inventario.ind-sit-inv).
                oJsonOutput:ADD("permContgUsFc",    fmsc-inventario.perm-contg-usuar-ficha).
                oJsonOutput:ADD("indTipoInv",       fmsc-inventario.ind-tipo-inv).
                
                oJsonArray :ADD(oJsonOutput).
            END.
        END.

        jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE). 

    END.

    RETURN 'OK':U.

END PROCEDURE.