{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-action.i pi-find POST /~*}
{utp/ut-api-action.i pi-find GET /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
{include/i-license-manager.i fcGetItensChunk MCE}
&ENDIF

{include/i-freeac.i}

/*--------------------------------------------------------------------------
    API REST: fcGetItensChunk.p
    Objetivo: Carga progressiva fracionada (chunks) de itens para operacao offline.
              Utiliza Keyset Pagination indexada (B-Tree O(1)) por lastItCodigo.
    Filtro:   Itens ativos (cod-obsoleto = 1) e tipo-contr < 3 (base ConectColetor).
--------------------------------------------------------------------------*/

PROCEDURE pi-find:

    DEFINE INPUT  PARAM jsonInput   AS JsonObject NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray  NO-UNDO.

    DEFINE VAR iChunk               AS INTEGER    INITIAL 1 NO-UNDO.
    DEFINE VAR iPageSize            AS INTEGER    INITIAL 1000 NO-UNDO.
    DEFINE VAR cCodEstab            AS CHARACTER  NO-UNDO.
    DEFINE VAR c-ep-codigo          AS CHARACTER  NO-UNDO.
    DEFINE VAR cLastItCodigo        AS CHARACTER  NO-UNDO.
    DEFINE VAR cNextLastItCodigo    AS CHARACTER  NO-UNDO.
    DEFINE VAR iCount               AS INTEGER    INITIAL 0 NO-UNDO.
    DEFINE VAR lHasMore             AS LOGICAL    INITIAL NO NO-UNDO.

    DEFINE VAR oJsonArray           AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonItem            AS JsonObject NO-UNDO.

    jsonOutput = NEW JsonObject().
    oJsonArray = NEW JsonArray().

    ASSIGN c-ep-codigo   = jsonInput:GetCharacter("codEmpresa") NO-ERROR.
    IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
        ASSIGN c-ep-codigo = jsonInput:GetCharacter("epCodigo") NO-ERROR.

    IF jsonInput:Has("payload") THEN DO:
        aJsonPayloadArray = jsonInput:GetJsonArray("payload") NO-ERROR.
        IF VALID-OBJECT(aJsonPayloadArray) AND aJsonPayloadArray:LENGTH > 0 THEN
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(1) NO-ERROR.
        ELSE
            oJsonPayloadObject = jsonInput:GetJsonObject("payload") NO-ERROR.
    END.
    ELSE DO:
        oJsonPayloadObject = jsonInput.
    END.

    IF VALID-OBJECT(oJsonPayloadObject) THEN DO:
        IF oJsonPayloadObject:Has("chunk") THEN
            iChunk = oJsonPayloadObject:GetInteger("chunk") NO-ERROR.

        IF oJsonPayloadObject:Has("pageSize") THEN
            iPageSize = oJsonPayloadObject:GetInteger("pageSize") NO-ERROR.

        IF oJsonPayloadObject:Has("lastItCodigo") THEN
            cLastItCodigo = TRIM(oJsonPayloadObject:GetCharacter("lastItCodigo")) NO-ERROR.
        ELSE IF oJsonPayloadObject:Has("last_it_codigo") THEN
            cLastItCodigo = TRIM(oJsonPayloadObject:GetCharacter("last_it_codigo")) NO-ERROR.

        IF oJsonPayloadObject:Has("codEstabel") THEN
            cCodEstab = TRIM(oJsonPayloadObject:GetCharacter("codEstabel")) NO-ERROR.

        IF c-ep-codigo = "" OR c-ep-codigo = ? THEN DO:
            ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.
            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.
        END.
    END.

    IF iPageSize <= 0 OR iPageSize = ? THEN iPageSize = 1000.
    IF iChunk <= 0 OR iChunk = ? THEN iChunk = 1.

    FOR EACH ITEM NO-LOCK
       WHERE (IF cLastItCodigo <> "" AND cLastItCodigo <> ? THEN ITEM.it-codigo > cLastItCodigo ELSE TRUE)
         AND ITEM.cod-obsoleto = 1
         AND ITEM.tipo-contr < 3
       BY ITEM.it-codigo:

        ASSIGN iCount = iCount + 1.

        IF iCount > iPageSize THEN DO:
            ASSIGN lHasMore = YES.
            LEAVE.
        END.

        ASSIGN cNextLastItCodigo = ITEM.it-codigo.

        oJsonItem = NEW JsonObject().
        oJsonItem:ADD("codEmpresa",     c-ep-codigo).
        oJsonItem:ADD("codEstabel",     cCodEstab).
        oJsonItem:ADD("itCodigo",       ITEM.it-codigo).
        oJsonItem:ADD("descItem",       fn-free-accent(ITEM.desc-item)).
        oJsonItem:ADD("un",             (IF ITEM.un <> "" AND ITEM.un <> ? THEN ITEM.un ELSE "UN")).
        oJsonItem:ADD("tipoConEst",     ITEM.tipo-con-est).
        oJsonItem:ADD("locUnica",       ITEM.loc-unica).

        /* Código de Barras se existir em item-mat */
        FIND FIRST item-mat NO-LOCK WHERE item-mat.it-codigo = ITEM.it-codigo NO-ERROR.
        IF AVAILABLE item-mat AND item-mat.cod-ean <> "" AND item-mat.cod-ean <> ? THEN
            oJsonItem:ADD("codBarras", item-mat.cod-ean).
        ELSE
            oJsonItem:ADD("codBarras", "").

        /* Deposito e Localizacao padrao */
        IF cCodEstab <> "" AND cCodEstab <> ? THEN DO:
            FIND FIRST item-uni-estab NO-LOCK
                 WHERE item-uni-estab.cod-estabel = cCodEstab
                   AND item-uni-estab.it-codigo = ITEM.it-codigo NO-ERROR.
            IF AVAILABLE item-uni-estab THEN DO:
                oJsonItem:ADD("depositoPad", (IF item-uni-estab.deposito-pad <> ? THEN item-uni-estab.deposito-pad ELSE "")).
                oJsonItem:ADD("codLocaliz",   (IF item-uni-estab.cod-localiz <> ? THEN item-uni-estab.cod-localiz ELSE "")).
            END.
            ELSE DO:
                oJsonItem:ADD("depositoPad", (IF ITEM.deposito-pad <> ? THEN ITEM.deposito-pad ELSE "")).
                oJsonItem:ADD("codLocaliz",   (IF ITEM.cod-localiz <> ? THEN ITEM.cod-localiz ELSE "")).
            END.
        END.
        ELSE DO:
            oJsonItem:ADD("depositoPad", (IF ITEM.deposito-pad <> ? THEN ITEM.deposito-pad ELSE "")).
            oJsonItem:ADD("codLocaliz",   (IF ITEM.cod-localiz <> ? THEN ITEM.cod-localiz ELSE "")).
        END.

        oJsonArray:ADD(oJsonItem).
    END.

    jsonOutput:ADD("chunk",        iChunk).
    jsonOutput:ADD("pageSize",     iPageSize).
    jsonOutput:ADD("total",        oJsonArray:LENGTH).
    jsonOutput:ADD("hasMore",      lHasMore).
    IF lHasMore THEN
        jsonOutput:ADD("lastItCodigo", cNextLastItCodigo).
    ELSE
        jsonOutput:AddNull("lastItCodigo").

    jsonOutput:ADD("items",        oJsonArray).

END PROCEDURE.
