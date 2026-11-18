{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcSetEstornoOrdProd MCE}
&ENDIF

{cdp/cd0666.i}   /* Temp-table  de erro */
{cdp/cdcfgmat.i} /* Defini»’o preprocessador bf_mat_conta_estab */
{cdp/cdcfgman.i} /* Defini»’o preprocessador bf_man_linha_estab */ 
{cdp/cdcfgren.i} /* Defini»’o preprocessador custom_grendene */ 
{cdp/cdcfgdis.i} /* Defini»’o preprocessador bf_mat_fech_estab */
{cdp/cdcfgman.i}

 def temp-table tt-rep-prod no-undo like rep-prod use-index item-rep
     field l-emite-rel      as logical
     field rw-rep-prod      as rowid
     field prog-seg         as char
     field time-out         as integer init 30
     field tentativas       as integer init 10
     field cod-versao-integracao as integer format "999".
 
 def temp-table tt-serie no-undo
     field nr-serie  like ord-prod.lote-serie
     field sequencia   as integer
     field refugo      as logical init no
     index sequencia sequencia.  
     
 def temp-table tt-relatorio no-undo
     field es-codigo     like reservas.it-codigo
     field qt-item       like reservas.quant-orig
     field qt-estoq      like reservas.quant-orig
     field qt-saldo      like reservas.quant-orig
     field un            like item.un
     field descricao     like item.desc-item.  


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
           

    DEFINE VAR i-nrReporte          AS INT          NO-UNDO.
    DEFINE VAR da-dt-estorno        AS DATE         NO-UNDO.
    
    DEFINE VAR c-erros-lista        AS CHAR         NO-UNDO.

    
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
                       
            ASSIGN i-nrReporte     = oJsonPayloadObject:GetInteger("nrReporte")
                   da-dt-estorno   = oJsonPayloadObject:GetDate("dtReporte") .
        END.                                            
        
        EMPTY TEMP-TABLE tt-rep-prod.
        EMPTY TEMP-TABLE tt-erro.
        EMPTY TEMP-TABLE tt-relatorio.      
                
        find rep-prod no-lock 
            where rep-prod.nr-reporte = i-nrReporte no-error.
        IF NOT AVAIL rep-prod THEN DO:                   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   c-erros-lista).
            jsonOutput:ADD('code',              '17006').
            jsonOutput:ADD('message',           'Reporte para o movimento nÆo encontrado: ' + STRING(i-nrReporte)).
            jsonOutput:ADD('type',              'ERROR').   
            
            RETURN "OK".            
        END.
        
        create tt-rep-prod.
        buffer-copy rep-prod to tt-rep-prod
        assign tt-rep-prod.cod-versao-integracao = 001
               tt-rep-prod.data                  = da-dt-estorno.        
        
        RUN cpp/cpapi011.p (INPUT table tt-rep-prod ,
                            input-output table tt-erro     ,
                            input        table tt-relatorio,
                            input        YES ).

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
        jsonOutput:ADD('detailedMessage',   'Ordem Prod Estornada com sucesso!').
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Ordem Prod Estornada com sucesso!').
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



