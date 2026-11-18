{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcSetRequisDevol MCE}
&ENDIF

{cdp/cd0666.i}
{cep/ceapi001k.i} /*tabela tt-movto*/

DEFINE TEMP-TABLE tt-saldo-estoq NO-UNDO
    FIELD cod-estabel   AS CHAR
    FIELD cod-depos     AS CHAR
    FIELD cod-localiz   AS CHAR
    FIELD lote          AS CHAR
    FIELD cod-refer     AS CHAR
    FIELD it-codigo     AS CHAR
    FIELD qt-a-atender  AS DEC.

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
    DEFINE VAR oJsonSaldoEst        AS JsonObject NO-UNDO.
    
    DEFINE VAR arJsonArrEstoq       AS JsonArray    NO-UNDO.

    DEFINE VAR i-nrRequis           AS INT          NO-UNDO.
    DEFINE VAR c-itCodigo           AS CHAR         NO-UNDO.
    DEFINE VAR i-Sequencia          AS INT          NO-UNDO.
    DEFINE VAR c-CodUsuario         AS CHAR         NO-UNDO.
    DEFINE VAR lControl             AS LOG          NO-UNDO.
    DEFINE VAR hCeapi001k           AS HANDLE       NO-UNDO.
    DEFINE VAR i-seq-erro           AS INTE         NO-UNDO.
    DEFINE VAR c-erros-lista        AS CHAR         NO-UNDO.    
    DEFINE VAR d-qtDevol            AS DEC          NO-UNDO.
    
    DEFINE VAR c-codDeposEnt        AS CHAR         NO-UNDO.
    DEFINE VAR c-codLocalizEnt      AS CHAR         NO-UNDO.
    DEFINE VAR c-LoteEnt            AS CHAR         NO-UNDO.
    DEFINE VAR c-codReferEnt        AS CHAR         NO-UNDO.       
    DEFINE VAR c-codEstabel         AS CHAR         NO-UNDO.       
    
    DEFINE VAR dt-devol             AS DATE         NO-UNDO. 
    
    DEFINE VAR c-doc-format         AS CHAR         NO-UNDO.    
    
    
    DEFINE BUFFER b-it-requisicao FOR it-requisicao.
    
    EMPTY TEMP-TABLE tt-saldo-estoq.
    EMPTY TEMP-TABLE tt-erro.
    EMPTY TEMP-TABLE RowErrors.
    EMPTY TEMP-TABLE tt-movto.
    
    //bloco:
    //DO ON ERROR UNDO, RETURN 'NOK'
      // ON STOP  UNDO, RETURN 'NOK'.

        aJsonPayloadArray = NEW JsonArray().
        aJsonPayloadArray = jsonInput:getJSONArray("payload") NO-ERROR.

        IF aJsonPayloadArray:LENGTH = 0 THEN DO:
             oJsonPayloadObject = CAST(jsonInput:getJSONObject("payload"), "JSONObject") NO-ERROR. 
             aJsonPayloadArray:ADD(oJsonPayloadObject). 
        END.
        IF NOT TYPE-OF(aJsonPayloadArray, JsonArray) THEN DO:
            RUN setErrorResponse('ParÉmetro N∆o Ç Array', OUTPUT jsonOutput).
            RETURN 'NOK'. 
        END.

        DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
            //-- Cabecalho
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).
                       
            ASSIGN i-nrRequis   = oJsonPayloadObject:GetInteger("nrRequisicao")
                   c-itCodigo   = oJsonPayloadObject:GetCharacter("itCodigo")
                   i-Sequencia  = oJsonPayloadObject:GetInteger("sequencia")
                   c-CodUsuario = oJsonPayloadObject:GetCharacter("codUsuario")
                   c-codEstabel = oJsonPayloadObject:GetCharacter("codEstabel")
                   d-qtDevol    = oJsonPayloadObject:GetDecimal("qtDevol")
                   dt-devol     = oJsonPayloadObject:GetDate("dtDevol")
                   . 
                   
            ASSIGN c-codDeposEnt    = oJsonPayloadObject:GetCharacter("codDeposEnt")
                   c-codLocalizEnt  = oJsonPayloadObject:GetCharacter("codLocalizEnt")
                   c-loteEnt        = oJsonPayloadObject:GetCharacter("loteEnt") 
                   c-codReferEnt    = oJsonPayloadObject:GetCharacter("codReferEnt").                      
                                      
        END. 
        
        IF dt-devol = ? THEN
        DO:            
            ASSIGN dt-devol = TODAY.
        END.
        
        
        IF NOT CAN-FIND(FIRST it-requisicao NO-LOCK
                        WHERE it-requisicao.nr-requis   = i-nrRequis
                          AND it-requisicao.it-codigo   = c-itCodigo
                          AND it-requisicao.sequencia   = i-Sequencia) THEN DO:
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 17006
                   RowErrors.ErrorDescription = "Item da Requisiá∆o " + STRING(i-nrRequis) 
                                              + ' - ' + c-itCodigo + ' - ' + STRING(i-Sequencia) + ' n∆o encontrada!'                 
                   RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                   RowErrors.ErrorSubType     = "ERROR".
                        
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
            jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
            jsonOutput:ADD('message',           RowErrors.ErrorDescription).
            jsonOutput:ADD('type',              'ERROR').
            
            RETURN "OK".              
        END.

        FIND ITEM NO-LOCK WHERE
             ITEM.it-codigo = c-itCodigo NO-ERROR.
        IF NOT AVAIL ITEM THEN DO:
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 17006
                   RowErrors.ErrorDescription = "Item " + c-itCodigo + " n∆o encontrado"
                   RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                   RowErrors.ErrorSubType     = "ERROR".
                   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
            jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
            jsonOutput:ADD('message',           RowErrors.ErrorDescription).
            jsonOutput:ADD('type',              'ERROR').
            RETURN "OK".         
        END.                                         
        
        
        FIND FIRST it-requisicao NO-LOCK
            WHERE it-requisicao.nr-requis   = i-nrRequis
              AND it-requisicao.it-codigo   = c-itCodigo
              AND it-requisicao.sequencia   = i-Sequencia NO-ERROR.  
              
                      
        IF it-requisicao.estado = 2 then do:
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 15921
                   RowErrors.ErrorDescription = "Item da Requisiá∆o " + STRING(i-nrRequis) 
                                              + ' - ' + c-itCodigo + ' - ' + STRING(i-Sequencia) + ' n∆o Aprovada!'                 
                   RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                   RowErrors.ErrorSubType     = "ERROR".
                   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
            jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
            jsonOutput:ADD('message',           RowErrors.ErrorDescription).
            jsonOutput:ADD('type',              'ERROR').
                   
            RETURN "OK".         
        END.
        
        /*
        jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   'p1 = ' + SEARCH('cep/ceapi001k.r')).
            jsonOutput:ADD('code',              '00').
            jsonOutput:ADD('message',           '1111').
            jsonOutput:ADD('type',              'ERROR').
            RETURN "OK".                 
            */

        

        
        FOR FIRST saldo-estoq  NO-LOCK
            WHERE saldo-estoq.cod-estabel   = c-codEstabel
              AND saldo-estoq.cod-depos     = c-codDeposEnt
              AND saldo-estoq.cod-localiz   = c-codLocalizEnt
              AND saldo-estoq.cod-refer     = c-codReferEnt
              AND saldo-estoq.it-codigo     = c-itCodigo
              AND saldo-estoq.lote          = c-loteEnt.            
        END.
        IF NOT AVAIL saldo-estoq THEN
        DO:
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 15921
                   RowErrors.ErrorDescription = "Saldo Estoq para " + STRING(i-nrRequis) 
                                              + ' - ' + c-itCodigo + ' - ' + STRING(i-Sequencia) + ' n∆o encontrado!'                 
                   RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                   RowErrors.ErrorSubType     = "ERROR".
                   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
            jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
            jsonOutput:ADD('message',           RowErrors.ErrorDescription).
            jsonOutput:ADD('type',              'ERROR').
                   
            RETURN "OK".         
            
        END.
        
        ASSIGN c-doc-format = string(it-requisicao.nr-requisicao).
        IF LENGTH(c-doc-format) < 9 THEN DO:
        
            ASSIGN c-doc-format = FILL('0',9 - LENGTH(c-doc-format) ) + c-doc-format.
            ASSIGN c-doc-format = SUBSTRING(c-doc-format,1,3) + '.' 
                                + SUBSTRING(c-doc-format,4,3) + '.' 
                                + SUBSTRING(c-doc-format,7,3) .                                            
        END.
        ELSE
        IF LENGTH(c-doc-format) = 9 THEN DO:
        
            ASSIGN c-doc-format = FILL('0',9 - LENGTH(c-doc-format) ) + c-doc-format.
            ASSIGN c-doc-format = SUBSTRING(c-doc-format,1,3) + '.' 
                                + SUBSTRING(c-doc-format,4,3) + '.' 
                                + SUBSTRING(c-doc-format,7,3) .                                            
        END.        
    
            
        CREATE tt-movto.
        ASSIGN tt-movto.cod-versao-integracao = 1
            tt-movto.usuario               = c-CodUsuario
            tt-movto.cod-depos             = saldo-estoq.cod-depos
            tt-movto.cod-estabel           = saldo-estoq.cod-estabel
            tt-movto.dt-trans              = dt-devol
            tt-movto.ct-codigo             = it-requisicao.ct-codigo
            tt-movto.sc-codigo             = it-requisicao.sc-codigo
            tt-movto.it-codigo             = it-requisicao.it-codigo
            tt-movto.esp-docto             = 7 /* DRM */
            tt-movto.cod-localiz           = saldo-estoq.cod-localiz
            tt-movto.lote                  = saldo-estoq.lote
            tt-movto.cod-refer             = saldo-estoq.cod-refer
            tt-movto.referencia            = ""
            tt-movto.serie-docto           = ""
            tt-movto.numero-ordem          = 0
            tt-movto.peso-liquido          = 0
            tt-movto.tipo-preco            = 0
            tt-movto.nro-docto             = c-doc-format //string(it-requisicao.nr-requisicao)                                                          
            tt-movto.cod-emitente          = 0
            tt-movto.dt-nf-saida           = ?
            tt-movto.i-sequen              = it-requisicao.sequencia
            tt-movto.num-sequen            = it-requisicao.sequencia
            tt-movto.sequen-nf             = it-requisicao.sequencia
            tt-movto.un                    = ITEM.un
            tt-movto.tipo-trans            = 1 //entrada 
            tt-movto.tipo-valor            = 2 /* valorizado */
            tt-movto.quantidade            = d-qtDevol
            tt-movto.descricao-db          = "Devoluá∆o Requisiá∆o Mobile"
            tt-movto.dt-vali-lote          = IF AVAIL saldo-estoq THEN saldo-estoq.dt-vali-lote ELSE ?
            tt-movto.cod-prog-orig         = "fmscollector"
            tt-movto.num-ord-inv           = it-requisicao.num-ord-inv
            tt-movto.cod-unid-negoc        = it-requisicao.cod-unid-negoc.                                       
    
          
        RUN 'cep/ceapi001k.r' PERSISTENT SET hCeapi001k NO-ERROR.
        
        
        
       /* jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   'p1 = ' + SEARCH('cep/ceapi001k.r') + ' - ' + ERROR-STATUS:GET-MESSAGE(1)).
            jsonOutput:ADD('code',              '00').
            jsonOutput:ADD('message',           '1111').
            jsonOutput:ADD('type',              'ERROR').
            RETURN "OK".         */
        
        RUN pi-execute IN hCeapi001k (INPUT-OUTPUT TABLE tt-movto,
                                      INPUT-OUTPUT TABLE tt-erro,
                                      INPUT YES). 
        DELETE PROCEDURE hCeapi001k NO-ERROR.
        ASSIGN hCeapi001k = ?.

        IF TEMP-TABLE tt-erro:HAS-RECORDS THEN DO:
            
            FOR EACH tt-erro NO-LOCK,
                FIRST cadast_msg NO-LOCK
                WHERE cadast_msg.cdn_msg        = tt-erro.cd-erro
                  AND cadast_msg.idi_tip_msg    = 1. // tipo erro
                CREATE RowErrors.
                ASSIGN RowErrors.ErrorNumber      = tt-erro.cd-erro
                       RowErrors.ErrorDescription = tt-erro.mensagem
                       RowErrors.ErrorHelp        = tt-erro.mensagem
                       RowErrors.ErrorSubType     = "ERROR".
            END.            
        END.    
        
        IF CAN-FIND(FIRST RowErrors
                    WHERE RowErrors.ErrorSubType = "ERROR") THEN DO:

            ASSIGN c-erros-lista = ''.        
            FOR EACH RowErrors:
                ASSIGN c-erros-lista = c-erros-lista + RowErrors.ErrorDescription + '-'.
            END.
            ASSIGN c-erros-lista = SUBSTRING(c-erros-lista,1,LENGTH(c-erros-lista) - 1).
   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   c-erros-lista).
            jsonOutput:ADD('code',              '17006').
            jsonOutput:ADD('message',           c-erros-lista).
            jsonOutput:ADD('type',              'ERROR').                    
            RETURN "OK".                 
        END.
        
        FIND CURRENT it-requisicao EXCLUSIVE-LOCK NO-ERROR.
        IF AVAIL it-requisicao THEN 
        DO:
            FIND requisicao EXCLUSIVE-LOCK WHERE 
                 requisicao.nr-requisicao = it-requisicao.nr-requisicao NO-ERROR.

            IF AVAIL requisicao THEN
               ASSIGN requisicao.dt-devol = dt-devol.

            ASSIGN it-requisicao.qt-atendida   = it-requisicao.qt-atendida   - d-qtDevol 
                   it-requisicao.qt-a-atender  = it-requisicao.qt-a-atender  + d-qtDevol 
                   it-requisicao.qt-a-devolver = it-requisicao.qt-a-devolver - d-qtDevol                        
                   it-requisicao.qt-devolvida  = it-requisicao.qt-devolvida  + d-qtDevol
                   it-requisicao.val-item      = it-requisicao.qt-a-atender  * it-requisicao.preco-unit.
                                                  
           IF it-requisicao.qt-devolvida < 0 THEN
              ASSIGN it-requisicao.qt-devolvida = 0.

           if  it-requisicao.qt-a-atender > 0 then
              assign it-requisicao.situacao = 1
                     requisicao.situacao    = 1.
            

        END. /* AVAIL it-requisicao */
        FIND CURRENT it-requisicao NO-LOCK NO-ERROR.
        
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   'Processo realizado com sucesso!').
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Requisiá∆o efetuada com sucesso no Datasul!').
        jsonOutput:ADD('type',              'OK').   
        
        RETURN "OK".
        
        
        /*FINALLY:
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   ERROR-STATUS:GET-MESSAGE(1)).
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Requisiá∆o efetuada com sucesso no Datasul!').
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



