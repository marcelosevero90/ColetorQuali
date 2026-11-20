{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcSetReporteOrdProd MCE}
&ENDIF

{cdp/cd0666.i}
{cdp/cdcfgman.i}
{cdp/cdcfgmat.i} /* Preprocessador bf_mat_conta_estab */
{cpp/cpapi001.i}  /* Definicao temp-table cpapi001 */
{cpp/cpapi001.i1} /* Definicao temp-table adicionais cpapi001 */
{cep/ceapi001k.i} /*tabela tt-movto*/



PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR aSubPayload          AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.
    DEFINE VAR iContSE              AS INTEGER      NO-UNDO.

    // Criacao do Retorno 
    DEFINE VAR oJsonArray           AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput          AS JsonObject NO-UNDO.
           

    DEFINE VAR i-nrOrdProdu         AS INT          NO-UNDO.
    DEFINE VAR c-codEstabel         AS CHAR         NO-UNDO.    
    DEFINE VAR c-codDepos           AS CHAR         NO-UNDO.
    DEFINE VAR c-codLocaliz         AS CHAR         NO-UNDO.
    DEFINE VAR c-lote               AS CHAR         NO-UNDO.
    DEFINE VAR c-codRefer           AS CHAR         NO-UNDO.
    DEFINE VAR d-dtValiLote         AS DATE         NO-UNDO.    
    DEFINE VAR d-qtReporte          AS DEC          NO-UNDO.
    DEFINE VAR d-qtRefugada         AS DEC          NO-UNDO.    
    DEFINE VAR d-dtReporte          AS DATE         NO-UNDO.    
    DEFINE VAR c-ctRefugo           AS CHAR         NO-UNDO.
    DEFINE VAR c-scRefugo           AS CHAR         NO-UNDO.
    DEFINE VAR c-nroDocto           AS CHAR         NO-UNDO.
    DEFINE VAR c-serie              AS CHAR         NO-UNDO.
    DEFINE VAR c-codDeposSai        AS CHAR         NO-UNDO.
    DEFINE VAR c-codLocalSai        AS CHAR         NO-UNDO.
    
    DEFINE VAR h-boin157q01         AS HANDLE       NO-UNDO.    
        
    DEFINE VAR lControl             AS LOG          NO-UNDO.
    DEFINE VAR hCeapi001k           AS HANDLE       NO-UNDO.
    DEFINE VAR i-seq-erro           AS INTE         NO-UNDO.
    DEFINE VAR c-erros-lista        AS CHAR         NO-UNDO.    
    DEFINE VAR d-qt-atend           AS DEC          NO-UNDO.
    DEFINE VAR l-habilita           AS LOG          NO-UNDO.
    DEFINE VAR d-return             AS DATE         NO-UNDO.
    DEFINE VAR c-return             AS CHAR         NO-UNDO.    
    DEFINE VAR iNrFicha             AS INT          NO-UNDO.
    
    
    DEFINE BUFFER b-inventario    FOR inventario.
             
    
    /*bloco:
    DO ON ERROR UNDO, RETURN 'NOK'
       ON STOP  UNDO, RETURN 'NOK'.*/

        aJsonPayloadArray = NEW JsonArray().
        IF jsonInput:Has("payload") THEN DO:
            aJsonPayloadArray = jsonInput:getJSONArray("payload") NO-ERROR.
            IF aJsonPayloadArray = ? OR aJsonPayloadArray:LENGTH = 0 THEN DO:
                oJsonPayloadObject = jsonInput:getJSONObject("payload") NO-ERROR.
                IF VALID-OBJECT(oJsonPayloadObject) THEN DO:
                    aJsonPayloadArray = NEW JsonArray().
                    aJsonPayloadArray:ADD(oJsonPayloadObject).
                END.
            END.
        END.
        ELSE DO:
            aJsonPayloadArray:ADD(jsonInput).
        END.

        IF NOT TYPE-OF(aJsonPayloadArray, JsonArray) OR aJsonPayloadArray:LENGTH = 0 THEN DO:
            RUN setErrorResponse('Parametro Nao e Array', OUTPUT jsonOutput).
            RETURN 'NOK'. 
        END.

        DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
            //-- Cabecalho
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).

            IF VALID-OBJECT(oJsonPayloadObject) AND oJsonPayloadObject:Has("payload") THEN DO:
                aSubPayload = oJsonPayloadObject:GetJsonArray("payload") NO-ERROR.
                IF VALID-OBJECT(aSubPayload) AND aSubPayload:LENGTH > 0 THEN
                    oJsonPayloadObject = aSubPayload:GetJsonObject(1).
            END.

            IF NOT VALID-OBJECT(oJsonPayloadObject) THEN NEXT.

            IF oJsonPayloadObject:Has("nrOrdProdu") THEN DO:
                ASSIGN i-nrOrdProdu = oJsonPayloadObject:GetInteger("nrOrdProdu") NO-ERROR.
                IF ERROR-STATUS:ERROR OR i-nrOrdProdu = 0 THEN
                    ASSIGN i-nrOrdProdu = INTEGER(oJsonPayloadObject:GetCharacter("nrOrdProdu")) NO-ERROR.
            END.
            ELSE IF oJsonPayloadObject:Has("nr-ord-produ") THEN DO:
                ASSIGN i-nrOrdProdu = oJsonPayloadObject:GetInteger("nr-ord-produ") NO-ERROR.
                IF ERROR-STATUS:ERROR OR i-nrOrdProdu = 0 THEN
                    ASSIGN i-nrOrdProdu = INTEGER(oJsonPayloadObject:GetCharacter("nr-ord-produ")) NO-ERROR.
            END.
            ELSE IF oJsonPayloadObject:Has("nrOrdem") THEN DO:
                ASSIGN i-nrOrdProdu = oJsonPayloadObject:GetInteger("nrOrdem") NO-ERROR.
                IF ERROR-STATUS:ERROR OR i-nrOrdProdu = 0 THEN
                    ASSIGN i-nrOrdProdu = INTEGER(oJsonPayloadObject:GetCharacter("nrOrdem")) NO-ERROR.
            END.
            ELSE IF oJsonPayloadObject:Has("nrOrdemProd") THEN DO:
                ASSIGN i-nrOrdProdu = oJsonPayloadObject:GetInteger("nrOrdemProd") NO-ERROR.
                IF ERROR-STATUS:ERROR OR i-nrOrdProdu = 0 THEN
                    ASSIGN i-nrOrdProdu = INTEGER(oJsonPayloadObject:GetCharacter("nrOrdemProd")) NO-ERROR.
            END.

            IF oJsonPayloadObject:Has("codEstabel") THEN
                ASSIGN c-codEstabel = TRIM(oJsonPayloadObject:GetCharacter("codEstabel")) NO-ERROR.
            ELSE IF oJsonPayloadObject:Has("cod-estabel") THEN
                ASSIGN c-codEstabel = TRIM(oJsonPayloadObject:GetCharacter("cod-estabel")) NO-ERROR.

            IF oJsonPayloadObject:Has("codDepos") THEN
                ASSIGN c-codDepos = TRIM(oJsonPayloadObject:GetCharacter("codDepos")) NO-ERROR.
            ELSE IF oJsonPayloadObject:Has("codDeposEnt") THEN
                ASSIGN c-codDepos = TRIM(oJsonPayloadObject:GetCharacter("codDeposEnt")) NO-ERROR.

            IF oJsonPayloadObject:Has("codLocaliz") THEN
                ASSIGN c-codLocaliz = TRIM(oJsonPayloadObject:GetCharacter("codLocaliz")) NO-ERROR.
            ELSE IF oJsonPayloadObject:Has("codLocalizEnt") THEN
                ASSIGN c-codLocaliz = TRIM(oJsonPayloadObject:GetCharacter("codLocalizEnt")) NO-ERROR.
            IF c-codLocaliz = "BRANCO" OR c-codLocaliz = "(EM BRANCO)" OR c-codLocaliz = "EM BRANCO" OR c-codLocaliz = "-" THEN
                ASSIGN c-codLocaliz = "".

            IF oJsonPayloadObject:Has("lote") THEN
                ASSIGN c-lote = TRIM(oJsonPayloadObject:GetCharacter("lote")) NO-ERROR.
            ELSE IF oJsonPayloadObject:Has("loteEnt") THEN
                ASSIGN c-lote = TRIM(oJsonPayloadObject:GetCharacter("loteEnt")) NO-ERROR.

            IF oJsonPayloadObject:Has("codRefer") THEN
                ASSIGN c-codRefer = TRIM(oJsonPayloadObject:GetCharacter("codRefer")) NO-ERROR.
            ELSE IF oJsonPayloadObject:Has("codReferEnt") THEN
                ASSIGN c-codRefer = TRIM(oJsonPayloadObject:GetCharacter("codReferEnt")) NO-ERROR.

            IF oJsonPayloadObject:Has("dtValiLote") THEN DO:
                ASSIGN d-dtValiLote = oJsonPayloadObject:GetDate("dtValiLote") NO-ERROR.
                IF d-dtValiLote = ? THEN
                    ASSIGN d-dtValiLote = DATE(oJsonPayloadObject:GetCharacter("dtValiLote")) NO-ERROR.
            END.

            IF oJsonPayloadObject:Has("qtReporte") THEN DO:
                ASSIGN d-qtReporte = oJsonPayloadObject:GetDecimal("qtReporte") NO-ERROR.
                IF ERROR-STATUS:ERROR OR d-qtReporte = 0 THEN
                    ASSIGN d-qtReporte = DECIMAL(oJsonPayloadObject:GetCharacter("qtReporte")) NO-ERROR.
            END.
            ELSE IF oJsonPayloadObject:Has("quantidade") THEN DO:
                ASSIGN d-qtReporte = oJsonPayloadObject:GetDecimal("quantidade") NO-ERROR.
                IF ERROR-STATUS:ERROR OR d-qtReporte = 0 THEN
                    ASSIGN d-qtReporte = DECIMAL(oJsonPayloadObject:GetCharacter("quantidade")) NO-ERROR.
            END.

            IF oJsonPayloadObject:Has("qtRefugada") THEN DO:
                ASSIGN d-qtRefugada = oJsonPayloadObject:GetDecimal("qtRefugada") NO-ERROR.
                IF ERROR-STATUS:ERROR THEN
                    ASSIGN d-qtRefugada = DECIMAL(oJsonPayloadObject:GetCharacter("qtRefugada")) NO-ERROR.
            END.

            IF oJsonPayloadObject:Has("dtReporte") THEN DO:
                ASSIGN d-dtReporte = oJsonPayloadObject:GetDate("dtReporte") NO-ERROR.
                IF d-dtReporte = ? THEN
                    ASSIGN d-dtReporte = DATE(oJsonPayloadObject:GetCharacter("dtReporte")) NO-ERROR.
            END.
            IF d-dtReporte = ? THEN
                ASSIGN d-dtReporte = TODAY.

            IF oJsonPayloadObject:Has("ctRefugo") THEN
                ASSIGN c-ctRefugo = TRIM(oJsonPayloadObject:GetCharacter("ctRefugo")) NO-ERROR.

            IF oJsonPayloadObject:Has("scRefugo") THEN
                ASSIGN c-scRefugo = TRIM(oJsonPayloadObject:GetCharacter("scRefugo")) NO-ERROR.

            IF oJsonPayloadObject:Has("nroDocto") THEN
                ASSIGN c-nroDocto = TRIM(oJsonPayloadObject:GetCharacter("nroDocto")) NO-ERROR.
            IF c-nroDocto = "" OR c-nroDocto = ? THEN
                ASSIGN c-nroDocto = STRING(i-nrOrdProdu).

            IF oJsonPayloadObject:Has("serie") THEN
                ASSIGN c-serie = TRIM(oJsonPayloadObject:GetCharacter("serie")) NO-ERROR.

            IF oJsonPayloadObject:Has("codDeposSai") THEN
                ASSIGN c-codDeposSai = TRIM(oJsonPayloadObject:GetCharacter("codDeposSai")) NO-ERROR.

            IF oJsonPayloadObject:Has("codLocalSai") THEN
                ASSIGN c-codLocalSai = TRIM(oJsonPayloadObject:GetCharacter("codLocalSai")) NO-ERROR.
            IF c-codLocalSai = "BRANCO" OR c-codLocalSai = "(EM BRANCO)" OR c-codLocalSai = "EM BRANCO" OR c-codLocalSai = "-" THEN
                ASSIGN c-codLocalSai = "".
        END.
        
        EMPTY TEMP-TABLE tt-rep-prod.
        EMPTY TEMP-TABLE tt-refugo.
        EMPTY TEMP-TABLE tt-res-neg.
        EMPTY TEMP-TABLE tt-apont-mob.
        EMPTY TEMP-TABLE tt-erro.
                
        FIND FIRST ord-prod NO-LOCK
            WHERE ord-prod.nr-ord-produ = i-nrOrdProdu NO-ERROR.                
        IF NOT AVAIL ord-prod THEN DO:
        
            
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   c-erros-lista).
            jsonOutput:ADD('code',              '17006').
            jsonOutput:ADD('message',           'Ordem Prod n�o encontrada: ' + STRING(i-nrOrdProdu)).
            jsonOutput:ADD('type',              'ERROR').   
            
            RETURN "OK".
            
        END.
        
        FIND FIRST item NO-LOCK WHERE item.it-codigo = ord-prod.it-codigo NO-ERROR.
        FIND FIRST param-cp NO-LOCK NO-ERROR.
                
        
        CREATE tt-rep-prod.                                                                                                                        
        ASSIGN tt-rep-prod.cod-versao-integracao = 1
               tt-rep-prod.tipo                  = 1 //ordem
               tt-rep-prod.nr-ord-prod           = ord-prod.nr-ord-produ
               tt-rep-prod.prog-seg              = "fcSetRepOrd"                                                                                           
               tt-rep-prod.procura-saldos        = YES                                                                                                  
               tt-rep-prod.carrega-reservas      = no
               tt-rep-prod.baixa-reservas        = 1                                                                                                   
               tt-rep-prod.requis-automatica     = NO                                                                                          
               tt-rep-prod.cod-depos-sai         = (IF c-codDeposSai <> "" AND c-codDeposSai <> ? THEN c-codDeposSai ELSE param-cp.dep-fabrica)
               tt-rep-prod.cod-local-sai         = (IF c-codLocalSai <> ? THEN c-codLocalSai ELSE '')
               tt-rep-prod.data                  = d-dtReporte                                                                                               
               tt-rep-prod.un                    = ord-prod.un                                                                                         
               tt-rep-prod.qt-reporte            = d-qtReporte
               tt-rep-prod.qt-refugo             = d-qtRefugada                                                                                                                           
               tt-rep-prod.it-codigo             = ord-prod.it-codigo                                                                                                           
               tt-rep-prod.qt-apr-cond           = 0                                                                                                                            
               tt-rep-prod.nro-docto             = c-nroDocto                                                                                                 
               tt-rep-prod.serie-docto           = c-serie                                                                                                                        
               tt-rep-prod.cod-depos             = c-codDepos
               tt-rep-prod.cod-localiz           = c-codLocaliz
               tt-rep-prod.lote-serie            = c-lote
               tt-rep-prod.cod-refer             = c-codRefer                                                                                                           
               tt-rep-prod.dt-vali-lote          = ?
               tt-rep-prod.ct-codigo             = ord-prod.ct-codigo
               tt-rep-prod.sc-codigo             = ord-prod.sc-codigo
               tt-rep-prod.finaliza-ordem        = NO               
               tt-rep-prod.ct-refugo             = c-ctRefugo
               tt-rep-prod.sc-refugo             = c-scRefugo            
               .        
        
        IF c-lote <> '' AND (ITEM.tipo-con-est = 3 OR ITEM.tipo-con-est = 4) THEN DO:
            IF d-dtValiLote = ? OR d-dtValiLote <= d-dtReporte THEN
                ASSIGN d-dtValiLote = d-dtReporte + 365.
            ASSIGN tt-rep-prod.dt-vali-lote = d-dtValiLote.
        END.
                        
        RUN cpp/cpapi001.p  (INPUT-OUTPUT TABLE tt-rep-prod,
                             INPUT        TABLE tt-refugo,
                             INPUT        TABLE tt-res-neg,
                             INPUT        TABLE tt-apont-mob,
                             INPUT-OUTPUT TABLE tt-erro,
                             INPUT        YES).        


        ASSIGN c-erros-lista = ''.        
        FOR EACH tt-erro,
            FIRST cadast_msg NO-LOCK
            WHERE cadast_msg.cdn_msg        = tt-erro.cd-erro
              AND cadast_msg.idi_tip_msg    = 1. // tipo erro
            ASSIGN c-erros-lista = c-erros-lista + tt-erro.mensagem + '-'.
        END.        
        
        IF c-erros-lista <> '' THEN DO:
              
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   c-erros-lista).
            jsonOutput:ADD('code',              '17006').
            jsonOutput:ADD('message',           c-erros-lista).
            jsonOutput:ADD('type',              'ERROR').   
            
            
            RETURN "OK".                 
        END.        
                       
    
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   'Ordem Prod Reportada com sucesso!').
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Ordem Prod Reportada com sucesso!').
        jsonOutput:ADD('type',              'OK').
        
        RETURN "OK".
        
        
        /*FINALLY:
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   ERROR-STATUS:GET-MESSAGE(1)).
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Requisi��o efetuada com sucesso no Datasul!').
        jsonOutput:ADD('type',              'OK').           
        END FINALLY.*/
              
    //END.
    
    CATCH erro AS Progress.Lang.Error:
        //RUN setErrorResponse(erro:GetMessage(1), OUTPUT jsonOutput).
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   erro:GetMessage(1)).
        jsonOutput:ADD('code',              '17006').
        jsonOutput:ADD('message',           erro:GetMessage(1)).
        jsonOutput:ADD('type',              'ERROR').        
    END.    

    //RETURN 'OK':U.

END PROCEDURE.



