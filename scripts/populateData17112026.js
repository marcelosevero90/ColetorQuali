const fs = require('fs');

const path = 'data/totvs_db.json';
const db = JSON.parse(fs.readFileSync(path, 'utf8'));

// 1. Garante que fmsc_inventario tem 2026-11-17
let invParam = db.fmsc_inventario.find(p => p.dtSaldo === '2026-11-17' && p.codEmpresa === '001');
if (!invParam) {
  db.fmsc_inventario.push({
    codEmpresa: '001',
    dtSaldo: '2026-11-17',
    indSitInv: 1, // 1-Liberado
    permContgUsFc: true,
    indTipoInv: 1,
    nrContagAtiva: 1 // 1ª Contagem Ativa
  });
  console.log('Adicionado fmsc_inventario para 2026-11-17!');
}

// 2. Garante que as fichas 1 a 11 do CE0712 do print existem para 2026-11-17
const itensFichas = [
  { nrFicha: 1, itCodigo: '01010047', descItem: 'Kit Pont Prince (10) Unidades', codDepos: 'AST', un: 'UN', qtidadeAtu: 10 },
  { nrFicha: 2, itCodigo: '01010116', descItem: 'Item 01010116', codDepos: 'AST', un: 'UN', qtidadeAtu: 5 },
  { nrFicha: 3, itCodigo: '01010125', descItem: 'Item 01010125', codDepos: 'AST', un: 'UN', qtidadeAtu: 2 },
  { nrFicha: 4, itCodigo: '01010126', descItem: 'Item 01010126', codDepos: 'AST', un: 'UN', qtidadeAtu: 8 },
  { nrFicha: 5, itCodigo: '01010167', descItem: 'Item 01010167', codDepos: 'AST', un: 'UN', qtidadeAtu: 12 },
  { nrFicha: 6, itCodigo: '01010217', descItem: 'Item 01010217', codDepos: 'AST', un: 'UN', qtidadeAtu: 1 },
  { nrFicha: 7, itCodigo: '01010219', descItem: 'Item 01010219', codDepos: 'AST', un: 'UN', qtidadeAtu: 4 },
  { nrFicha: 8, itCodigo: '01010227', descItem: 'Item 01010227', codDepos: 'AST', un: 'UN', qtidadeAtu: 15 },
  { nrFicha: 9, itCodigo: '01010240', descItem: 'Item 01010240', codDepos: 'AST', un: 'UN', qtidadeAtu: 7 },
  { nrFicha: 10, itCodigo: '01010247', descItem: 'Item 01010247', codDepos: 'AST', un: 'UN', qtidadeAtu: 3 },
  { nrFicha: 11, itCodigo: '01010250', descItem: 'Item 01010250', codDepos: 'AST', un: 'UN', qtidadeAtu: 9 }
];

itensFichas.forEach(f => {
  const existe = db.inventario.some(i => i.dtSaldo === '2026-11-17' && Number(i.nrFicha) === f.nrFicha && i.codEmpresa === '001');
  if (!existe) {
    db.inventario.push({
      codEmpresa: '001',
      nrFicha: f.nrFicha,
      dtSaldo: '2026-11-17',
      codEstabel: '101',
      codDepos: f.codDepos,
      codLocaliz: '',
      lote: '',
      codRefer: '',
      itCodigo: f.itCodigo,
      valApurado: [null, null, null],
      codConfteContag: ['', '', ''],
      qtidadeAtu: f.qtidadeAtu,
      situacao: 2, // 2-Não Atualiza (Pendente de contagem)
      descItem: f.descItem,
      cdnAgrup: 0,
      un: f.un
    });
  }
});

// Salva de volta
fs.writeFileSync(path, JSON.stringify(db, null, 2), 'utf8');
console.log('data/totvs_db.json atualizado com dados de 2026-11-17!');
