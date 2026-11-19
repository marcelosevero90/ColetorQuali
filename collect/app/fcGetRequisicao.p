{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetRequisicao MCE}
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

    DEFINE VAR nrReqIni             AS INTEGER      NO-UNDO.
    define var nrReqFim             AS INTEGER      NO-UNDO.
    define var dtReqIni             AS DATE         NO-UNDO.
    define var dtReqFim             AS DATE         NO-UNDO.
    define var estabIni             AS CHAR         NO-UNDO.
    define var estabFim             AS CHAR         NO-UNDO.
    define var requisitanteIni      AS CHAR         NO-UNDO.
    define var requisitanteFim      AS CHAR         NO-UNDO.


    // Criacao do Retorno 
    DEFINE VAR oJsonArray         AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput        AS JsonObject NO-UNDO.
    DEFINE VAR aJsonSaldosEstoque AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonSaldoEstoque  AS JsonObject NO-UNDO.
                                    
    
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
            
            IF VALID-OBJECT(oJsonPayloadObject) THEN DO:
                IF oJsonPayloadObject:Has("nrReqIni") THEN
                    ASSIGN nrReqIni = oJsonPayloadObject:GetInteger("nrReqIni") NO-ERROR.
                IF oJsonPayloadObject:Has("nrReqFim") THEN
                    ASSIGN nrReqFim = oJsonPayloadObject:GetInteger("nrReqFim") NO-ERROR.
                IF oJsonPayloadObject:Has("dtReqIni") THEN DO:
                    ASSIGN dtReqIni = oJsonPayloadObject:GetDate("dtReqIni") NO-ERROR.
                    IF dtReqIni = ? THEN
                        ASSIGN dtReqIni = DATE(oJsonPayloadObject:GetCharacter("dtReqIni")) NO-ERROR.
                END.
                IF oJsonPayloadObject:Has("dtReqFim") THEN DO:
                    ASSIGN dtReqFim = oJsonPayloadObject:GetDate("dtReqFim") NO-ERROR.
                    IF dtReqFim = ? THEN
                        ASSIGN dtReqFim = DATE(oJsonPayloadObject:GetCharacter("dtReqFim")) NO-ERROR.
                END.
                IF oJsonPayloadObject:Has("estabIni") THEN
                    ASSIGN estabIni = oJsonPayloadObject:GetCharacter("estabIni") NO-ERROR.
                IF oJsonPayloadObject:Has("estabFim") THEN
                    ASSIGN estabFim = oJsonPayloadObject:GetCharacter("estabFim") NO-ERROR.
                IF oJsonPayloadObject:Has("requisitanteIni") THEN
                    ASSIGN requisitanteIni = oJsonPayloadObject:GetCharacter("requisitanteIni") NO-ERROR.
                IF oJsonPayloadObject:Has("requisitanteFim") THEN
                    ASSIGN requisitanteFim = oJsonPayloadObject:GetCharacter("requisitanteFim") NO-ERROR.
            END.
        END.

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().

        FOR EACH requisicao NO-LOCK
            WHERE requisicao.tp-requis         = 1 /* Requisicao de estoque */
              AND requisicao.situacao          = 1 /* 1 = Aberto  */
              AND requisicao.estado            = 1  /*Aprovada*/  
              AND (IF estabIni <> "" AND estabIni <> ? THEN requisicao.cod-estabel >= estabIni ELSE TRUE)
              AND (IF estabFim <> "" AND estabFim <> ? THEN requisicao.cod-estabel <= estabFim ELSE TRUE)
              AND (IF nrReqIni > 0 THEN requisicao.nr-requis >= nrReqIni ELSE TRUE)
              AND (IF nrReqFim > 0 THEN requisicao.nr-requis <= nrReqFim ELSE TRUE)
              AND (IF dtReqIni <> ? THEN requisicao.dt-requis >= dtReqIni ELSE TRUE)
              AND (IF dtReqFim <> ? THEN requisicao.dt-requis <= dtReqFim ELSE TRUE)
              AND (IF requisitanteIni <> "" AND requisitanteIni <> ? THEN requisicao.nome-abrev >= requisitanteIni ELSE TRUE)
              AND (IF requisitanteFim <> "" AND requisitanteFim <> ? THEN requisicao.nome-abrev <= requisitanteFim ELSE TRUE),
            EACH it-requisicao NO-LOCK 
            WHERE it-requisicao.nr-requisicao = requisicao.nr-requisicao 
              AND it-requisicao.estado        = 1  /*Aprovada*/          
              AND it-requisicao.qt-A-Atender  > 0,
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

            ASSIGN aJsonSaldosEstoque = NEW JsonArray().

            FOR EACH saldo-estoq FIELDS(cod-estabel cod-depos lote dt-vali-lote cod-localiz cod-refer
                                        qtidade-atu qt-alocada qt-aloc-ped qt-aloc-prod it-codigo) NO-LOCK
                WHERE saldo-estoq.cod-estabel = it-requisicao.cod-estabel
                  AND saldo-estoq.it-codigo   = it-requisicao.it-codigo
                  AND saldo-estoq.qtidade-atu - (saldo-estoq.qt-alocada + saldo-estoq.qt-aloc-ped + saldo-estoq.qt-aloc-prod) > 0:

                oJsonSaldoEstoque = NEW JsonObject().
                oJsonSaldoEstoque:ADD("itCodigo"     , saldo-estoq.it-codigo).
                oJsonSaldoEstoque:ADD("codEstabel"   , saldo-estoq.cod-estabel).
                oJsonSaldoEstoque:ADD("codDepos"     , saldo-estoq.cod-depos).
                oJsonSaldoEstoque:ADD("lote"         , saldo-estoq.lote).
                oJsonSaldoEstoque:ADD("dtValiLote"   , saldo-estoq.dt-vali-lote).
                oJsonSaldoEstoque:ADD("codLocaliz"   , saldo-estoq.cod-localiz).
                oJsonSaldoEstoque:ADD("qtDisponivel" , saldo-estoq.qtidade-atu - (saldo-estoq.qt-alocada + saldo-estoq.qt-aloc-ped + saldo-estoq.qt-aloc-prod)).
                oJsonSaldoEstoque:ADD("codRefer"     , saldo-estoq.cod-refer).
                oJsonSaldoEstoque:ADD("qtAAtender"   , 0).
                oJsonSaldoEstoque:ADD("selecionado"  , 99).

                aJsonSaldosEstoque:ADD(oJsonSaldoEstoque).
            END.

            oJsonOutput:ADD("saldosEstoque", aJsonSaldosEstoque).

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
