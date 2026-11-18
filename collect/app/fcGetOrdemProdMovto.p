{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetOrdemProdMovto MCE}
&ENDIF

def temp-table tt-reporte no-undo like rep-prod use-index codigo
    field it-oper      like oper-ord.it-codigo
    field cod-roteiro  like oper-ord.cod-roteiro
    field op-codigo    like oper-ord.op-codigo init 0
    field pto-controle like oper-ord.pto-controle
    field sequencia    like oper-ord.sequencia
    field nr-trans     like movto-estoq.nr-trans.

{include/i-freeac.i}

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.
    DEFINE VAR iPrimOrdManut        AS INTEGER      NO-UNDO.
    DEFINE VAR i-nrOrdProdu         AS INT          NO-UNDO.
    DEFINE VAR c-dscSituacao        AS CHAR         NO-UNDO.

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
    
            ASSIGN i-nrOrdProdu = oJsonPayloadObject:GetInteger("nrOrdProdu").
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
               
        EMPTY TEMP-TABLE tt-reporte.               
               
        FIND FIRST ord-prod NO-LOCK
            WHERE ord-prod.nr-ord-produ = i-nrOrdProdu NO-ERROR.               
        if avail ord-prod then do:
           for each  movto-estoq fields (nr-ord-produ   esp-docto   it-codigo)
                  use-index operacao
               where movto-estoq.nr-ord-produ = ord-prod.nr-ord-produ 
                 and movto-estoq.esp-docto    = 1 
                 and movto-estoq.it-codigo    =  ord-prod.it-codigo no-lock,
               first rep-prod of movto-estoq no-lock
               WHERE rep-prod.qt-estorno = 0.
               
               find tt-reporte where
                    tt-reporte.nr-reporte = rep-prod.nr-reporte no-error.
               if not avail tt-reporte then         
               create tt-reporte.
               buffer-copy rep-prod to tt-reporte
                    ASSIGN tt-reporte.nr-trans = movto-estoq.nr-trans.
           end.
        
           /*for each  rep-oper fields (nr-ord-produ   nr-reporte   it-codigo   op-codigo
                                      cod-roteiro    op-seq)
               where rep-oper.nr-ord-prod = ord-prod.nr-ord-prod no-lock,
               first rep-prod
               where rep-prod.nr-reporte  = rep-oper.nr-reporte no-lock:
               find tt-reporte where
                    tt-reporte.nr-reporte = rep-prod.nr-reporte no-error.
               if not avail tt-reporte then
                  create tt-reporte.
               buffer-copy rep-prod to tt-reporte
               assign tt-reporte.it-oper     = rep-oper.it-codigo
                      tt-reporte.op-codigo   = rep-oper.op-codigo
                      tt-reporte.cod-roteiro = rep-oper.cod-roteiro
                      tt-reporte.sequencia   = rep-oper.op-seq.
               for first oper-ord Fields(pto-controle nr-ord-prod op-codigo it-codigo cod-roteiro) where
                    oper-ord.nr-ord-prod = ord-prod.nr-ord-prod and
                    oper-ord.op-codigo   = rep-oper.op-codigo and
                    oper-ord.it-codigo   = rep-oper.it-codigo and
                    oper-ord.cod-roteiro = rep-oper.cod-roteiro no-lock.
                    assign tt-reporte.pto-controle = oper-ord.pto-controle. 
               end.      
           end. */
           
           FOR EACH tt-reporte NO-LOCK,
               FIRST ITEM OF tt-reporte NO-LOCK.

               oJsonOutput = NEW JsonObject().
               oJsonOutput:ADD("nrOrdProdu",      string(ord-prod.nr-ord-produ)).
               oJsonOutput:ADD("itCodigo",        tt-reporte.it-codigo).
               oJsonOutput:ADD("descItem",        ITEM.desc-item).
               oJsonOutput:ADD("qtOrdem",         ord-prod.qt-ordem).
               oJsonOutput:ADD("qtProduzida",     ord-prod.qt-produzida).
               oJsonOutput:ADD("qtRefugada",      ord-prod.qt-refugada).
               oJsonOutput:ADD("codEstabel",      ord-prod.cod-estabel).
               oJsonOutput:ADD("codDepos",        tt-reporte.cod-depos).         
               oJsonOutput:ADD("loteSerie",       tt-reporte.lote-serie).               
               oJsonOutput:ADD("codRefer",        tt-reporte.cod-refer).
               oJsonOutput:ADD("tipoConEst",      ITEM.tipo-con-est ).
               oJsonOutput:ADD("locUnica",        ITEM.loc-unica ).

               oJsonOutput:ADD("qtReporte",       tt-reporte.qt-reporte).
               oJsonOutput:ADD("nrReporte",       tt-reporte.nr-reporte).
               oJsonOutput:ADD("nroDocto",        tt-reporte.nro-docto).
               oJsonOutput:ADD("serie",           tt-reporte.serie).
               oJsonOutput:ADD("codLocaliz",      tt-reporte.cod-localiz).
               oJsonOutput:ADD("nrTrans",         tt-reporte.nr-trans).
               oJsonOutput:ADD("dtReporte",       tt-reporte.data).
               
               oJsonArray :ADD(oJsonOutput).           
           
           END.
        end.                 
               
               


        jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE). 

    END.

    RETURN 'OK':U.

END PROCEDURE.

