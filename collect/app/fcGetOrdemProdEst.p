{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetOrdemProdRep MCE}
&ENDIF

{include/i-freeac.i}

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.
    DEFINE VAR iPrimOrdManut        AS INTEGER      NO-UNDO.
    DEFINE VAR c-CodEstabel         AS CHAR         NO-UNDO.
    DEFINE VAR c-dscSituacao        AS CHAR         NO-UNDO.
    DEFINE VAR iNrOrdProdu          AS INTEGER      NO-UNDO.
    DEFINE VAR cItCodigo            AS CHAR         NO-UNDO.
    DEFINE VAR dtCorte              AS DATE         NO-UNDO.

    // Criacao do Retorno 
    DEFINE VAR oJsonArray   AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput  AS JsonObject NO-UNDO.
    
  
    
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
    
            ASSIGN c-CodEstabel = oJsonPayloadObject:GetCharacter("codEstabel").
            ASSIGN iNrOrdProdu  = oJsonPayloadObject:GetInteger("nrOrdProdu") NO-ERROR.
            ASSIGN cItCodigo    = oJsonPayloadObject:GetCharacter("itCodigo") NO-ERROR.
            IF oJsonPayloadObject:Has("dtCorte") THEN DO:
                ASSIGN dtCorte = oJsonPayloadObject:GetDate("dtCorte") NO-ERROR.
                IF dtCorte = ? THEN
                    ASSIGN dtCorte = DATE(oJsonPayloadObject:GetCharacter("dtCorte")) NO-ERROR.
            END.
        END.        
        
        IF dtCorte = ? AND jsonInput:Has("dtCorte") THEN DO:
            ASSIGN dtCorte = jsonInput:GetDate("dtCorte") NO-ERROR.
            IF dtCorte = ? THEN
                ASSIGN dtCorte = DATE(jsonInput:GetCharacter("dtCorte")) NO-ERROR.
        END.
        
        ASSIGN iPrimOrdManut = 0.
        FIND FIRST param-mi NO-LOCK NO-ERROR.
        IF AVAIL param-mi THEN DO:
            ASSIGN iPrimOrdManut = param-mi.prim-ord-man-mi.     
        END.
        
        FIND FIRST param-cp NO-LOCK NO-ERROR.
        
        
        ASSIGN c-dscSituacao  = ''.

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().

        FOR EACH ord-prod NO-LOCK
            WHERE ord-prod.estado < 7
              AND (ord-prod.qt-ordem - ord-prod.qt-produzida) > 0
              AND ord-prod.cod-estabel  = c-CodEstabel
              AND ord-prod.rep-prod     = 1 //ordem
              AND ord-prod.tipo         = 1 //interna
              AND (IF iPrimOrdManut > 0 THEN
                      ord-prod.nr-ord-produ < iPrimOrdManut
                   ELSE TRUE)
              AND (IF iNrOrdProdu > 0 THEN ord-prod.nr-ord-produ = iNrOrdProdu ELSE TRUE)
              AND (IF cItCodigo <> "" AND cItCodigo <> ? THEN ord-prod.it-codigo BEGINS cItCodigo ELSE TRUE)
              AND (IF dtCorte <> ? THEN ord-prod.dt-emissao >= dtCorte ELSE TRUE)
              ,
              FIRST ITEM OF ord-prod NO-LOCK.

            oJsonOutput = NEW JsonObject().
            oJsonOutput:ADD("nrOrdProdu",      string(ord-prod.nr-ord-produ)).
            oJsonOutput:ADD("itCodigo",        ord-prod.it-codigo).
            oJsonOutput:ADD("descItem",        ITEM.desc-item).
            oJsonOutput:ADD("qtOrdem",         ord-prod.qt-ordem).
            oJsonOutput:ADD("qtProduzida",     ord-prod.qt-produzida).
            oJsonOutput:ADD("qtRefugada",      ord-prod.qt-refugada).
            oJsonOutput:ADD("qtSaldo",         ord-prod.qt-ordem - ord-prod.qt-produzida).
            oJsonOutput:ADD("estado",          ord-prod.estado).
            oJsonOutput:ADD("codUnidNegoc",    ord-prod.cod-unid-negoc).
            oJsonOutput:ADD("un",              ord-prod.un).
            oJsonOutput:ADD("codEstabel",      ord-prod.cod-estabel).
            oJsonOutput:ADD("codDepos",        ord-prod.cod-depos).
            oJsonOutput:ADD("nrLinha",         ord-prod.nr-linha).            
            oJsonOutput:ADD("loteSerie",       ord-prod.lote-serie).
            oJsonOutput:ADD("dtEmissao",       ord-prod.dt-emissao).
            oJsonOutput:ADD("dtInicio",        ord-prod.dt-inicio).
            oJsonOutput:ADD("dtTermino",       ord-prod.dt-termino ).
            oJsonOutput:ADD("cdPlanejado",     ord-prod.cd-planejado ).   
            
            CASE ord-prod.estado:
                WHEN 1 THEN
                    ASSIGN c-dscSituacao = 'NÆo Iniciada'.
                WHEN 2 THEN
                    ASSIGN c-dscSituacao = 'Liberada'.
                WHEN 3 THEN
                    ASSIGN c-dscSituacao = 'Reservada'.
                WHEN 4 THEN
                    ASSIGN c-dscSituacao = 'Separada'.
                WHEN 5 THEN
                    ASSIGN c-dscSituacao = 'Requisitada'.
                WHEN 6 THEN
                    ASSIGN c-dscSituacao = 'Iniciada'.
                WHEN 7 THEN
                    ASSIGN c-dscSituacao = 'Finalizada'.
                WHEN 8 THEN
                    ASSIGN c-dscSituacao = 'Terminada'.            
            END CASE.
            
            oJsonOutput:ADD("codRefer",          ord-prod.cod-refer).
            oJsonOutput:ADD("dscSituacao",       c-dscSituacao ).
            oJsonOutput:ADD("tipoConEst",        ITEM.tipo-con-est ).
            oJsonOutput:ADD("locUnica",          ITEM.loc-unica ).
            oJsonOutput:ADD("ctRefugo",          param-cp.ct-refugo ).
            oJsonOutput:ADD("scRefugo",          param-cp.sc-refugo ).
            
            oJsonArray :ADD(oJsonOutput).
        END.
        jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE). 

    END.

    RETURN 'OK':U.

END PROCEDURE.

