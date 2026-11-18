{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcSetAprovReprovPedVenda PDP}
&ENDIF

{cdp/cdapi090def.i}

DEF TEMP-TABLE tt-ped-item-cotas NO-UNDO
    FIELD nr-sequencia AS INT 
    FIELD it-codigo    AS CHAR
    FIELD cod-refer    AS CHAR.

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.
    DEFINE VAR iContSE              AS INTEGER      NO-UNDO.

    // Criacao do Retorno 
    DEFINE VAR oJsonArray           AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput          AS JsonObject NO-UNDO.
    DEFINE VAR oJsonSaldoEst        AS JsonObject NO-UNDO.
    
    DEFINE VAR arJsonArrEstoq       AS JsonArray    NO-UNDO.

    define var  i-TpOper        as INT  no-undo.
    define var  c-nomeAbrev     as char no-undo.
    define var  c-nrPedCli      as char no-undo.
    define var  c-narrativa     as char no-undo.
    define var  ddtAprova       as DATE no-undo.
    define var  c-CodUsuario    as char no-undo.
    
    define var  h-bodi605       as HANDLE no-undo.
    define var  h-pdapi513e     as HANDLE no-undo.
    define var  h-bodi261       as HANDLE no-undo.
    define var  h-bodi159cal    as HANDLE no-undo.
    define var  h-bodi159mps    as HANDLE no-undo.
    define var  c-opcao-mp      AS CHAR   no-undo.
                           

    DEFINE VAR c-erros-lista as char no-undo.
    
    
    /*bloco:
    DO ON ERROR UNDO, RETURN 'NOK'
       ON STOP  UNDO, RETURN 'NOK'.*/

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

            ASSIGN  i-TpOper        = oJsonPayloadObject:GetInteger("tpOper")
                    c-nomeAbrev     = oJsonPayloadObject:GetCharacter("nomeAbrev")
                    c-nrPedCli      = oJsonPayloadObject:GetCharacter("nrPedCli")
                    c-narrativa     = oJsonPayloadObject:GetCharacter("narrativa")
                    c-CodUsuario    = oJsonPayloadObject:GetCharacter("codUsuario")
                    ddtAprova       = oJsonPayloadObject:GetDate("dtAprova") .
        END.                                            
        
        EMPTY TEMP-TABLE RowErrors.
        
        FIND FIRST ped-venda NO-LOCK
            WHERE ped-venda.nome-abrev  = c-nomeAbrev
              AND ped-venda.nr-pedcli   = c-nrPedCli NO-ERROR.
        IF NOT AVAIL ped-venda THEN DO:
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   c-erros-lista).
            jsonOutput:ADD('code',              '17006').
            jsonOutput:ADD('message',           c-erros-lista).
            jsonOutput:ADD('type',              'ERROR').                    
            RETURN "OK".             
        END.
        
        IF i-TpOper <> 1 AND i-TpOper <> 2 THEN DO:
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   'Tipo da opera‡Æo ' + string(i-TpOper) + ' inv lido!' ).
            jsonOutput:ADD('code',              '17006').
            jsonOutput:ADD('message',           'Tipo da opera‡Æo ' + string(i-TpOper) + ' inv lido!').
            jsonOutput:ADD('type',              'ERROR').                    
            RETURN "OK".           
        END.

        EMPTY TEMP-TABLE tt-ped-item-cotas.
        
        FIND FIRST param-global NO-LOCK NO-ERROR.
        FIND FIRST para-ped     NO-LOCK NO-ERROR.
        
        find current ped-venda EXCLUSIVE-LOCK NO-ERROR.
        
        
        IF i-TpOper = 1 THEN DO: //aprova
                
            if  ped-venda.cod-sit-ped < 3 THEN do:
                assign ped-venda.desc-forc-cr = c-narrativa
                       ped-venda.dt-apr-cred  = ddtAprova
                       ped-venda.cod-sit-aval = 3
                       ped-venda.quem-aprovou = c-CodUsuario.

                IF NOT AVAIL para-ped THEN
                    FIND FIRST para-ped NO-LOCK NO-ERROR.

                IF SUBSTRING(para-ped.char-1,64,3) = "YES" THEN DO: /* Verifica se o par³metro de hist½rico de pedido esta ativo no PD0301 */

                    IF NOT VALID-HANDLE(h-bodi605) THEN                                 
                       RUN dibo/bodi605.p PERSISTENT SET h-bodi605.                     
                                                                                        
                    RUN logCredito IN h-bodi605 (INPUT ped-venda.nr-pedcli,             
                                                 INPUT ped-venda.nome-abrev).           
                                                                                        
                    IF VALID-HANDLE(h-bodi605) THEN DELETE PROCEDURE h-bodi605.
                END.

                IF NOT VALID-HANDLE(h-pdapi513e) THEN                               
                   RUN pdp/pdapi513e.p PERSISTENT SET h-pdapi513e.                  
                                                                                    
                RUN piMandaEmailCredito IN h-pdapi513e (INPUT ped-venda.nr-pedcli,  
                                                        INPUT ped-venda.nome-abrev).
                                                                                    
                IF VALID-HANDLE(h-pdapi513e) THEN DELETE PROCEDURE h-pdapi513e.

                /* Atualiza‡Æo de Cotas */
                IF AVAIL param-global AND
                   param-global.modulo-08 THEN DO:

                   IF  NOT VALID-HANDLE(h-bodi261) OR 
                       h-bodi261:TYPE      <> "PROCEDURE":U OR 
                       h-bodi261:FILE-NAME <> "dibo/bodi261.p":U THEN 
                       RUN dibo/bodi261.p PERSISTENT SET h-bodi261 NO-ERROR.

                    IF ped-venda.cod-sit-com <> 1 THEN 
                       RUN setarLogAtualizacao IN h-bodi261.     
                    RUN atualizarCotasPedido IN h-bodi261(INPUT ROWID(ped-venda),
                                                          INPUT 1, /*atualiza*/
                                                          INPUT TABLE tt-ped-item-cotas).

                   IF VALID-HANDLE(h-bodi261) THEN DO:
                      DELETE PROCEDURE h-bodi261.
                      ASSIGN h-bodi261 = ?.
                   END.    
                END.

                /* antigo cd4100*/
                IF  NOT VALID-HANDLE(h-bodi159cal) OR 
                    h-bodi159cal:TYPE      <> "PROCEDURE":U OR 
                    h-bodi159cal:FILE-NAME <> "dibo/bodi159cal.p":U THEN 
                    RUN dibo/bodi159cal.p PERSISTENT SET h-bodi159cal.
                RUN setInvoicingAvaiable in h-bodi159cal(INPUT ROWID(ped-venda)).
                IF VALID-HANDLE(h-bodi159cal) THEN DO:
                   DELETE PROCEDURE h-bodi159cal.
                   ASSIGN h-bodi159cal = ?.
                END.    

                if param-global.modulo-mp then do:
                   c-opcao-mp = "Modifica".
                   if  not valid-handle(h-bodi159mps) or
                      h-bodi159mps:type      <> "PROCEDURE":U or
                      h-bodi159mps:file-name <> "dibo/bodi159mps.p":U then
                      run dibo/bodi159mps.p persistent set h-bodi159mps.
                      run pi-transacao-mp in h-bodi159mps(input rowid(ped-venda),
                                                          input rowid(ped-venda),
                                                          input "ModificarPedido":U).

                   if  valid-handle(h-bodi159mps) then do:
                       delete procedure h-bodi159mps.
                       assign h-bodi159mps = ?.
                   end.     
                end.   
                {cdp/cdapi090a.i "SCI" "CREATE" "PED-VENDA" "TP4"}
            end.
        END.
        ELSE 
        IF i-TpOper = 2 THEN DO: //reprova
        
            if  ped-venda.cod-sit-ped < 3 THEN do:
                assign ped-venda.desc-bloq-cr = c-narrativa
                       ped-venda.dt-apr-cred  = ddtAprova
                       ped-venda.cod-sit-aval = 4 /* simula uma suspens’o */
                       ped-venda.quem-aprovou = c-CodUsuario.
                            

               IF NOT AVAIL para-ped THEN
                   FIND FIRST para-ped NO-LOCK NO-ERROR.

               IF SUBSTRING(para-ped.char-1,64,3) = "YES" THEN DO: /* Verifica se o par³metro de hist½rico de pedido esta ativo no PD0301 */

                   IF NOT VALID-HANDLE(h-bodi605) THEN                                 
                      RUN dibo/bodi605.p PERSISTENT SET h-bodi605.                     
                                                                                      
                   RUN logCredito IN h-bodi605 (INPUT ped-venda.nr-pedcli,             
                                                INPUT ped-venda.nome-abrev).           
                                                                                      
                   IF VALID-HANDLE(h-bodi605) THEN DELETE PROCEDURE h-bodi605.
               END.

               IF NOT VALID-HANDLE(h-pdapi513e) THEN                               
                  RUN pdp/pdapi513e.p PERSISTENT SET h-pdapi513e.                  
                                                                                  
               RUN piMandaEmailCredito IN h-pdapi513e (INPUT ped-venda.nr-pedcli,  
                                                       INPUT ped-venda.nome-abrev).

               IF VALID-HANDLE(h-pdapi513e) THEN DELETE PROCEDURE h-pdapi513e.

               /* Atualiza»’o de Cotas */
               IF AVAIL param-global AND
                  param-global.modulo-08 THEN DO:

                  IF  NOT VALID-HANDLE(h-bodi261) OR 
                      h-bodi261:TYPE      <> "PROCEDURE":U OR 
                      h-bodi261:FILE-NAME <> "dibo/bodi261.p":U THEN 
                      RUN dibo/bodi261.p PERSISTENT SET h-bodi261 NO-ERROR.

                  IF ped-venda.cod-sit-com <> 1 THEN 
                     RUN setarLogAtualizacao IN h-bodi261.     
                  RUN atualizarCotasPedido IN h-bodi261(INPUT ROWID(ped-venda),
                                                        INPUT 1,
                                                        INPUT TABLE tt-ped-item-cotas). /* a bo verifica se estÿ 
                                                                                           reprov por cr²dito */
                  IF VALID-HANDLE(h-bodi261) THEN DO:
                     DELETE PROCEDURE h-bodi261.
                     ASSIGN h-bodi261 = ?.
                  END.    
               END.

               /* antigo cd4100*/
               IF  NOT VALID-HANDLE(h-bodi159cal) OR 
                   h-bodi159cal:TYPE      <> "PROCEDURE":U OR 
                   h-bodi159cal:FILE-NAME <> "dibo/bodi159cal.p":U THEN 
                   RUN dibo/bodi159cal.p PERSISTENT SET h-bodi159cal.
               RUN setInvoicingAvaiable in h-bodi159cal(INPUT ROWID(ped-venda)).
               IF VALID-HANDLE(h-bodi159cal) THEN DO:
                  DELETE PROCEDURE h-bodi159cal.
                  ASSIGN h-bodi159cal = ?.
               END.    


               ASSIGN c-opcao-mp = "Modifica". 
               if  not valid-handle(h-bodi159mps) or
                   h-bodi159mps:type      <> "PROCEDURE":U or
                   h-bodi159mps:file-name <> "dibo/bodi159mps.p":U then
                   run dibo/bodi159mps.p persistent set h-bodi159mps.
               run pi-transacao-mp in h-bodi159mps(input rowid(ped-venda),
                                                   input rowid(ped-venda),
                                                   input "ModificarPedido":U).

               if  valid-handle(h-bodi159mps) then do:
                   delete procedure h-bodi159mps.
                   assign h-bodi159mps = ?.
               end.

               {cdp/cdapi090a.i "SCI" "DELETE" "PED-VENDA" "TP4"}        
        
            END.
        END.
            
        find current ped-venda NO-LOCK NO-ERROR.        
                   
        IF CAN-FIND(FIRST RowErrors
                    WHERE RowErrors.ErrorSubType = "ERROR") THEN DO:

            ASSIGN c-erros-lista = ''.        
            FOR EACH RowErrors:
                ASSIGN c-erros-lista = c-erros-lista + RowErrors.ErrorDescription + '-'.
            END.
            ASSIGN c-erros-lista = SUBSTRING(c-erros-lista,1,LENGTH(c-erros-lista) - 1).
   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   c-erros-lista).
            jsonOutput:ADD('code',              '17006').
            jsonOutput:ADD('message',           c-erros-lista).
            jsonOutput:ADD('type',              'ERROR').                    
            RETURN "OK".                 
        END.
        
        
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   'Pedido atualizado com sucesso!').
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Pedido atualizado com sucesso!').
        jsonOutput:ADD('type',              'OK').   
        
        RETURN "OK".        
              
    //END.
    
    CATCH erro AS Progress.Lang.Error:
        //RUN setErrorResponse(erro:GetMessage(1), OUTPUT jsonOutput).
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   erro:GetMessage(1)).
        jsonOutput:ADD('code',              '17006').
        jsonOutput:ADD('message',           erro:GetMessage(1)).
        jsonOutput:ADD('type',              'ERROR').        
    END.    

    //RETURN 'OK':U.

END PROCEDURE.



