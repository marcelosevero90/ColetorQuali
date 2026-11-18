{cdp/cd0666.i}    /* tt-erro */
{cdp/cdcfgman.i}
{cdp/cdcfgmat.i} /* Preprocessador bf_mat_conta_estab */
{cpp/cpapi001.i}  /* Definicao temp-table cpapi001 */
{cpp/cpapi001.i1} /* Definicao temp-table adicionais cpapi001 */
{cep/ceapi001k.i} /*tabela tt-movto*/


FIND FIRST param-cp NO-LOCK. 




FIND FIRST ord-prod NO-LOCK
WHERE ord-prod.nr-ord-produ = 226978.

CREATE tt-rep-prod.                                                                                                                        
ASSIGN tt-rep-prod.cod-versao-integracao = 1
       tt-rep-prod.tipo                  = 1 //ordem
       tt-rep-prod.nr-ord-prod           = ord-prod.nr-ord-produ
       tt-rep-prod.prog-seg              = "qgTeste"                                                                                           
       tt-rep-prod.procura-saldos        = YES                                                                                                  
       tt-rep-prod.carrega-reservas      = no
       tt-rep-prod.baixa-reservas        = 1                                                                                                   
       tt-rep-prod.requis-automatica     = NO                                                                                          
       tt-rep-prod.cod-depos-sai         = param-cp.dep-fabrica
       tt-rep-prod.cod-local-sai         = ''
       tt-rep-prod.data                  = TODAY                                                                                               
       tt-rep-prod.un                    = ord-prod.un                                                                                         
       tt-rep-prod.qt-reporte            = 1
       tt-rep-prod.qt-refugo             = 1                                                                                                                            
       tt-rep-prod.it-codigo             = ord-prod.it-codigo                                                                                                           
       tt-rep-prod.qt-apr-cond           = 0                                                                                                                            
       tt-rep-prod.nro-docto             = STRING(ord-prod.nr-ord-produ)                                                                                                 
       tt-rep-prod.serie-docto           = ''                                                                                                                           
       tt-rep-prod.cod-depos             = ord-prod.cod-depos                                                                                                           
       tt-rep-prod.lote-serie            = ord-prod.lote                                                                                                                
       tt-rep-prod.cod-refer             = ord-prod.cod-refer                                                                                                           
       tt-rep-prod.dt-vali-lote          = ?
       tt-rep-prod.cod-localiz           = ""
       tt-rep-prod.ct-codigo             = ord-prod.ct-codigo
       tt-rep-prod.sc-codigo             = ord-prod.sc-codigo
       tt-rep-prod.finaliza-ordem        = NO
       
       tt-rep-prod.ct-refugo             = '42103045'
       tt-rep-prod.sc-refugo             = ''
       
       //tt-rep-prod.cod-cta-unif          = '91101014'
       //tt-rep-prod.cod-ccusto-unif       = ''
       .

       
RUN cpp/cpapi001.p  (INPUT-OUTPUT TABLE tt-rep-prod,
                     INPUT        TABLE tt-refugo,
                     INPUT        TABLE tt-res-neg,
                     INPUT        TABLE tt-apont-mob,
                     INPUT-OUTPUT TABLE tt-erro,
                     INPUT        YES).    
                     
FOR EACH tt-erro:

    MESSAGE tt-erro.mensagem
        VIEW-AS ALERT-BOX INFORMATION BUTTONS OK.

END.
                     
                     
