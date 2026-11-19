{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetSaldoEstoqEstabItem MCE}
&ENDIF

{include/i-freeac.i}

 

//function Dia2Plain returns character (input icTxt as character) FORWARD:

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.

    define var cEstab               AS CHAR         NO-UNDO.
    define var cItCodigo            AS CHAR         NO-UNDO.


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
            
            ASSIGN cEstab               = oJsonPayloadObject:GetCharacter("codEstabel") 
                   cItCodigo            = oJsonPayloadObject:GetCharacter("itCodigo").

        END.

        ASSIGN oJsonArray  = NEW JsonArray()
               //oJsonOutput = NEW JsonObject()
            .

        FOR EACH saldo-estoq FIELDS(cod-estabel cod-depos lote dt-vali-lote cod-localiz cod-refer
                                    qtidade-atu qt-alocada qt-aloc-ped qt-aloc-prod it-codigo) NO-LOCK
            WHERE (IF cEstab <> "" AND cEstab <> ? THEN saldo-estoq.cod-estabel = cEstab ELSE TRUE)
              AND saldo-estoq.it-codigo     = cItCodigo 
              AND saldo-estoq.qtidade-atu - (saldo-estoq.qt-alocada + saldo-estoq.qt-aloc-ped + saldo-estoq.qt-aloc-prod) > 0
            .

            oJsonOutput = NEW JsonObject().

            oJsonOutput:ADD("itCodigo" ,      saldo-estoq.it-codigo ).
            oJsonOutput:ADD("codEstabel" ,    saldo-estoq.cod-estabel     ).
            oJsonOutput:ADD("codDepos" ,      saldo-estoq.cod-depos    ).
            oJsonOutput:ADD("lote" ,          saldo-estoq.lote    ).
            oJsonOutput:ADD("dtValiLote" ,    saldo-estoq.dt-vali-lote     ).
            oJsonOutput:ADD("codLocaliz" ,    saldo-estoq.cod-localiz   ).
            oJsonOutput:ADD("qtDisponivel" ,  saldo-estoq.qtidade-atu - (saldo-estoq.qt-alocada + saldo-estoq.qt-aloc-ped + saldo-estoq.qt-aloc-prod)    ).
            oJsonOutput:ADD("codRefer" ,      saldo-estoq.cod-refer   ).            
            oJsonOutput:ADD("qtAAtender" ,    0  ).
            oJsonOutput:ADD("selecionado" ,   99  ).
            

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
