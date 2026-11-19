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
                       
            ASSIGN i-nrOrdProdu    = oJsonPayloadObject:GetInteger("nrOrdProdu")
                   c-codEstabel    = oJsonPayloadObject:GetCharacter("codEstabel")
                   c-codDepos      = oJsonPayloadObject:GetCharacter("codDepos")
                   c-codLocaliz    = oJsonPayloadObject:GetCharacter("codLocaliz")
                   c-lote          = oJsonPayloadObject:GetCharacter("lote")
                   c-codRefer      = oJsonPayloadObject:GetCharacter("codRefer")
                   d-dtValiLote    = oJsonPayloadObject:GetDate("dtValiLote")
                   d-qtReporte     = oJsonPayloadObject:GetDecimal("qtReporte")
                   d-qtRefugada    = oJsonPayloadObject:GetDecimal("qtRefugada")
                   d-dtReporte     = oJsonPayloadObject:GetDate("dtReporte")
                   c-ctRefugo      = oJsonPayloadObject:GetCharacter("ctRefugo")
                   c-scRefugo      = oJsonPayloadObject:GetCharacter("scRefugo")
                   c-nroDocto      = oJsonPayloadObject:GetCharacter("nroDocto")
                   c-serie         = oJsonPayloadObject:GetCharacter("serie")
                   c-codDeposSai   = oJsonPayloadObject:GetCharacter("codDeposSai") NO-ERROR
                   c-codLocalSai   = oJsonPayloadObject:GetCharacter("codLocalSai") NO-ERROR.
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
            jsonOutput:ADD('message',           'Ordem Prod nÆo encontrada: ' + STRING(i-nrOrdProdu)).
            jsonOutput:ADD('type',              'ERROR').   
            
            RETURN "OK".
            
        END.
        
        FIND FIRST ITEM OF ord-prod NO-LOCK NO-ERROR.
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
        
        IF c-lote <> '' AND ITEM.tipo-con-est = 3 THEN DO:
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
        jsonOutput:ADD('message',           'Requisi‡Æo efetuada com sucesso no Datasul!').
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



