{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetMLA MLA}
&ENDIF

{include/i-freeac.i}

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.

    define var cCodEstabel          AS CHAR         NO-UNDO.
    define var cCodUsuario          AS CHAR         NO-UNDO.
    
    define var cDescTitCampo        AS CHAR         NO-UNDO.
    define var cDescRetDetCampo     AS CHAR         NO-UNDO.
    
    
    // Criacao do Retorno 
    DEFINE VAR oJsonArray   AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput  AS JsonObject NO-UNDO.
                                    
    DEFINE BUFFER b-mla-usuar-aprov         FOR mla-usuar-aprov.
    DEFINE BUFFER b-mla-usuar-aprov-doc     FOR mla-usuar-aprov.
    DEFINE BUFFER b-mla-usuar-aprov-trans   FOR mla-usuar-aprov.
    
    DEFINE BUFFER b-mla-lotacao             FOR mla-lotacao.

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
        
        ASSIGN cCodEstabel   = oJsonPayloadObject:GetCharacter("codEstabel")
               cCodUsuario   = oJsonPayloadObject:GetCharacter("codUsuario").
    END.

    ASSIGN oJsonArray  = NEW JsonArray()
           oJsonOutput = NEW JsonObject().
           
    FIND FIRST estabelec NO-LOCK
        WHERE estabelec.cod-estabel = cCodEstabel NO-ERROR.        
        
    FOR EACH mla-doc-pend-aprov NO-LOCK
        WHERE mla-doc-pend-aprov.cod-estabel    = estabelec.cod-estabel
          AND mla-doc-pend-aprov.ep-codigo      = estabelec.ep-codigo
          //AND mla-doc-pend-aprov.cod-tip-doc    = 19
          AND mla-doc-pend-aprov.ind-situacao   = 1 //pendente
          AND mla-doc-pend-aprov.cod-usuar      = cCodUsuario,
          FIRST mla-tipo-doc-aprov NO-LOCK
          WHERE mla-tipo-doc-aprov.cod-Tip-Doc = mla-doc-pend-aprov.cod-Tip-Doc.
          
          FIND FIRST b-mla-usuar-aprov NO-LOCK
            WHERE b-mla-usuar-aprov.cod-usuar = mla-doc-pend-aprov.cod-usuar NO-ERROR.
          FIND FIRST b-mla-usuar-aprov-doc NO-LOCK
            WHERE b-mla-usuar-aprov-doc.cod-usuar = mla-doc-pend-aprov.cod-usuar-doc NO-ERROR.
          FIND FIRST b-mla-usuar-aprov-trans NO-LOCK
            WHERE b-mla-usuar-aprov-trans.cod-usuar = mla-doc-pend-aprov.cod-usuar-trans NO-ERROR.            
         
          FIND FIRST mla-lotacao NO-LOCK
            WHERE mla-lotacao.cod-lotacao   = mla-doc-pend-aprov.cod-Lotacao-Trans NO-ERROR.
          FIND FIRST b-mla-lotacao NO-LOCK
            WHERE b-mla-lotacao.cod-lotacao   = mla-doc-pend-aprov.cod-lotacao-doc NO-ERROR.   
            
          FIND FIRST moeda NO-LOCK
            WHERE moeda.mo-codigo = mla-doc-pend-aprov.mo-codigo NO-ERROR.
            
          ASSIGN cDescTitCampo = ''.
          FOR EACH mla-chave-doc-aprov NO-LOCK
            WHERE mla-chave-doc-aprov.cod-Tip-Doc = mla-doc-pend-aprov.cod-Tip-Doc :
            ASSIGN cDescTitCampo = cDescTitCampo + mla-chave-doc-aprov.desc-campo + ' | ' . 
          END.
          ASSIGN cDescTitCampo = trim(SUBSTRING(cDescTitCampo,1,LENGTH(cDescTitCampo) - 3)).
          
          
          ASSIGN cDescRetDetCampo = ''.
          RUN pDetDocTipo (OUTPUT cDescRetDetCampo).
          
 
        oJsonOutput = NEW JsonObject().            
        oJsonOutput:ADD("chaveDoc" ,            mla-doc-pend-aprov.chave-doc).
        oJsonOutput:ADD("descTitCampo",         fn-free-accent(cDescTitCampo) ).
        oJsonOutput:ADD("nrTrans" ,             mla-doc-pend-aprov.nr-trans).
        oJsonOutput:ADD("alternativo" ,         FALSE). 
        oJsonOutput:ADD("dscAlternativo" ,      'NÆo').
        oJsonOutput:ADD("codUsuar" ,            mla-doc-pend-aprov.cod-usuar).
        oJsonOutput:ADD("codUsuarDoc" ,         mla-doc-pend-aprov.cod-usuar-doc).
        oJsonOutput:ADD("codUsuarTrans" ,       mla-doc-pend-aprov.cod-usuar-trans).        
        oJsonOutput:ADD("codTipDoc",            mla-doc-pend-aprov.cod-Tip-Doc ).
        oJsonOutput:ADD("desTipDoc",            fn-free-accent(mla-tipo-doc-aprov.des-tip-doc) ).
        oJsonOutput:ADD("nomeUsuario",          IF AVAIL b-mla-usuar-aprov THEN fn-free-accent(b-mla-usuar-aprov.nome-usuar) ELSE '' ).
        oJsonOutput:ADD("nomeUsuarioDoc",       IF AVAIL b-mla-usuar-aprov THEN fn-free-accent(b-mla-usuar-aprov-doc.nome-usuar) ELSE '' ).
        oJsonOutput:ADD("nomeUsuarTrans",       IF AVAIL b-mla-usuar-aprov THEN fn-free-accent(b-mla-usuar-aprov-trans.nome-usuar) ELSE '' ).        
        oJsonOutput:ADD("codLotacaoTrans",      mla-doc-pend-aprov.cod-Lotacao-Trans ).
        oJsonOutput:ADD("nomeLotacaoTrans",     IF AVAIL mla-lotacao THEN fn-free-accent(mla-lotacao.desc-lotacao) ELSE '' ).
        oJsonOutput:ADD("codLotacaoDoc",        mla-doc-pend-aprov.cod-lotacao-doc ).
        oJsonOutput:ADD("nomeLotacaoDoc",       IF AVAIL b-mla-lotacao THEN fn-free-accent(b-mla-lotacao.desc-lotacao) ELSE '' ).        
        oJsonOutput:ADD("valorDoc",             mla-doc-pend-aprov.valor-doc ).        
        oJsonOutput:ADD("moCodigo",             mla-doc-pend-aprov.mo-codigo ).
        oJsonOutput:ADD("nomeMoeda",            IF AVAIL moeda THEN moeda.descricao ELSE '').        
        oJsonOutput:ADD("motivoDoc",            fn-free-accent(mla-doc-pend-aprov.motivo-doc) ).
        oJsonOutput:ADD("historico",            mla-doc-pend-aprov.historico ).
        oJsonOutput:ADD("motivoHist",           fn-free-accent(mla-doc-pend-aprov.motivo-hist) ).
        oJsonOutput:ADD("dtDeracao",            mla-doc-pend-aprov.dt-geracao ).        
        oJsonOutput:ADD("horaGeracao",          mla-doc-pend-aprov.hora-geracao ).        
        oJsonOutput:ADD("detalhechaveDoc",      cDescRetDetCampo ).                
        oJsonArray :ADD(oJsonOutput).        
    END.                                    
    
    FOR EACH mla-usuar-aprov-altern NO-LOCK
        WHERE mla-usuar-aprov-altern.cod-usuar-altern = cCodUsuario
          AND mla-usuar-aprov-altern.validade-ini <= TODAY
          AND mla-usuar-aprov-altern.validade-fim >= TODAY ,
        EACH mla-doc-pend-aprov NO-LOCK
        WHERE mla-doc-pend-aprov.cod-estabel    = estabelec.cod-estabel
          AND mla-doc-pend-aprov.ep-codigo      = estabelec.ep-codigo
          //AND mla-doc-pend-aprov.cod-tip-doc    = 19
          AND mla-doc-pend-aprov.ind-situacao   = 1 //pendente
          AND mla-doc-pend-aprov.cod-usuar      = mla-usuar-aprov-altern.cod-usuar . 
    
          FIND FIRST b-mla-usuar-aprov NO-LOCK
            WHERE b-mla-usuar-aprov.cod-usuar = mla-doc-pend-aprov.cod-usuar NO-ERROR.
          FIND FIRST b-mla-usuar-aprov-doc NO-LOCK
            WHERE b-mla-usuar-aprov-doc.cod-usuar = mla-doc-pend-aprov.cod-usuar-doc NO-ERROR.
          FIND FIRST b-mla-usuar-aprov-trans NO-LOCK
            WHERE b-mla-usuar-aprov-trans.cod-usuar = mla-doc-pend-aprov.cod-usuar-trans NO-ERROR.            
         
          FIND FIRST mla-lotacao NO-LOCK
            WHERE mla-lotacao.cod-lotacao   = mla-doc-pend-aprov.cod-Lotacao-Trans NO-ERROR.
          FIND FIRST b-mla-lotacao NO-LOCK
            WHERE b-mla-lotacao.cod-lotacao   = mla-doc-pend-aprov.cod-lotacao-doc NO-ERROR.   
            
          FIND FIRST moeda NO-LOCK
            WHERE moeda.mo-codigo = mla-doc-pend-aprov.mo-codigo NO-ERROR.
            
          ASSIGN cDescTitCampo = ''.
          FOR EACH mla-chave-doc-aprov NO-LOCK
            WHERE mla-chave-doc-aprov.cod-Tip-Doc = mla-doc-pend-aprov.cod-Tip-Doc :
            ASSIGN cDescTitCampo = cDescTitCampo + mla-chave-doc-aprov.desc-campo + ' | ' . 
          END.
          ASSIGN cDescTitCampo = trim(SUBSTRING(cDescTitCampo,1,LENGTH(cDescTitCampo) - 3)).
                    
          ASSIGN cDescRetDetCampo = ''.
          RUN pDetDocTipo (OUTPUT cDescRetDetCampo).          
 
        oJsonOutput = NEW JsonObject().            
        oJsonOutput:ADD("chaveDoc" ,            mla-doc-pend-aprov.chave-doc).
        oJsonOutput:ADD("descTitCampo",         fn-free-accent(cDescTitCampo) ).
        oJsonOutput:ADD("nrTrans" ,             mla-doc-pend-aprov.nr-trans).
        oJsonOutput:ADD("alternativo" ,         TRUE).        
        oJsonOutput:ADD("dscAlternativo" ,      'Sim').
        oJsonOutput:ADD("codUsuar" ,            mla-doc-pend-aprov.cod-usuar).
        oJsonOutput:ADD("codUsuarDoc" ,         mla-doc-pend-aprov.cod-usuar-doc).
        oJsonOutput:ADD("codUsuarTrans" ,       mla-doc-pend-aprov.cod-usuar-trans).        
        oJsonOutput:ADD("codTipDoc",            mla-doc-pend-aprov.cod-Tip-Doc ).
        oJsonOutput:ADD("desTipDoc",            fn-free-accent(mla-tipo-doc-aprov.des-tip-doc) ).
        oJsonOutput:ADD("nomeUsuario",          IF AVAIL b-mla-usuar-aprov THEN fn-free-accent(b-mla-usuar-aprov.nome-usuar) ELSE '' ).
        oJsonOutput:ADD("nomeUsuarioDoc",       IF AVAIL b-mla-usuar-aprov THEN fn-free-accent(b-mla-usuar-aprov-doc.nome-usuar) ELSE '' ).
        oJsonOutput:ADD("nomeUsuarTrans",       IF AVAIL b-mla-usuar-aprov THEN fn-free-accent(b-mla-usuar-aprov-trans.nome-usuar) ELSE '' ).        
        oJsonOutput:ADD("codLotacaoTrans",      mla-doc-pend-aprov.cod-Lotacao-Trans ).
        oJsonOutput:ADD("nomeLotacaoTrans",     IF AVAIL mla-lotacao THEN fn-free-accent(mla-lotacao.desc-lotacao) ELSE '' ).
        oJsonOutput:ADD("codLotacaoDoc",        mla-doc-pend-aprov.cod-lotacao-doc ).
        oJsonOutput:ADD("nomeLotacaoDoc",       IF AVAIL b-mla-lotacao THEN fn-free-accent(b-mla-lotacao.desc-lotacao) ELSE '' ).        
        oJsonOutput:ADD("valorDoc",             mla-doc-pend-aprov.valor-doc ).        
        oJsonOutput:ADD("moCodigo",             mla-doc-pend-aprov.mo-codigo ).
        oJsonOutput:ADD("nomeMoeda",            IF AVAIL moeda THEN moeda.descricao ELSE '').        
        oJsonOutput:ADD("motivoDoc",            fn-free-accent(mla-doc-pend-aprov.motivo-doc) ).
        oJsonOutput:ADD("historico",            mla-doc-pend-aprov.historico).
        oJsonOutput:ADD("motivoHist",           fn-free-accent(mla-doc-pend-aprov.motivo-hist) ).
        oJsonOutput:ADD("dtDeracao",            mla-doc-pend-aprov.dt-geracao ).        
        oJsonOutput:ADD("horaGeracao",          mla-doc-pend-aprov.hora-geracao ).        
        oJsonOutput:ADD("detalhechaveDoc",      cDescRetDetCampo ).                                  
        oJsonArray :ADD(oJsonOutput).    
    END.
    
    jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE).

    RETURN 'OK':U.

END PROCEDURE.

//mla-doc-pend-aprov.aprov-auto mla-doc-pend-aprov.cdn-workflow-fluig mla-doc-pend-aprov.char-1 mla-doc-pend-aprov.char-2 mla-doc-pend-aprov.char-3 mla-doc-pend-aprov.char-4 mla-doc-pend-aprov.char-5 mla-doc-pend-aprov.chave-doc mla-doc-pend-aprov.cod-cond-pagto mla-doc-pend-aprov.cod-estabel mla-doc-pend-aprov.  mla-doc-pend-aprov.cod-referencia mla-doc-pend-aprov.cod-rejeicao mla-doc-pend-aprov.cod-tip-aprov mla-doc-pend-aprov.cod-tip-doc mla-doc-pend-aprov.cod-usuar mla-doc-pend-aprov.cod-usuar-altern mla-doc-pend-aprov.cod-usuar-doc  mla-doc-pend-aprov.data-1 mla-doc-pend-aprov.data-2 mla-doc-pend-aprov.data-3 mla-doc-pend-aprov.data-4 mla-doc-pend-aprov.data-5 mla-doc-pend-aprov.dec-1 mla-doc-pend-aprov.dec-2 mla-doc-pend-aprov.dec-3 mla-doc-pend-aprov.dec-4 mla-doc-pend-aprov.dec-5 mla-doc-pend-aprov.dt-aprova  mla-doc-pend-aprov.dt-reaprova mla-doc-pend-aprov.dt-rejeita mla-doc-pend-aprov.ep-codigo   mla-doc-pend-aprov.ind-situacao mla-doc-pend-aprov.ind-tip-aprov mla-doc-pend-aprov.int-1 mla-doc-pend-aprov.int-2 mla-doc-pend-aprov.int-3 mla-doc-pend-aprov.int-4 mla-doc-pend-aprov.int-5 mla-doc-pend-aprov.it-codigo mla-doc-pend-aprov.log-1 mla-doc-pend-aprov.log-2 mla-doc-pend-aprov.log-3 mla-doc-pend-aprov.log-4 mla-doc-pend-aprov.log-5   mla-doc-pend-aprov.narrativa-apr mla-doc-pend-aprov.narrativa-rej mla-doc-pend-aprov.nr-trans mla-doc-pend-aprov.num-faixa mla-doc-pend-aprov.num-priorid-aprova-docto mla-doc-pend-aprov.prioridade-aprov mla-doc-pend-aprov.seq-aprov mla-doc-pend-aprov.seq-log-aprov 


PROCEDURE pDetDocTipo:

    DEFINE OUTPUT PARAM pc-det-doc-ret AS CHAR NO-UNDO.

    DEFINE VAR c-ped-compra AS CHAR NO-UNDO.
    DEFINE VAR c-ord-compra AS CHAR NO-UNDO.
    DEFINE VAR i-ent-aux    AS INT  NO-UNDO.
    
    ASSIGN pc-det-doc-ret = ''.
    IF NOT AVAIL mla-doc-pend-aprov THEN DO:
        RETURN "OK".        
    END.
        
    IF mla-doc-pend-aprov.cod-Tip-Doc = 19 THEN DO:
    
        ASSIGN c-ped-compra = '0'
               c-ord-compra = '0' .
    
       ASSIGN i-ent-aux = 1.
       FOR EACH mla-chave-doc-aprov NO-LOCK
          WHERE mla-chave-doc-aprov.cod-Tip-Doc = mla-doc-pend-aprov.cod-Tip-Doc :
          
          CASE i-ent-aux:
            WHEN 1 THEN ASSIGN c-ped-compra = substring(mla-doc-pend-aprov.chave-doc,mla-chave-doc-aprov.posicao-ini,mla-chave-doc-aprov.posicao-fim).    
            WHEN 2 THEN ASSIGN c-ord-compra = substring(mla-doc-pend-aprov.chave-doc,mla-chave-doc-aprov.posicao-ini,mla-chave-doc-aprov.posicao-fim).    
          END CASE.
         
          ASSIGN i-ent-aux = i-ent-aux + 1.
       END.
       
       FIND FIRST pedido-compr NO-LOCK
            WHERE pedido-compr.num-pedido = INT(c-ped-compra) NO-ERROR.
       IF AVAIL pedido-compr THEN DO:
          FIND FIRST emitente NO-LOCK
            WHERE emitente.cod-emitente = pedido-compr.cod-emitente NO-ERROR.
            
          ASSIGN pc-det-doc-ret = 'Fornecedor: '    + IF AVAIL emitente THEN emitente.nome-emit ELSE '' + ' | '
                                + 'Data Pedido: '   + STRING(pedido-compr.data-pedido) + '!!||!!'.
       END.
       FIND FIRST ordem-compra NO-LOCK
            WHERE ordem-compra.numero-ordem = INT(c-ord-compra) NO-ERROR.
       IF AVAIL ordem-compra THEN DO:
         FIND FIRST ITEM OF ordem-compra NO-LOCK NO-ERROR.
            
          ASSIGN pc-det-doc-ret = pc-det-doc-ret + ' | Item: '    + (IF AVAIL ITEM THEN ITEM.desc-item + ' (' + ITEM.un + ') ' ELSE '')   + ' | '
                                + 'Quantidade: '   + STRING(ordem-compra.qt-solic)        + ' | '
                                + 'Pre‡o Unit: '   + STRING(ordem-compra.preco-unit)    + ' | '
                                + 'Data EmissÆo: ' + STRING(ordem-compra.data-emissao)    + ' | '
                                + 'Narrativa: ' + fn-free-accent(ordem-compra.narrativa)
                                .
       END.                    
    END.
    
    

END PROCEDURE.

