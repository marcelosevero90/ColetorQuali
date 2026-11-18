{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetDocFisico MCE}
&ENDIF

{include/i-freeac.i}

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.

    define var c-estab              AS CHAR         NO-UNDO.
    define var c-dsc-tp-nota        AS CHAR         NO-UNDO.


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
            
            ASSIGN c-estab             = oJsonPayloadObject:GetCharacter("codEstabel").
        END.

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().

        FOR EACH doc-fisico NO-LOCK
            WHERE doc-fisico.situacao       = 1 //nao atualizada
              AND doc-fisico.cod-estabel    = c-estab,
            FIRST emitente NO-LOCK
            WHERE emitente.cod-emitente = doc-fisico.cod-emitente.
            
            
            ASSIGN c-dsc-tp-nota = ''.
            CASE doc-fisico.tipo-nota:
                WHEN 1  THEN ASSIGN c-dsc-tp-nota = 'Compra'.
                WHEN 2  THEN ASSIGN c-dsc-tp-nota = 'Devolucao'.
                WHEN 3  THEN ASSIGN c-dsc-tp-nota = 'Transferencia'.
                WHEN 4  THEN ASSIGN c-dsc-tp-nota = 'Entrada Benef'.
                WHEN 5  THEN ASSIGN c-dsc-tp-nota = 'Retorno Benef'.
                WHEN 6  THEN ASSIGN c-dsc-tp-nota = 'Entrada Consig'.
                WHEN 7  THEN ASSIGN c-dsc-tp-nota = 'Fatura Consig'.
                WHEN 8  THEN ASSIGN c-dsc-tp-nota = 'Devolucao Consig'.
                WHEN 9  THEN ASSIGN c-dsc-tp-nota = 'Nota Rateio'.
                WHEN 10 THEN ASSIGN c-dsc-tp-nota = 'Rem Entrega Futura'.
                WHEN 11 THEN ASSIGN c-dsc-tp-nota = 'Rem Fat Antecipado'.
                
                WHEN 12 THEN ASSIGN c-dsc-tp-nota = 'Entrada Dep Fechado'.
                WHEN 13 THEN ASSIGN c-dsc-tp-nota = 'Retorno Dep Fechado'.
                WHEN 14 THEN ASSIGN c-dsc-tp-nota = 'Entrada Armazem Geral'.
                WHEN 15 THEN ASSIGN c-dsc-tp-nota = 'Retorno Armazem Geral'.            
            END CASE.
            
            

            oJsonOutput = NEW JsonObject().
            oJsonOutput:ADD("nroDocto" ,        doc-fisico.nro-docto      ).
            oJsonOutput:ADD("serieDocto" ,      doc-fisico.serie-docto      ).
            oJsonOutput:ADD("codEmitente"     , doc-fisico.cod-emitente          ).
            oJsonOutput:ADD("codEstabel"     ,  doc-fisico.cod-estabel          ).
            oJsonOutput:ADD("nomeEmit"     ,    fn-free-accent(emitente.nome-emit)).
            oJsonOutput:ADD("dtEmissao"      ,  doc-fisico.dt-emissao           ).
            oJsonOutput:ADD("dtTrans"       ,   doc-fisico.dt-trans            ).
            oJsonOutput:ADD("tipoNota"     ,    doc-fisico.tipo-nota          ).
            oJsonOutput:ADD("dscTipoNota"   ,   c-dsc-tp-nota        ).
            oJsonOutput:ADD("valorMercad",      doc-fisico.valor-mercad     ).
            oJsonOutput:ADD("cgc"   ,           emitente.cgc        ).            

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
