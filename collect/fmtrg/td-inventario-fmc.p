DEFINE PARAMETER BUFFER b-inventario FOR inventario.

DEFINE VARIABLE c-ep-codigo AS CHARACTER NO-UNDO.

FIND FIRST estabelec NO-LOCK
     WHERE estabelec.cod-estabel = b-inventario.cod-estabel NO-ERROR.
IF AVAILABLE estabelec THEN
    ASSIGN c-ep-codigo = estabelec.ep-codigo.

/* Verifica se ainda existe alguma ficha no inventario para essa data e estabelecimento */
IF NOT CAN-FIND(FIRST inventario NO-LOCK
                WHERE inventario.dt-saldo = b-inventario.dt-saldo
                  AND inventario.cod-estabel = b-inventario.cod-estabel) THEN DO:
    FIND FIRST fmsc-inventario EXCLUSIVE-LOCK
         WHERE (IF c-ep-codigo <> "" THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE)
           AND fmsc-inventario.dt-saldo = b-inventario.dt-saldo NO-WAIT NO-ERROR.
    IF AVAILABLE fmsc-inventario THEN DO:   
        DELETE fmsc-inventario.
    END.    
END.
RETURN "OK".