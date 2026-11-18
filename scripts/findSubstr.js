const fs = require('fs');
const iconv = require('iconv-lite');
const txt = iconv.decode(fs.readFileSync('collect/app/fcSetInventarioNovaFicha.p'), 'cp850');
const p1 = txt.indexOf('epCodigo');
const p2 = txt.indexOf('FIND FIRST inventario NO-LOCK');
console.log('Substr:');
console.log(txt.substring(p1, p2));
