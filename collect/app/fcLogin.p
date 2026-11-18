{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-create POST /~*}
{utp/ut-api-notfound.i}

{cdp/cdcfgman.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
{include/i-license-manager.i fcLogin MCE}
&ENDIF


PROCEDURE pi-create:

    DEFINE  INPUT PARAM jsonInput   AS JsonObject NO-UNDO.
    DEFINE  OUTPUT PARAM jsonOutput AS JsonObject NO-UNDO.

    DEFINE VARIABLE oAppError       AS Progress.Lang.AppError NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.

    DEFINE VAR aJsonCompons         AS JsonArray    NO-UNDO.
    DEFINE VAR oJsonCompEstrut      AS JsonObject   NO-UNDO.

    DEFINE VAR iContPayload         AS INT          NO-UNDO.
    DEFINE VAR c-Usuario            AS CHAR         NO-UNDO.
    DEFINE VAR c-Senha              AS CHAR         NO-UNDO.
    DEFINE VAR c-EstabPad           AS CHAR         NO-UNDO.
    DEFINE VAR c-Erro               AS CHAR         NO-UNDO.


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

        ASSIGN c-Usuario = oJsonPayloadObject:GetCharacter("usuario").
               c-Senha   = oJsonPayloadObject:GetCharacter("senha").
    END.

    ASSIGN c-Erro = "".
    
    FOR FIRST usuar_mestre
        WHERE usuar_mestre.cod_usuario = c-Usuario NO-LOCK:
    END.
    IF NOT AVAIL usuar_mestre THEN
        ASSIGN c-Erro = "Usuario nao cadastrado!".
        
    ELSE IF usuar_mestre.ind_tip_aces_usuar = "Externo" THEN
        RUN LogonValidaUsuarioSO (INPUT  c-Usuario,
                                  INPUT  c-Senha,
                                  OUTPUT c-Erro).
    ELSE IF BASE64-ENCODE(sha1-DIGEST(LC(c-Senha))) <> usuar_mestre.cod_senha THEN
        ASSIGN c-Erro = "Falha na autentica‡Æo, Senha Inv lida!".
      
    IF c-Erro <> "" THEN DO:
        ASSIGN oAppError = NEW Progress.Lang.AppError().     
        oAppError:AddMessage(c-Erro, 1).
        jsonOutput = JsonAPIResponseBuilder:asError(oAppError, 401).
        RETURN "NOK".
    END.

    ASSIGN c-EstabPad = "".
    FOR FIRST usuar_mestre FIELDS(cod_usuar cod_livre_2) NO-LOCK
        WHERE usuar_mestre.cod_usuar                     = c-Usuario 
          AND substring(usuar_mestre.cod_livre_2,50,5) <> '' . 
        ASSIGN c-EstabPad = substring(usuar_mestre.cod_livre_2,50,5).
    END.
    IF NOT AVAIL usuar_mestre THEN DO:
        FOR FIRST usuar-mater NO-LOCK
            WHERE usuar-mater.cod-usuar = c-Usuario.
            ASSIGN c-EstabPad = SUBSTRING(usuar-mater.char-1,16,3).
        END.
        IF NOT AVAIL usuar-mater OR c-EstabPad = '' THEN DO:
            FOR FIRST param-estoq FIELDS(estabel-pad) NO-LOCK.
                ASSIGN c-EstabPad = param-estoq.estabel-pad.
            END.
        END.
    END.
    ASSIGN c-EstabPad = TRIM(c-EstabPad).

    
    jsonOutput = NEW JsonObject().
    jsonOutput:ADD('detailedMessage',   'Login V lido!').
    jsonOutput:ADD('code',              '0').
    jsonOutput:ADD('message',           c-EstabPad).
    jsonOutput:ADD('type',              'OK').

    CATCH erro AS Progress.Lang.Error:
        RUN setErrorResponse(erro:GetMessage(1), OUTPUT jsonOutput).
    END.


END PROCEDURE.


PROCEDURE LogonValidaUsuarioSO:

    DEFINE INPUT  PARAMETER pcUsuario AS CHAR NO-UNDO.
    DEFINE INPUT  PARAMETER pcSenha   AS CHAR NO-UNDO.
    DEFINE OUTPUT PARAMETER pcRetorno AS CHAR NO-UNDO.
                    
    DEFINE VARIABLE cDomain          AS CHARACTER FORMAT "X(15)" NO-UNDO.
    DEFINE VARIABLE idwLogonType     AS INTEGER                  NO-UNDO.
    DEFINE VARIABLE idwLogonProvider AS INTEGER                  NO-UNDO.
    DEFINE VARIABLE mphToken         AS MEMPTR                   NO-UNDO.
    DEFINE VARIABLE intResult        AS INTEGER                  NO-UNDO.
    
    ASSIGN pcUsuario = REPLACE(pcUsuario,"/","\").

    IF NUM-ENTRIES(pcUsuario,"\") > 1 THEN DO:

        ASSIGN cDomain    = ENTRY(1,pcUsuario,"\")
               pcUsuario  = ENTRY(2,pcUsuario,"\").

    END.
    
    ASSIGN SET-SIZE(mphToken) = 32
           idwLogonType       = 2
           idwLogonProvider   = 0.
    
    RUN LogonUserA (INPUT pcUsuario,
                    INPUT cDomain,
                    INPUT pcSenha,
                    INPUT idwLogonType,
                    INPUT idwLogonProvider,
                    INPUT mphToken,
                    OUTPUT intResult).
    
    IF intResult > 0 THEN
        ASSIGN pcRetorno = "".
    ELSE
        ASSIGN pcRetorno = "Falha na autentica‡Æo, senha invalida".

END PROCEDURE.

PROCEDURE LogonUserA EXTERNAL "ADVAPI32.DLL":
    DEFINE INPUT PARAMETER lpszUserName AS CHARACTER NO-UNDO.
    DEFINE INPUT PARAMETER lpszDomain AS CHARACTER NO-UNDO.
    DEFINE INPUT PARAMETER lpszPassword AS CHARACTER NO-UNDO.
    DEFINE INPUT PARAMETER dwLogonType AS LONG NO-UNDO.
    DEFINE INPUT PARAMETER dwLogonProvider AS LONG NO-UNDO.
    DEFINE INPUT PARAMETER phToken AS MEMPTR NO-UNDO.
    DEFINE RETURN PARAMETER intResult AS SHORT NO-UNDO.
END PROCEDURE.
