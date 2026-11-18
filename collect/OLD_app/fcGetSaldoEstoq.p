{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetSaldoEstoq MCE}
&ENDIF

{include/i-freeac.i}

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.

    define var cEstabIni             AS CHAR         NO-UNDO.
    define var cEstabFim             AS CHAR         NO-UNDO.
    define var cItemIni              AS CHAR         NO-UNDO.
    define var cItemFim              AS CHAR         NO-UNDO.
    define var cDepIni               AS CHAR         NO-UNDO.
    define var cDepFim               AS CHAR         NO-UNDO.
    define var cLocalIni             AS CHAR         NO-UNDO.
    define var cLocalFim             AS CHAR         NO-UNDO.
    define var cLoteIni              AS CHAR         NO-UNDO.
    define var cLoteFim              AS CHAR         NO-UNDO.
    define var cReferIni             AS CHAR         NO-UNDO.
    define var cReferFim             AS CHAR         NO-UNDO.


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
    
             ASSIGN cEstabIni      = oJsonPayloadObject:GetCharacter("cEstabIni") 
                    cEstabFim      = oJsonPayloadObject:GetCharacter("cEstabFim")
                    cItemIni       = oJsonPayloadObject:GetCharacter("cItemIni")
                    cItemFim       = oJsonPayloadObject:GetCharacter("cItemFim")
                    cDepIni        = oJsonPayloadObject:GetCharacter("cDepIni")
                    cDepFim        = oJsonPayloadObject:GetCharacter("cDepFim")
                    cLocalIni      = oJsonPayloadObject:GetCharacter("cLocalIni")
                    cLocalFim      = oJsonPayloadObject:GetCharacter("cLocalFim")
                    cLoteIni       = oJsonPayloadObject:GetCharacter("cLoteIni")          
                    cLoteFim       = oJsonPayloadObject:GetCharacter("cLoteFim")         
                    cReferIni      = oJsonPayloadObject:GetCharacter("cReferIni")  
                    cReferFim      = oJsonPayloadObject:GetCharacter("cReferFim").
        END.

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().

        FOR EACH saldo-estoq NO-LOCK
            WHERE saldo-estoq.it-codigo         >= cItemIni
              AND saldo-estoq.it-codigo         <= cItemFim
              AND saldo-estoq.cod-estabel       >= cEstabIni
              AND saldo-estoq.cod-estabel       <= cEstabFim
              AND saldo-estoq.cod-depos         >= cDepIni   
              AND saldo-estoq.cod-depos         <= cDepFim   
              AND saldo-estoq.cod-localiz       >= cLocalIni 
              AND saldo-estoq.cod-localiz       <= cLocalFim 
              AND saldo-estoq.lote              >= cLoteIni  
              AND saldo-estoq.lote              <= cLoteFim  
              AND saldo-estoq.cod-refer         >= cReferIni 
              AND saldo-estoq.cod-refer         <= cReferFim ,
            FIRST ITEM FIELDS(desc-item it-codigo) NO-LOCK
            WHERE ITEM.it-codigo = saldo-estoq.it-codigo.

            oJsonOutput = NEW JsonObject().
            oJsonOutput:ADD("itCodigo",              saldo-estoq.it-codigo     ).
            oJsonOutput:ADD("codEstab",              saldo-estoq.cod-estabel   ).
            oJsonOutput:ADD("codDep",                saldo-estoq.cod-depos      ).
            oJsonOutput:ADD("codLocal",              saldo-estoq.cod-localiz   ).
            oJsonOutput:ADD("lote",                  saldo-estoq.lote          ).
            oJsonOutput:ADD("codRefer",              saldo-estoq.cod-refer     ).
            oJsonOutput:ADD("descItem",              ITEM.desc-item             ).
            oJsonOutput:ADD("qtAlocada",             saldo-estoq.qt-alocada    ).
            oJsonOutput:ADD("qtidadeAtu",            saldo-estoq.qtidade-atu    ).
            oJsonOutput:ADD("qtAlocPed",             saldo-estoq.qt-aloc-ped   ).
            oJsonOutput:ADD("qtAlocProd",            saldo-estoq.qt-aloc-prod    ).
            oJsonOutput:ADD("dtValiLote",            saldo-estoq.dt-vali-lote   ).
            oJsonOutput:ADD("qtDisponivelCalc",      saldo-estoq.qtidade-atu - (saldo-estoq.qt-alocada      +
                                                                                saldo-estoq.qt-aloc-ped     +            
                                                                                saldo-estoq.qt-aloc-prod)).

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
