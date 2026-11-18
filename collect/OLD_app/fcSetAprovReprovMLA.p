{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcSetAprovReprovMLA MLA}
&ENDIF


DEFINE TEMP-TABLE tt-pendencia NO-UNDO
    FIELD tipo-trans       AS INTEGER   FORMAT "9"
    FIELD ep-codigo        AS CHAR
    FIELD cod-estabel      LIKE estabelec.cod-estabel
    FIELD cod-tip-doc      AS INTEGER   FORMAT ">>9"
    FIELD chave-doc        AS CHARACTER FORMAT "x(80)"
    FIELD nr-trans         AS INTEGER   FORMAT ">>>>>>>>9"
    FIELD cod-erro         AS INTEGER   FORMAT ">>>>>9"
    FIELD desc-erro        AS CHARACTER FORMAT "x(256)"
    FIELD cod-usuar        LIKE mla-doc-pend-aprov.cod-usuar
    FIELD dt-geracao       LIKE mla-doc-pend-aprov.dt-geracao
    FIELD rowid-pend       AS ROWID     
    INDEX codigo AS PRIMARY cod-tip-doc chave-doc ASCENDING.

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

    define var  pTipotrans      as INT  no-undo.
    define var  c-ep-codigo     as char no-undo.
    define var  c-cod-estabel   as char no-undo.
    define var  i-cod-tip-doc   as INT  no-undo.
    define var  c-chave-doc     as char no-undo.
    define var  i-nr-trans      as INT  no-undo.
    define var  c-cod-usuar     as char no-undo.
    define var  ddt-geracao     as DATE no-undo.
    define var  cUsuario        as char no-undo.
    define var  i-cod-rejeicao  as INT no-undo.
    define var  c-narrativa     as char no-undo.            
             
    DEFINE VAR h-boin767C AS HANDLE      NO-UNDO.
    DEFINE VAR h-boin767  AS HANDLE      NO-UNDO.
    
    DEFINE VAR r-rowid    AS ROWID       NO-UNDO.
    
    DEFINE VAR pOk        AS LOG         NO-UNDO.
    DEFINE VAR cReturn-value as char no-undo.
    DEFINE VAR c-erros-lista as char no-undo.
    
    
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

            ASSIGN  pTipotrans      = oJsonPayloadObject:GetInteger("tipoTrans")
                    c-ep-codigo     = oJsonPayloadObject:GetCharacter("epCodigo")
                    c-cod-estabel   = oJsonPayloadObject:GetCharacter("codEstabel")
                    i-cod-tip-doc   = oJsonPayloadObject:GetInteger("codTipDoc")
                    c-chave-doc     = oJsonPayloadObject:GetCharacter("chaveDoc")
                    i-nr-trans      = oJsonPayloadObject:GetInteger("nrTrans")
                    c-cod-usuar     = oJsonPayloadObject:GetCharacter("codUsuar")
                    ddt-geracao     = oJsonPayloadObject:GetDate("dtGeracao")
                    cUsuario        = oJsonPayloadObject:GetCharacter("codUsuarioAprov")
                    i-cod-rejeicao  = oJsonPayloadObject:GetInteger("codRejeicao")
                    c-narrativa     = oJsonPayloadObject:GetCharacter("narrativa")
                    .                                                                   
        END.                                            
        
        EMPTY TEMP-TABLE RowErrors.
                       
       if not valid-handle(h-boin767C)then
            run inbo/boin767c.p persistent set h-boin767C .
       if not valid-handle(h-boin767)then
            run inbo/boin767.p persistent set h-boin767.        
        
        for each tt-pendencia:
            delete tt-pendencia.
        end.

        create tt-pendencia.
        assign tt-pendencia.tipo-trans  = pTipotrans
               tt-pendencia.ep-codigo   = c-ep-codigo
               tt-pendencia.cod-estabel = c-cod-estabel
               tt-pendencia.cod-tip-doc = i-cod-tip-doc
               tt-pendencia.chave-doc   = c-chave-doc
               tt-pendencia.nr-trans    = i-nr-trans
               tt-pendencia.cod-usuar   = c-cod-usuar
               tt-pendencia.dt-geracao  = ddt-geracao.

        run openquerystatic in h-boin767 (input "main").
        run gotokey  in h-boin767 (input i-nr-trans).
        run getRowid in h-boin767 (output r-rowid).
        
        assign tt-pendencia.rowid-pend  = r-rowid.

        run setAnalysPend in h-boin767c (input cUsuario,                           
                                         INPUT i-cod-rejeicao,
                                         INPUT c-narrativa,
                                         input "",
                                         input "",
                                         input "",
                                         input no,
                                         input no,
                                         input 1,
                                         input "",
                                         input table tt-pendencia).
                                         
       assign pOk = YES
              cReturn-value = RETURN-VALUE.
       
       RUN getRowErrors IN h-boin767c (OUTPUT TABLE RowErrors). 

       if valid-handle(h-boin767c)then
           delete procedure h-boin767c NO-ERROR.
       if valid-handle(h-boin767)then
           delete procedure h-boin767 NO-ERROR.
    
               
        IF CAN-FIND(FIRST RowErrors
                    WHERE RowErrors.ErrorSubType = "ERROR"
                      AND RowErrors.ErrorNumber <> 54399 ) THEN DO:

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
        
        
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   'Documento atualizado com sucesso!').
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Documento atualizado com sucesso!').
        jsonOutput:ADD('type',              'OK').   
        
        RETURN "OK".        
              
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



