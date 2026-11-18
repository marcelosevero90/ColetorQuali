{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetItemDocFisico MCE}
&ENDIF

{include/i-freeac.i}

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.

    define var c-nro-docto          AS CHAR         NO-UNDO.
    define var c-serie-docto        AS CHAR         NO-UNDO.
    define var i-cod-emit           AS INT          NO-UNDO.
    define var i-tp-nota            AS INT          NO-UNDO.


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
            
            ASSIGN c-nro-docto         = oJsonPayloadObject:GetCharacter("nroDocto")
                   c-serie-docto       = oJsonPayloadObject:GetCharacter("serieDocto") 
                   i-cod-emit          = oJsonPayloadObject:GetInteger("codEmitente") 
                   i-tp-nota           = oJsonPayloadObject:GetInteger("tipoNota") .                                   
        END.

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().

        FIND FIRST doc-fisico NO-LOCK
            WHERE doc-fisico.serie-docto    = c-serie-docto
              AND doc-fisico.nro-docto      = c-nro-docto
              AND doc-fisico.cod-emitente   = i-cod-emit
              AND doc-fisico.tipo-nota      = i-tp-nota NO-ERROR.
        IF NOT AVAIL doc-fisico THEN DO:
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 17006
                   RowErrors.ErrorDescription = "Documento " + c-nro-docto + '/' + c-serie-docto + ' nÆo encontrado!' 
                   RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                   RowErrors.ErrorSubType     = "ERROR".  
                   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
            jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
            jsonOutput:ADD('message',           RowErrors.ErrorDescription).
            jsonOutput:ADD('type',              'ERROR').                    
            RETURN "NOK".
        END.
            
                        
        FOR EACH it-doc-fisico OF doc-fisico NO-LOCK
            WHERE it-doc-fisico.baixa-ce = YES
            ,FIRST ITEM OF it-doc-fisico NO-LOCK:                   
            
            FIND FIRST item-fornec NO-LOCK
                WHERE item-fornec.it-codigo     = it-doc-fisico.it-codigo
                  AND item-fornec.cod-emitente  = doc-fisico.cod-emitente NO-ERROR.
            

            oJsonOutput = NEW JsonObject().
            oJsonOutput:ADD("nroDocto" ,        it-doc-fisico.nro-docto        ).
            oJsonOutput:ADD("serieDocto" ,      it-doc-fisico.serie-docto      ).
            oJsonOutput:ADD("codEmitente"     , it-doc-fisico.cod-emitente     ).
            oJsonOutput:ADD("codEstabel"     ,  doc-fisico.cod-estabel         ).
            oJsonOutput:ADD("tipoNota"     ,    it-doc-fisico.tipo-nota        ).
            oJsonOutput:ADD("sequencia"     ,   it-doc-fisico.sequencia        ).            
            oJsonOutput:ADD("itCodigo"     ,    it-doc-fisico.it-codigo        ).
            oJsonOutput:ADD("descItem"     ,    fn-free-accent(ITEM.desc-item) ).
            oJsonOutput:ADD("unItem"     ,      ITEM.un                        ).
            oJsonOutput:ADD("unDoc"     ,       it-doc-fisico.un               ).
            oJsonOutput:ADD("quantidade"     ,  it-doc-fisico.quantidade       ).
            oJsonOutput:ADD("qtDoForn"     ,    it-doc-fisico.qt-do-forn       ).
            oJsonOutput:ADD("quantConf"     ,   it-doc-fisico.quant-conf       ).
            oJsonOutput:ADD("precoTotal"    ,   it-doc-fisico.preco-total[1]      ).
            oJsonOutput:ADD("precoUnit"     ,   it-doc-fisico.preco-unit[1]       ).
            oJsonOutput:ADD("itemDoForn"     ,  IF AVAIL item-fornec THEN item-fornec.item-do-forn ELSE ""          ).
            oJsonOutput:ADD("codRefer"     ,    it-doc-fisico.cod-refer           ).
            
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
