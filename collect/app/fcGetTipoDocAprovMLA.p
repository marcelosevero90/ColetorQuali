{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetTipoDocAprovMLA MLA}
&ENDIF

{include/i-freeac.i}


PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER.

    // Criacao do Retorno 
    DEFINE VAR oJsonArray   AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput  AS JsonObject NO-UNDO.
         
    DEFINE VAR cCodEstabel AS CHAR NO-UNDO.         
    DEFINE VAR cCodEmpresa AS CHAR NO-UNDO.
    
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
            
            ASSIGN cCodEstabel   = oJsonPayloadObject:GetCharacter("codEstabel")
                   cCodEmpresa   = oJsonPayloadObject:GetCharacter("codEmpresa").
        END.        

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().

        FOR EACH mla-tipo-doc-aprov NO-LOCK
            WHERE mla-tipo-doc-aprov.cod-estabel    = cCodEstabel
              AND mla-tipo-doc-aprov.ep-codigo      = cCodEmpresa
              AND mla-tipo-doc-aprov.apr-tip-doc .

            oJsonOutput = NEW JsonObject().
            oJsonOutput:ADD("codTipDoc",    mla-tipo-doc-aprov.cod-tip-doc    ).
            oJsonOutput:ADD("desTipDoc",    fn-free-accent(string(mla-tipo-doc-aprov.cod-tip-doc) + '-' + mla-tipo-doc-aprov.des-tip-doc )).
            
            oJsonArray :ADD(oJsonOutput).
        END.
        jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE). 

    END.

    RETURN 'OK':U.

END PROCEDURE.


