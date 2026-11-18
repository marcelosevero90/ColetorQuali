DEFINE PARAMETER BUFFER b-inventario     FOR inventario.
DEFINE PARAMETER BUFFER b-old-inventario FOR inventario.

DEFINE VARIABLE c-ep-codigo AS CHARACTER NO-UNDO.

FIND FIRST estabelec NO-LOCK
     WHERE estabelec.cod-estabel = b-inventario.cod-estabel NO-ERROR.
IF AVAILABLE estabelec THEN
    ASSIGN c-ep-codigo = estabelec.ep-codigo.

IF NOT CAN-FIND(FIRST fmsc-inventario
                WHERE (IF c-ep-codigo <> "" THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE)
                  AND fmsc-inventario.dt-saldo = b-inventario.dt-saldo) THEN DO:
    CREATE fmsc-inventario.
    ASSIGN fmsc-inventario.ep-codigo                    = c-ep-codigo
           fmsc-inventario.dt-saldo                     = b-inventario.dt-saldo
           fmsc-inventario.ind-tipo-inv                 = 1
           fmsc-inventario.ind-sit-inv                  = 1
           fmsc-inventario.perm-contg-usuar-ficha       = NO.
END.
RETURN "OK".