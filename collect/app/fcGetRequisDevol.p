{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetRequisDevol MCE}
&ENDIF

{include/i-freeac.i}

/*
DEFINE TEMP-TABLE ttEstabelec NO-UNDO
    FIELD nrRequisicao      like it-requisicao.nr-Requis 
    FIELD dtRequisicao      like requisicao.dt-Requis  
    FIELD descItem          LIKE ITEM.desc-item
    FIELD situacao          like it-requisicao.situacao      
    FIELD itCodigo          like it-requisicao.it-Codigo      
    FIELD dtAtend           like it-requisicao.dt-Atend
    FIELD estado            like it-requisicao.estado        
    FIELD tpRequis          like it-requisicao.tp-Requis      
    FIELD codEstabel        like it-requisicao.cod-Estabel    
    FIELD qtRequisitada     like it-requisicao.qt-Requisitada 
    FIELD qtAtendida        like it-requisicao.qt-Atendida
    FIELD qtAAtender        like it-requisicao.qt-A-Atender
    FIELD codDepos          like it-requisicao.cod-Depos      
    FIELD lote              like it-requisicao.lote          
    FIELD qtDevolvida       like it-requisicao.qt-Devolvida   
    FIELD qtADevolver       like it-requisicao.qt-A-Devolver   
    FIELD codRefer          like it-requisicao.cod-Refer      
    FIELD codUnidNegoc      like it-requisicao.cod-Unid-Negoc  
    FIELD nomeAbrev         like it-requisicao.nome-Abrev     
    FIELD nrSequencia       like it-requisicao.Sequencia  . 
*/    
    

//function Dia2Plain returns character (input icTxt as character) FORWARD:

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.

    
    define var dtCorte              AS DATE         NO-UNDO.


    // Criacao do Retorno 
    DEFINE VAR oJsonArray   AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput  AS JsonObject NO-UNDO.
    DEFINE VAR aJsonMovtos  AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonMov     AS JsonObject NO-UNDO.
                                    
    
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
            
            IF oJsonPayloadObject:Has("dtCorte") THEN DO:
                ASSIGN dtCorte = oJsonPayloadObject:GetDate("dtCorte") NO-ERROR.
                IF dtCorte = ? THEN
                    ASSIGN dtCorte = DATE(oJsonPayloadObject:GetCharacter("dtCorte")) NO-ERROR.
            END.
            IF dtCorte = ? AND jsonInput:Has("dtCorte") THEN DO:
                ASSIGN dtCorte = jsonInput:GetDate("dtCorte") NO-ERROR.
                IF dtCorte = ? THEN
                    ASSIGN dtCorte = DATE(jsonInput:GetCharacter("dtCorte")) NO-ERROR.
            END.
            IF dtCorte = ? THEN
                ASSIGN dtCorte = TODAY - 1.
        END.

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().

        FOR EACH requisicao FIELDS(dt-Requis) NO-LOCK
            WHERE requisicao.tp-requis         = 1 /* Requisicao de estoque */
              //AND requisicao.situacao          > 1
              AND requisicao.estado            = 1  /*Aprovada*/ 
              AND requisicao.dt-requis        >= dtCorte
              /*AND requisicao.cod-estabel      >= estabIni
              AND requisicao.cod-estabel      <= estabFim
              AND requisicao.nr-requis        >= nrReqIni 
              AND requisicao.nr-requis        <= nrReqFim 
              AND requisicao.dt-requis        >= dtReqIni
              AND requisicao.dt-requis        <= dtReqFim
              AND requisicao.nome-abrev       >= requisitanteIni
              AND requisicao.nome-abrev       <= requisitanteFim*/ ,
            EACH it-requisicao NO-LOCK 
            WHERE it-requisicao.nr-requisicao = requisicao.nr-requisicao 
              AND it-requisicao.estado        = 1  /*Aprovada*/          
              AND it-requisicao.qt-a-devolver > 0,
            FIRST ITEM FIELDS(desc-item it-codigo) NO-LOCK
            WHERE ITEM.it-codigo = it-requisicao.it-codigo.

            oJsonOutput = NEW JsonObject().
            oJsonOutput:ADD("nrRequisicao" ,  it-requisicao.nr-Requis      ).
            oJsonOutput:ADD("dtRequisicao" ,  requisicao.dt-Requis      ).
            oJsonOutput:ADD("descItem"     ,  fn-free-accent(ITEM.desc-item)          ).
            oJsonOutput:ADD("situacao"     ,  it-requisicao.situacao          ).
            oJsonOutput:ADD("itCodigo"     ,  it-requisicao.it-Codigo          ).
            oJsonOutput:ADD("dtAtend"      ,  it-requisicao.dt-Atend           ).
            oJsonOutput:ADD("estado"       ,  it-requisicao.estado            ).
            oJsonOutput:ADD("tpRequis"     ,  it-requisicao.tp-Requis          ).
            oJsonOutput:ADD("codEstabel"   ,  it-requisicao.cod-Estabel        ).
            oJsonOutput:ADD("qtRequisitada",  it-requisicao.qt-Requisitada     ).
            oJsonOutput:ADD("qtAtendida"   ,  it-requisicao.qt-Atendida        ).
            oJsonOutput:ADD("qtAAtender"   ,  it-requisicao.qt-A-Atender        ).
            //oJsonOutput:ADD("codDepos"     ,  it-requisicao.cod-Depos          ).
            //oJsonOutput:ADD("lote"         ,  it-requisicao.lote              ).
            oJsonOutput:ADD("qtDevolvida"  ,  it-requisicao.qt-Devolvida       ).
            oJsonOutput:ADD("qtADevolver"  ,  it-requisicao.qt-A-Devolver       ).
            //oJsonOutput:ADD("codRefer"     ,  it-requisicao.cod-Refer          ).
            oJsonOutput:ADD("codUnidNegoc" ,  it-requisicao.cod-Unid-Negoc      ).
            oJsonOutput:ADD("nomeAbrev"    ,  it-requisicao.nome-Abrev         ).
            oJsonOutput:ADD("Sequencia"    ,  it-requisicao.Sequencia       ).

            ASSIGN aJsonMovtos = NEW JsonArray().

            FOR EACH movto-estoq NO-LOCK
                WHERE movto-estoq.cod-estabel = it-requisicao.cod-estabel
                  AND movto-estoq.it-codigo   = it-requisicao.it-codigo
                  AND movto-estoq.esp-docto   = 30
                  AND int(replace(movto-estoq.nro-docto,'.','')) = it-requisicao.nr-requis,
                FIRST saldo-estoq OF movto-estoq NO-LOCK:

                oJsonMov = NEW JsonObject().
                oJsonMov:ADD("itCodigo"     , saldo-estoq.it-codigo).
                oJsonMov:ADD("codEstabel"   , saldo-estoq.cod-estabel).
                oJsonMov:ADD("codDepos"     , saldo-estoq.cod-depos).
                oJsonMov:ADD("lote"         , saldo-estoq.lote).
                oJsonMov:ADD("dtValiLote"   , saldo-estoq.dt-vali-lote).
                oJsonMov:ADD("codLocaliz"   , saldo-estoq.cod-localiz).
                oJsonMov:ADD("qtDisponivel" , movto-estoq.quantidade).
                oJsonMov:ADD("codRefer"     , saldo-estoq.cod-refer).
                oJsonMov:ADD("dtTrans"      , movto-estoq.dt-trans).
                oJsonMov:ADD("qtADevolver"  , 0).

                aJsonMovtos:ADD(oJsonMov).
            END.

            oJsonOutput:ADD("movimentos", aJsonMovtos).

            oJsonArray :ADD(oJsonOutput).
        END.
        jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE). 
        

    END.

    RETURN 'OK':U.

END PROCEDURE.



/*function Dia2Plain returns character (input icTxt as character):
  define variable ocTxt as character no-undo.
  define variable i as integer no-undo.
  define variable iAsc as integer no-undo.
  define variable cDia as character no-undo.
  define variable cPlain as character no-undo.

  assign ocTxt = icTxt.
  repeat i = 1 to length(ocTxt):
  assign cDia = substring(ocTxt,i,1)
         cPlain = "".
    if asc(cDia) > 127
    then do:
      repeat iAsc = 65 to 90: /* A..Z */
        if compare(cDia, "eq" , chr(iAsc), "case-sensitive")
        then assign cPlain = chr(iAsc).
      end.
      repeat iAsc = 97 to 122: /* a..z */
        if compare(cDia, "eq" , chr(iAsc), "case-sensitive")
        then assign cPlain = chr(iAsc).
      end.
      if cPlain <> ""
      then assign substring(ocTxt,i,1) = cPlain.
    end.
  end.
  return ocTxt.
end.*/
