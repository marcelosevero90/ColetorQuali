{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetPedVendaAvalCred PDP}
&ENDIF

{include/i-freeac.i}

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.

    define var cCodEstabel          AS CHAR         NO-UNDO.
    define var ddt-implant          AS DATE         NO-UNDO.
    define var ddt-entrega          AS DATE         NO-UNDO.
    
    define var c-dscSitPed          AS CHAR         NO-UNDO.
    define var c-dscSitAval         AS CHAR         NO-UNDO.
    
    // Criacao do Retorno 
    DEFINE VAR oJsonArray   AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput  AS JsonObject NO-UNDO.

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
        
        ASSIGN cCodEstabel   = oJsonPayloadObject:GetCharacter("codEstabel")
               ddt-implant   = oJsonPayloadObject:GetDate("dtImplant")
               ddt-entrega   = oJsonPayloadObject:GetDate("dtEntrega").
    END.

    ASSIGN oJsonArray  = NEW JsonArray()
           oJsonOutput = NEW JsonObject().
           
    FOR EACH ped-venda NO-LOCK
        WHERE ped-venda.dt-implant      >= ddt-implant          
          AND ped-venda.cod-sit-ped     < 4
          AND (ped-venda.cod-sit-aval   = 1
           OR  ped-venda.cod-sit-aval   > 4)
          AND ped-venda.dt-entrega      >= ddt-entrega
          AND ped-venda.vl-liq-abe      > 0
          AND (IF cCodEstabel <> "" THEN
                 ped-venda.cod-estabel     = cCodEstabel
               ELSE TRUE),
          FIRST emitente NO-LOCK
          WHERE emitente.nome-abrev = ped-venda.nome-abrev.
          
          ASSIGN c-dscSitPed    = ''
                 c-dscSitAval   = ''.                 
                 
        CASE ped-venda.cod-sit-ped:
            WHEN 1 THEN c-dscSitPed = 'Aberto'.
            WHEN 2 THEN c-dscSitPed = 'At Parcial'.
            WHEN 3 THEN c-dscSitPed = 'At Total'.
            WHEN 4 THEN c-dscSitPed = 'Pendente'.
            WHEN 5 THEN c-dscSitPed = 'Suspenso'.
            WHEN 6 THEN c-dscSitPed = 'Cancelado'.
            WHEN 7 THEN c-dscSitPed = 'Fatur Balc∆o'.        
        END CASE.
          
        CASE ped-venda.cod-sit-aval:
            WHEN 1 THEN c-dscSitAval = 'N∆o Avaliado'.
            WHEN 2 THEN c-dscSitAval = 'Avaliado'.
            WHEN 3 THEN c-dscSitAval = 'Aprovado'.
            WHEN 4 THEN c-dscSitAval = 'N∆o Aprovado'.
            WHEN 5 THEN c-dscSitAval = 'Pendente Info'.
            WHEN 6 THEN c-dscSitAval = 'Em An†lise'.        
        END CASE.
                             
        oJsonOutput = NEW JsonObject().            
        oJsonOutput:ADD("nomeAbrev" ,       ped-venda.nome-abrev).
        oJsonOutput:ADD("nomeEmit" ,        fn-free-accent(emitente.nome-emit)).
        oJsonOutput:ADD("nrPedCli",         ped-venda.nr-pedcli ).
        oJsonOutput:ADD("nrPedido" ,        ped-venda.nr-pedido).
        oJsonOutput:ADD("codSitPed" ,       ped-venda.cod-sit-ped). 
        oJsonOutput:ADD("dscSitPed" ,       fn-free-accent(c-dscSitPed)).
        oJsonOutput:ADD("codEstabel" ,      ped-venda.cod-estabel).
        oJsonOutput:ADD("codSitAval" ,      ped-venda.cod-sit-aval).
        oJsonOutput:ADD("dscSitAval" ,      fn-free-accent(c-dscSitAval)).
        oJsonOutput:ADD("dtEntrega",        ped-venda.dt-entrega).
        oJsonOutput:ADD("dtImplant",        ped-venda.dt-implant).
        oJsonOutput:ADD("noAbRepPri",       fn-free-accent(ped-venda.no-ab-reppri)).
        oJsonOutput:ADD("vlLiqAbe",         ped-venda.vl-liq-abe).
        oJsonOutput:ADD("codEmitente" ,     ped-venda.cod-emitente).
                
        oJsonArray :ADD(oJsonOutput).        
    END.
    
    jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE).

    RETURN 'OK':U.

END PROCEDURE.



