{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcParamUsuario MCE}
&ENDIF

DEFINE TEMP-TABLE ttUsuarParam NO-UNDO
    FIELD epCodigo          AS CHARACTER
    FIELD codUsuario        AS CHARACTER
    FIELD codEstabPad       AS CHARACTER
    FIELD TpAgrupTransf     AS INT.

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER.

    // Criacao do Retorno 
    DEFINE VAR oJsonArray           AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput          AS JsonObject NO-UNDO.
    DEFINE VAR oJsonEmpresas        AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonEmpresa         AS JsonObject NO-UNDO.

    DEFINE VAR c-ep-codigo          AS CHAR       NO-UNDO.
    DEFINE VAR c-EstabPad           AS CHAR       NO-UNDO.
    DEFINE VAR c-Usuario            AS CHAR       NO-UNDO.
    DEFINE VAR iTpAgrupTransf       AS INT        NO-UNDO.
    DEFINE VAR iTabPrincipal        AS INT        NO-UNDO.

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
    
            ASSIGN c-Usuario = oJsonPayloadObject:GetCharacter("usuario").
            
            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN DO:
                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.
                IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
                    ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.
            END.
        END.

        EMPTY TEMP-TABLE ttUsuarParam.

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().

        IF c-Usuario = "" OR c-Usuario = ? THEN
            ASSIGN c-Usuario = jsonInput:GetCharacter("usuario") NO-ERROR.

        ASSIGN oJsonEmpresas = NEW JsonArray().
        IF c-Usuario <> "" AND c-Usuario <> ? THEN DO:
            FOR EACH segur_empres_usuar NO-LOCK
                WHERE segur_empres_usuar.cod_usuario = c-Usuario:
                oJsonEmpresa = NEW JsonObject().
                oJsonEmpresa:ADD("codUsuario", segur_empres_usuar.cod_usuario).
                oJsonEmpresa:ADD("codEmpresa", segur_empres_usuar.cod_empresa).
                oJsonEmpresas:ADD(oJsonEmpresa).
            END.
        END.

        ASSIGN c-EstabPad = "".

        FOR FIRST fmsc-usuar-mestre
            WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-usuar-mestre.ep-codigo = c-ep-codigo ELSE TRUE)
              AND fmsc-usuar-mestre.cod-usuario = c-Usuario NO-LOCK:
        END.
        IF AVAIL fmsc-usuar-mestre THEN DO:

            ASSIGN iTpAgrupTransf = fmsc-usuar-mestre.int-1 NO-ERROR.
            IF iTpAgrupTransf = ? OR iTpAgrupTransf = 0 THEN
                ASSIGN iTpAgrupTransf = 1.

            ASSIGN c-EstabPad       = fmsc-usuar-mestre.cod-estabel-pad.
            FOR FIRST usuar-mater NO-LOCK
                WHERE usuar-mater.cod-usuar = c-Usuario.
                ASSIGN c-EstabPad = substring(usuar-mater.char-1,16,3).
            END.
            IF NOT AVAIL usuar-mater OR c-EstabPad = '' THEN DO:
                FOR FIRST param-estoq FIELDS(estabel-pad) NO-LOCK.
                    ASSIGN c-EstabPad = param-estoq.estabel-pad.
                END.
            END.
            ASSIGN iTabPrincipal = fmsc-usuar-mestre.int-2.
            IF iTabPrincipal = 0 THEN
                ASSIGN iTabPrincipal = 1.                

            oJsonOutput = NEW JsonObject().
            oJsonOutput:ADD("codEmpresa",       fmsc-usuar-mestre.ep-codigo).
            oJsonOutput:ADD("codUsuario",       fmsc-usuar-mestre.cod-usuario).
            oJsonOutput:ADD("situacao",         9). //OK
            oJsonOutput:ADD("codEstabPad",      trim(c-EstabPad)).
            oJsonOutput:ADD("TpAgrupTransf",    iTpAgrupTransf).
            oJsonOutput:ADD("tabPrincipal",     iTabPrincipal).
            oJsonOutput:ADD("permEstoque",      fmsc-usuar-mestre.l-estoque).
            oJsonOutput:ADD("permCompras",      fmsc-usuar-mestre.l-compras).
            oJsonOutput:ADD("permCredito",      fmsc-usuar-mestre.l-credito).            
            oJsonOutput:ADD("permEstoqReqAte",  fmsc-usuar-mestre.l-permis-estoq[1]).
            oJsonOutput:ADD("permEstoqReqDev",  fmsc-usuar-mestre.l-permis-estoq[2]).
            oJsonOutput:ADD("permEstoqReqMov",  fmsc-usuar-mestre.l-permis-estoq[3]).
            oJsonOutput:ADD("permEstoqReqInv",  fmsc-usuar-mestre.l-permis-estoq[4]).
            oJsonOutput:ADD("permEstoqReqRec",  fmsc-usuar-mestre.l-permis-estoq[5]).
            oJsonOutput:ADD("permComprMLA",     fmsc-usuar-mestre.l-permis-compras[1]).
            oJsonOutput:ADD("permCredAvCli",    fmsc-usuar-mestre.l-permis-credito[1]).
            oJsonOutput:ADD("permProducao",     fmsc-usuar-mestre.l-producao).
            oJsonOutput:ADD("permRepRepOrd",    fmsc-usuar-mestre.l-permis-rep-ordem-prod[1]).
            oJsonOutput:ADD("empresas",         oJsonEmpresas).
            
            oJsonArray :ADD(oJsonOutput).
        END.
        ELSE DO:
            oJsonOutput = NEW JsonObject().
            oJsonOutput:ADD("codEmpresa",       c-ep-codigo).
            oJsonOutput:ADD("codUsuario",       c-Usuario).
            oJsonOutput:ADD("situacao",         0).
            oJsonOutput:ADD("codEstabPad",      "" ).
            oJsonOutput:ADD("TpAgrupTransf",    0).        
            oJsonOutput:ADD("tabPrincipal",     0).
            oJsonOutput:ADD("permEstoque",      NO).
            oJsonOutput:ADD("permCompras",      NO).
            oJsonOutput:ADD("permCredito",      NO).            
            oJsonOutput:ADD("permEstoqReqAte",  NO).
            oJsonOutput:ADD("permEstoqReqDev",  NO).
            oJsonOutput:ADD("permEstoqReqMov",  NO).
            oJsonOutput:ADD("permEstoqReqInv",  NO).
            oJsonOutput:ADD("permEstoqReqRec",  NO).
            oJsonOutput:ADD("permComprMLA",     NO).
            oJsonOutput:ADD("permCredAvCli",    NO).
            oJsonOutput:ADD("permProducao",     NO).
            oJsonOutput:ADD("permRepRepOrd",    NO).
            oJsonOutput:ADD("empresas",         oJsonEmpresas).
            
            oJsonArray :ADD(oJsonOutput).
        END.

        jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE). 

    END.

    RETURN 'OK':U.

END PROCEDURE.