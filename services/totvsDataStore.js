// services/totvsDataStore.js - Repositório de Dados Fiel aos Programas Progress (collect/*) e DFs (fms001.df / fms002.df)
// Diretriz Multi-Empresa:
// - A tabela 'estabelec' é GLOBAL (multi-empresa) e possui o campo 'codEmpresa' (ep-codigo).
// - Todas as demais tabelas de movimento/cadastro são MONO-EMPRESA e possuem 'codEmpresa' vinculado.

const fs = require('fs');
const path = require('path');

function matchEmpresa(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const sa = String(a).trim();
  const sb = String(b).trim();
  if (sa === sb) return true;
  if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
    return Number(sa) === Number(sb);
  }
  return false;
}

function normalizarEmpresa(ep) {
  const s = String(ep || '001').trim();
  if (/^\d+$/.test(s) && s.length < 3) {
    return s.padStart(3, '0');
  }
  return s;
}

class TotvsDataStore {
  constructor() {
    this.storageFile = path.join(__dirname, '..', 'data', 'totvs_db.json');
    this.initDefaultData();
    this.loadFromDisk();
  }

  initDefaultData() {
    this.data = {
      // TABELA GLOBAL MULTI-EMPRESA (estabelec - fcGetEstabelecimentos.p)
      // Exceção única: não pertence a um banco mono-empresa; cada registro aponta para seu codEmpresa.
      estabelec: [
        { codEstabel: '101', nome: 'MATRIZ INDUSTRIAL - EMPRESA 001', codEmpresa: '001', cgc: '12.345.678/0001-01' },
        { codEstabel: '102', nome: 'FILIAL LOGISTICA - EMPRESA 001', codEmpresa: '001', cgc: '12.345.678/0002-82' },
        { codEstabel: '11',  nome: 'CYG BIOTECH TABOAO - EMPRESA 001', codEmpresa: '001', cgc: '45.123.456/0001-11' },
        { codEstabel: '1',   nome: 'CONSIGAZ BARUERI - EMPRESA 001', codEmpresa: '001', cgc: '60.987.654/0001-01' },
        { codEstabel: '201', nome: 'SANTA COLOMBA MATRIZ - EMPRESA 002', codEmpresa: '002', cgc: '98.765.432/0001-02' },
        { codEstabel: '2100', nome: 'SANTA COLOMBA FAZENDA - EMPRESA 002', codEmpresa: '002', cgc: '98.765.432/0002-83' }
      ],

      // Parâmetro padrão de estoque por empresa (param-estoq.cons-invent: 1-Saldo, 2-Contagem)
      param_estoq: [
        { codEmpresa: '001', estabelPad: '101', consInvent: 1 },
        { codEmpresa: '002', estabelPad: '2100', consInvent: 1 }
      ],

      // FMSC0101 / fms001.df: fmsc-usuar-mestre (Mono-empresa com codEmpresa)
      fmsc_usuar_mestre: [
        // Empresa 001
        {
          codEmpresa: '001',
          codUsuario: 'matheus.st',
          nome: 'Matheus ST (Administrador)',
          senha: 'qwe8451',
          situacao: 9,
          codEstabPad: '101',
          TpAgrupTransf: 1,
          tabPrincipal: 1,
          permEstoque: true,
          permCompras: true,
          permCredito: true,
          permProducao: true,
          permEstoqReqAte: true,
          permEstoqReqDev: true,
          permEstoqReqMov: true,
          permEstoqReqInv: true,
          permEstoqReqRec: true,
          permComprMLA: true,
          permCredAvCli: true
        },
        {
          codEmpresa: '001',
          codUsuario: 'admin',
          nome: 'Administrador Datasul',
          senha: 'admin',
          situacao: 9,
          codEstabPad: '101',
          TpAgrupTransf: 1,
          tabPrincipal: 1,
          permEstoque: true,
          permCompras: true,
          permCredito: true,
          permProducao: true,
          permEstoqReqAte: true,
          permEstoqReqDev: true,
          permEstoqReqMov: true,
          permEstoqReqInv: true,
          permEstoqReqRec: true,
          permComprMLA: true,
          permCredAvCli: true
        },
        {
          codEmpresa: '001',
          codUsuario: 'aamaral',
          nome: 'Alexandre Amaral',
          senha: '123',
          situacao: 9,
          codEstabPad: '101',
          TpAgrupTransf: 1,
          tabPrincipal: 1,
          permEstoque: true,
          permCompras: false,
          permCredito: false,
          permProducao: false,
          permEstoqReqAte: true,
          permEstoqReqDev: true,
          permEstoqReqMov: true,
          permEstoqReqInv: true,
          permEstoqReqRec: true,
          permComprMLA: false,
          permCredAvCli: false
        },
        {
          codEmpresa: '001',
          codUsuario: 'conferente1',
          nome: 'Carlos Conferente 1',
          senha: '123',
          situacao: 9,
          codEstabPad: '101',
          TpAgrupTransf: 1,
          tabPrincipal: 1,
          permEstoque: true,
          permCompras: false,
          permCredito: false,
          permProducao: false,
          permEstoqReqAte: false,
          permEstoqReqDev: false,
          permEstoqReqMov: false,
          permEstoqReqInv: true,
          permEstoqReqRec: false,
          permComprMLA: false,
          permCredAvCli: false
        },
        {
          codEmpresa: '001',
          codUsuario: 'conferente2',
          nome: 'Mariana Conferente 2',
          senha: '123',
          situacao: 9,
          codEstabPad: '101',
          TpAgrupTransf: 1,
          tabPrincipal: 1,
          permEstoque: true,
          permCompras: false,
          permCredito: false,
          permProducao: false,
          permEstoqReqAte: false,
          permEstoqReqDev: false,
          permEstoqReqMov: false,
          permEstoqReqInv: true,
          permEstoqReqRec: false,
          permComprMLA: false,
          permCredAvCli: false
        },
        {
          codEmpresa: '001',
          codUsuario: 'sem_inv',
          nome: 'Operador Sem Permissão Inventário',
          senha: '123',
          situacao: 9,
          codEstabPad: '101',
          TpAgrupTransf: 1,
          tabPrincipal: 1,
          permEstoque: true,
          permCompras: false,
          permCredito: false,
          permProducao: false,
          permEstoqReqAte: true,
          permEstoqReqDev: false,
          permEstoqReqMov: false,
          permEstoqReqInv: false,
          permEstoqReqRec: false,
          permComprMLA: false,
          permCredAvCli: false
        },
        // Empresa 002
        {
          codEmpresa: '002',
          codUsuario: 'matheus.st',
          nome: 'Matheus ST (Empresa 002)',
          senha: 'qwe8451',
          situacao: 9,
          codEstabPad: '2100',
          TpAgrupTransf: 1,
          tabPrincipal: 1,
          permEstoque: true,
          permCompras: true,
          permCredito: true,
          permProducao: true,
          permEstoqReqAte: true,
          permEstoqReqDev: true,
          permEstoqReqMov: true,
          permEstoqReqInv: true,
          permEstoqReqRec: true,
          permComprMLA: true,
          permCredAvCli: true
        },
        {
          codEmpresa: '002',
          codUsuario: 'admin',
          nome: 'Administrador Empresa 002',
          senha: 'admin',
          situacao: 9,
          codEstabPad: '2100',
          TpAgrupTransf: 1,
          tabPrincipal: 1,
          permEstoque: true,
          permCompras: true,
          permCredito: true,
          permProducao: true,
          permEstoqReqAte: true,
          permEstoqReqDev: true,
          permEstoqReqMov: true,
          permEstoqReqInv: true,
          permEstoqReqRec: true,
          permComprMLA: true,
          permCredAvCli: true
        },
        {
          codEmpresa: '002',
          codUsuario: 'aamaral',
          nome: 'Alexandre Amaral',
          senha: '123',
          situacao: 9,
          codEstabPad: '2100',
          TpAgrupTransf: 1,
          tabPrincipal: 1,
          permEstoque: true,
          permCompras: false,
          permCredito: false,
          permProducao: false,
          permEstoqReqAte: true,
          permEstoqReqDev: true,
          permEstoqReqMov: true,
          permEstoqReqInv: true,
          permEstoqReqRec: true,
          permComprMLA: false,
          permCredAvCli: false
        },
        {
          codEmpresa: '002',
          codUsuario: 'conferente1',
          nome: 'Carlos Conferente 1',
          senha: '123',
          situacao: 9,
          codEstabPad: '2100',
          TpAgrupTransf: 1,
          tabPrincipal: 1,
          permEstoque: true,
          permCompras: false,
          permCredito: false,
          permProducao: false,
          permEstoqReqAte: false,
          permEstoqReqDev: false,
          permEstoqReqMov: false,
          permEstoqReqInv: true,
          permEstoqReqRec: false,
          permComprMLA: false,
          permCredAvCli: false
        }
      ],

      // FMSC0102 / fms002.df: fmsc-inventario (Mono-empresa com codEmpresa)
      // indSitInv: 1-Liberado, 2-Bloqueado
      // permContgUsFc: false = Não permite mesmo usuário apurar mesma ficha em contagens diferentes; true = Permite
      // indTipoInv: 1-Por Fichas, 2-Por Operador
      fmsc_inventario: [
        {
          codEmpresa: '001',
          dtSaldo: '2026-11-16',
          indSitInv: 1,
          permContgUsFc: false,
          indTipoInv: 1,
          nrContagAtiva: 2 // 2ª contagem ativa para testes de conferência e segregação
        },
        {
          codEmpresa: '001',
          dtSaldo: '2026-11-10',
          indSitInv: 2, // Bloqueado (FMSC0102) para demonstrar bloqueio de contagem
          permContgUsFc: false,
          indTipoInv: 1,
          nrContagAtiva: 1
        },
        {
          codEmpresa: '001',
          dtSaldo: '2026-11-01',
          indSitInv: 1,
          permContgUsFc: true,
          indTipoInv: 1,
          nrContagAtiva: 4 // Inventário concluído (NÃO deve listar no App)
        },
        {
          codEmpresa: '002',
          dtSaldo: '2026-11-15',
          indSitInv: 1,
          permContgUsFc: true, // Empresa 002 permite mesmo conferente em contagens diferentes
          indTipoInv: 1,
          nrContagAtiva: 2 // 2ª contagem ativa para testes de apuração
        }
      ],

      // agrup-invent (fcGetAgrupInvent.p)
      agrup_invent: [
        { codEmpresa: '001', cdnAgrup: 10, dscAgrup: 'INVENTARIO GERAL ALMOXARIFADO', codRespon: 'aamaral', dtCriacao: '2026-11-16' },
        { codEmpresa: '001', cdnAgrup: 20, dscAgrup: 'INVENTARIO PRODUCAO E EXPEDICAO', codRespon: 'conferente1', dtCriacao: '2026-11-16' },
        { codEmpresa: '002', cdnAgrup: 100, dscAgrup: 'INVENTARIO INSUMOS AGRO', codRespon: 'aamaral', dtCriacao: '2026-11-15' }
      ],

      // deposito (fcGetDeposito.p - WHERE deposito.cons-saldo = YES)
      deposito: [
        { codEmpresa: '001', codDepos: 'ALM', nome: 'ALMOXARIFADO CENTRAL', consSaldo: true },
        { codEmpresa: '001', codDepos: 'AL1', nome: 'Almoxarifado 1', consSaldo: true },
        { codEmpresa: '001', codDepos: 'EXP', nome: 'EXPEDICAO PRODUTOS', consSaldo: true },
        { codEmpresa: '001', codDepos: 'PRO', nome: 'DEPOSITO PRODUCAO', consSaldo: true },
        { codEmpresa: '001', codDepos: 'QUA', nome: 'QUARENTENA / QUALIDADE', consSaldo: true },
        { codEmpresa: '001', codDepos: 'AST', nome: 'ASSISTENCIA TECNICA', consSaldo: true },
        { codEmpresa: '001', codDepos: 'ACA', nome: 'ACABADO', consSaldo: true },
        { codEmpresa: '001', codDepos: 'SRO', nome: 'SEMI-ACABADO / RETRABALHO', consSaldo: true },
        { codEmpresa: '002', codDepos: '102', nome: 'DEPOSITO GERAL FAZENDA', consSaldo: true },
        { codEmpresa: '002', codDepos: '105', nome: 'OFICINA E PECAS', consSaldo: true }
      ],

      // referencia (fcGetReferencia.p)
      referencia: [
        { codEmpresa: '001', codRefer: '', descRefer: 'Sem Referencia' },
        { codEmpresa: '001', codRefer: 'PAD', descRefer: 'Padrao Industrial' },
        { codEmpresa: '001', codRefer: 'ESP', descRefer: 'Acabamento Especial' },
        { codEmpresa: '002', codRefer: '', descRefer: 'Sem Referencia' },
        { codEmpresa: '002', codRefer: 'SAF26', descRefer: 'Safra 2026' }
      ],

      // localizacao (fcGetLocalizacao.p)
      localizacao: [
        { codEmpresa: '001', codEstabel: '101', codDepos: 'AST', codLocaliz: '', descricao: 'BRANCO' },
        { codEmpresa: '001', codEstabel: '101', codDepos: 'AST', codLocaliz: 'TESTE', descricao: 'TESTE' },
        { codEmpresa: '001', codEstabel: '101', codDepos: 'ACA', codLocaliz: '', descricao: 'BRANCO' },
        { codEmpresa: '001', codEstabel: '101', codDepos: 'SRO', codLocaliz: '', descricao: 'BRANCO' },
        { codEmpresa: '001', codEstabel: '101', codDepos: 'ALM', codLocaliz: 'A-01-01', descricao: 'RUA A - PRATELEIRA 01 - NIVEL 01' },
        { codEmpresa: '001', codEstabel: '101', codDepos: 'ALM', codLocaliz: 'A-01-02', descricao: 'RUA A - PRATELEIRA 01 - NIVEL 02' },
        { codEmpresa: '001', codEstabel: '101', codDepos: 'ALM', codLocaliz: 'B-02-01', descricao: 'RUA B - PRATELEIRA 02 - NIVEL 01' },
        { codEmpresa: '001', codEstabel: '101', codDepos: 'EXP', codLocaliz: 'DOCA-01', descricao: 'DOCA DE EXPEDICAO 01' },
        { codEmpresa: '001', codEstabel: '101', codDepos: 'EXP', codLocaliz: 'DOCA-02', descricao: 'DOCA DE EXPEDICAO 02' },
        { codEmpresa: '001', codEstabel: '101', codDepos: 'PRO', codLocaliz: 'LIN-01', descricao: 'LINHA DE MONTAGEM 01' },
        { codEmpresa: '001', codEstabel: '102', codDepos: 'ALM', codLocaliz: 'F2-A01', descricao: 'FILIAL 102 - CORREDOR A1' },
        { codEmpresa: '001', codEstabel: '11',  codDepos: 'ALM', codLocaliz: 'A-01-01', descricao: 'TABOAO - PRATELEIRA A1' },
        { codEmpresa: '001', codEstabel: '11',  codDepos: 'EXP', codLocaliz: '221100018', descricao: 'BOX 18 EXPEDICAO' },
        { codEmpresa: '002', codEstabel: '2100', codDepos: '102', codLocaliz: '4-2-2', descricao: 'GALPAO 4 CORREDOR 2 NIVEL 2' },
        { codEmpresa: '002', codEstabel: '2100', codDepos: '102', codLocaliz: '4-3-4', descricao: 'GALPAO 4 CORREDOR 3 NIVEL 4' },
        { codEmpresa: '002', codEstabel: '2100', codDepos: '105', codLocaliz: 'OF-01', descricao: 'BANCADA OFICINA 01' }
      ],

      // item (fcGetItem.p + carga em chunks)
      item: this._gerarItensIniciais(),

      // lote (fcGetLote.p)
      lote: [
        { codEmpresa: '001', itCodigo: 'D352-221/1', codEstabel: '101', codDepos: 'SRO', lote: '5992945-10', dtValiLote: '9999-12-31', codLocaliz: '', qtDisponivel: 1.0, codRefer: '', nomeDepos: 'SEMI-ACABADO / RETRABALHO', nomeLocaliz: 'BRANCO' },
        { codEmpresa: '001', itCodigo: 'D352-221/1', codEstabel: '101', codDepos: 'ACA', lote: '6000765-2290', dtValiLote: '9999-12-31', codLocaliz: '', qtDisponivel: 243.0, codRefer: '', nomeDepos: 'ACABADO', nomeLocaliz: 'BRANCO' },
        { codEmpresa: '001', itCodigo: 'D352-221/1', codEstabel: '101', codDepos: 'ACA', lote: '6044671-50', dtValiLote: '9999-12-31', codLocaliz: '', qtDisponivel: 446.0, codRefer: '', nomeDepos: 'ACABADO', nomeLocaliz: 'BRANCO' },
        { codEmpresa: '001', itCodigo: 'D352-221/1', codEstabel: '101', codDepos: 'AST', lote: '6044671-50', dtValiLote: '9999-12-31', codLocaliz: '', qtDisponivel: 350.0, codRefer: '', nomeDepos: 'ASSISTENCIA TECNICA', nomeLocaliz: 'BRANCO' },
        { codEmpresa: '001', itCodigo: '11000015', codEstabel: '101', codDepos: 'ALM', lote: 'LT-2026-01', dtValiLote: '2028-06-30', codLocaliz: 'A-01-01', qtDisponivel: 120.0, codRefer: '', nomeDepos: 'ALMOXARIFADO CENTRAL', nomeLocaliz: 'RUA A - PRATELEIRA 01 - NIVEL 01' },
        { codEmpresa: '001', itCodigo: '11000015', codEstabel: '101', codDepos: 'ALM', lote: 'LT-2026-02', dtValiLote: '2028-09-15', codLocaliz: 'A-01-02', qtDisponivel: 45.0, codRefer: '', nomeDepos: 'ALMOXARIFADO CENTRAL', nomeLocaliz: 'RUA A - PRATELEIRA 01 - NIVEL 02' },
        { codEmpresa: '001', itCodigo: '11500028', codEstabel: '101', codDepos: 'ALM', lote: '211000049', dtValiLote: '2027-07-20', codLocaliz: 'B-02-01', qtDisponivel: 4500.0, codRefer: '', nomeDepos: 'ALMOXARIFADO CENTRAL', nomeLocaliz: 'RUA B - PRATELEIRA 02 - NIVEL 01' },
        { codEmpresa: '001', itCodigo: '11000028', codEstabel: '101', codDepos: 'EXP', lote: '231000114', dtValiLote: '2029-03-17', codLocaliz: 'DOCA-01', qtDisponivel: 25.0, codRefer: '', nomeDepos: 'EXPEDICAO PRODUTOS', nomeLocaliz: 'DOCA DE EXPEDICAO 01' },
        { codEmpresa: '002', itCodigo: '052900017', codEstabel: '2100', codDepos: '102', lote: 'LT-AGRO-90', dtValiLote: '2028-12-31', codLocaliz: '4-2-2', qtDisponivel: 350.0, codRefer: 'SAF26', nomeDepos: 'DEPOSITO GERAL FAZENDA', nomeLocaliz: 'GALPAO 4 CORREDOR 2 NIVEL 2' }
      ],

      // saldo-estoq (fcGetSaldoEstoq.p)
      saldo_estoq: [
        { codEmpresa: '001', itCodigo: '11000015', codEstab: '101', codDep: 'ALM', codLocal: 'A-01-01', lote: 'LT-2026-01', codRefer: '', descItem: 'CARBONATO DE CALCIO (PA)', qtAlocada: 0, qtidadeAtu: 120.0, qtAlocPed: 0, qtAlocProd: 0, dtValiLote: '2028-06-30', qtDisponivelCalc: 120.0 },
        { codEmpresa: '001', itCodigo: '11000015', codEstab: '101', codDep: 'ALM', codLocal: 'A-01-02', lote: 'LT-2026-02', codRefer: '', descItem: 'CARBONATO DE CALCIO (PA)', qtAlocada: 0, qtidadeAtu: 45.0, qtAlocPed: 0, qtAlocProd: 0, dtValiLote: '2028-09-15', qtDisponivelCalc: 45.0 },
        { codEmpresa: '001', itCodigo: '11500028', codEstab: '101', codDep: 'ALM', codLocal: 'B-02-01', lote: '211000049', codRefer: '', descItem: 'ACETATO DE ISOPROPILA GRAU FARMA', qtAlocada: 0, qtidadeAtu: 4500.0, qtAlocPed: 0, qtAlocProd: 0, dtValiLote: '2027-07-20', qtDisponivelCalc: 4500.0 },
        { codEmpresa: '001', itCodigo: '11000028', codEstab: '101', codDep: 'EXP', codLocal: 'DOCA-01', lote: '231000114', codRefer: '', descItem: 'CLORETO DE SODIO CRISTAL', qtAlocada: 0, qtidadeAtu: 25.0, qtAlocPed: 0, qtAlocProd: 0, dtValiLote: '2029-03-17', qtDisponivelCalc: 25.0 },
        { codEmpresa: '001', itCodigo: 'PI0010', codEstab: '101', codDep: 'ALM', codLocal: 'A-01-01', lote: '', codRefer: 'PAD', descItem: 'TUBO ACO CARBONO SCH 40 1/2 6000MM', qtAlocada: 0, qtidadeAtu: 120.0, qtAlocPed: 0, qtAlocProd: 0, dtValiLote: '', qtDisponivelCalc: 120.0 },
        { codEmpresa: '001', itCodigo: '01010115', codEstab: '101', codDep: 'AL1', codLocal: 'BRANCO', lote: '', codRefer: '', descItem: 'Porta Latas Simples 348 x 91 x 115mm 01010115', qtAlocada: 0, qtidadeAtu: 50.0, qtAlocPed: 0, qtAlocProd: 0, dtValiLote: '', qtDisponivelCalc: 50.0 },
        { codEmpresa: '001', itCodigo: '01010125', codEstab: '101', codDep: 'AL1', codLocal: 'BRANCO', lote: '', codRefer: '', descItem: 'Kit Pistão a Gás 50N Cinza', qtAlocada: 0, qtidadeAtu: 6371.0, qtAlocPed: 0, qtAlocProd: 0, dtValiLote: '', qtDisponivelCalc: 6371.0 },
        { codEmpresa: '002', itCodigo: '052900017', codEstab: '2100', codDep: '102', codLocal: '4-2-2', lote: 'LT-AGRO-90', codRefer: 'SAF26', descItem: 'ANTIFERRUGEM INDUSTRIAL PROTETIVO', qtAlocada: 0, qtidadeAtu: 350.0, qtAlocPed: 0, qtAlocProd: 0, dtValiLote: '2028-12-31', qtDisponivelCalc: 350.0 }
      ],

      // inventario (fcGetInventariosFichas.p / fcSetInventarioApuracaoFicha.p / fcSetInventarioNovaFicha.p)
      // situacao: 1-Atualiza, 2-Nao Atualiza, 3-Inventario OK, 4-OK p/Inventario
      inventario: [
        // Empresa 001 - Filial 101 - Data 2026-11-16 (Liberado, permContgUsFc: false)
        {
          codEmpresa: '001', nrFicha: 1, dtSaldo: '2026-11-16', codEstabel: '101', codDepos: 'ALM',
          codLocaliz: 'A-01-01', lote: 'LT-2026-01', codRefer: '', itCodigo: '11000015',
          qtidadeAtu: 120.0, valApurado: [null, null, null], codConfteContag: ['', '', ''],
          situacao: 4, cdnAgrup: 10, dtValiLote: '2028-06-30', valorMat: [0,0,0], valorMob: [0,0,0], valorGgf: [0,0,0]
        },
        {
          codEmpresa: '001', nrFicha: 2, dtSaldo: '2026-11-16', codEstabel: '101', codDepos: 'ALM',
          codLocaliz: 'A-01-02', lote: 'LT-2026-02', codRefer: '', itCodigo: '11000015',
          qtidadeAtu: 45.0, valApurado: [45.0, null, null], codConfteContag: ['aamaral', '', ''],
          situacao: 4, cdnAgrup: 10, dtValiLote: '2028-09-15', valorMat: [0,0,0], valorMob: [0,0,0], valorGgf: [0,0,0]
        },
        {
          codEmpresa: '001', nrFicha: 3, dtSaldo: '2026-11-16', codEstabel: '101', codDepos: 'ALM',
          codLocaliz: 'B-02-01', lote: '211000049', codRefer: '', itCodigo: '11500028',
          qtidadeAtu: 4500.0, valApurado: [4480.0, null, null], codConfteContag: ['conferente1', '', ''],
          situacao: 4, cdnAgrup: 10, dtValiLote: '2027-07-20', valorMat: [0,0,0], valorMob: [0,0,0], valorGgf: [0,0,0]
        },
        {
          codEmpresa: '001', nrFicha: 4, dtSaldo: '2026-11-16', codEstabel: '101', codDepos: 'ALM',
          codLocaliz: 'A-01-01', lote: '', codRefer: 'PAD', itCodigo: 'PI0010',
          qtidadeAtu: 120.0, valApurado: [110.0, 115.0, null], codConfteContag: ['conferente1', 'conferente2', ''],
          situacao: 4, cdnAgrup: 10, dtValiLote: '', valorMat: [0,0,0], valorMob: [0,0,0], valorGgf: [0,0,0]
        },
        {
          codEmpresa: '001', nrFicha: 5, dtSaldo: '2026-11-16', codEstabel: '101', codDepos: 'ALM',
          codLocaliz: 'A-01-01', lote: '', codRefer: '', itCodigo: 'PI0020',
          qtidadeAtu: 45.0, valApurado: [null, null, null], codConfteContag: ['', '', ''],
          situacao: 2, cdnAgrup: 10, dtValiLote: '', valorMat: [0,0,0], valorMob: [0,0,0], valorGgf: [0,0,0]
        },
        {
          codEmpresa: '001', nrFicha: 6, dtSaldo: '2026-11-16', codEstabel: '101', codDepos: 'EXP',
          codLocaliz: 'DOCA-01', lote: '231000114', codRefer: '', itCodigo: '11000028',
          qtidadeAtu: 25.0, valApurado: [null, null, null], codConfteContag: ['', '', ''],
          situacao: 4, cdnAgrup: 20, dtValiLote: '2029-03-17', valorMat: [0,0,0], valorMob: [0,0,0], valorGgf: [0,0,0]
        },
        {
          codEmpresa: '001', nrFicha: 7, dtSaldo: '2026-11-16', codEstabel: '101', codDepos: 'EXP',
          codLocaliz: 'DOCA-02', lote: '', codRefer: '', itCodigo: 'PI0030',
          qtidadeAtu: 30.0, valApurado: [null, null, null], codConfteContag: ['', '', ''],
          situacao: 4, cdnAgrup: 20, dtValiLote: '', valorMat: [0,0,0], valorMob: [0,0,0], valorGgf: [0,0,0]
        },
        {
          codEmpresa: '001', nrFicha: 8, dtSaldo: '2026-11-16', codEstabel: '101', codDepos: 'PRO',
          codLocaliz: 'LIN-01', lote: '', codRefer: '', itCodigo: 'PI0440',
          qtidadeAtu: 18.0, valApurado: [null, null, null], codConfteContag: ['', '', ''],
          situacao: 4, cdnAgrup: 20, dtValiLote: '', valorMat: [0,0,0], valorMob: [0,0,0], valorGgf: [0,0,0]
        },
        // Empresa 001 - Filial 101 - Data 2026-11-10 (Inventário Bloqueado indSitInv = 2)
        {
          codEmpresa: '001', nrFicha: 101, dtSaldo: '2026-11-10', codEstabel: '101', codDepos: 'ALM',
          codLocaliz: 'A-01-01', lote: 'LT-2026-01', codRefer: '', itCodigo: '11000015',
          qtidadeAtu: 90.0, valApurado: [null, null, null], codConfteContag: ['', '', ''],
          situacao: 4, cdnAgrup: 10, dtValiLote: '2028-06-30', valorMat: [0,0,0], valorMob: [0,0,0], valorGgf: [0,0,0]
        },
        // Empresa 002 - Filial 2100 - Data 2026-11-15 (permContgUsFc = true)
        {
          codEmpresa: '002', nrFicha: 1, dtSaldo: '2026-11-15', codEstabel: '2100', codDepos: '102',
          codLocaliz: '4-2-2', lote: 'LT-AGRO-90', codRefer: 'SAF26', itCodigo: '052900017',
          qtidadeAtu: 350.0, valApurado: [340.0, null, null], codConfteContag: ['aamaral', '', ''],
          situacao: 4, cdnAgrup: 100, dtValiLote: '2028-12-31', valorMat: [0,0,0], valorMob: [0,0,0], valorGgf: [0,0,0]
        },
        {
          codEmpresa: '002', nrFicha: 2, dtSaldo: '2026-11-15', codEstabel: '2100', codDepos: '102',
          codLocaliz: '4-3-4', lote: '', codRefer: '', itCodigo: '052900019',
          qtidadeAtu: 80.0, valApurado: [null, null, null], codConfteContag: ['', '', ''],
          situacao: 4, cdnAgrup: 100, dtValiLote: '', valorMat: [0,0,0], valorMob: [0,0,0], valorGgf: [0,0,0]
        },
        {
          codEmpresa: '002', nrFicha: 3, dtSaldo: '2026-11-15', codEstabel: '2100', codDepos: '105',
          codLocaliz: 'OF-01', lote: '', codRefer: '', itCodigo: '052900120',
          qtidadeAtu: 14.0, valApurado: [null, null, null], codConfteContag: ['', '', ''],
          situacao: 4, cdnAgrup: 100, dtValiLote: '', valorMat: [0,0,0], valorMob: [0,0,0], valorGgf: [0,0,0]
        }
      ],

      // Histórico de Contagens / Trilha de Auditoria (Mono-empresa com codEmpresa)
      historico_contagens: [
        {
          idHist: 1,
          codEmpresa: '001',
          dtSaldo: '2026-11-16',
          codEstabel: '101',
          codDepos: 'ALM',
          nrFicha: 2,
          itCodigo: '11000015',
          descItem: 'CARBONATO DE CALCIO (PA)',
          lote: 'LT-2026-02',
          codLocaliz: 'A-01-02',
          codRefer: '',
          nrContagem: 1,
          qtApurada: 45.0,
          qtContabil: 45.0,
          divergencia: 0.0,
          codUsuario: 'aamaral',
          codMobile: 'COL-ZEBRA-101',
          dtLeitura: '2026-11-16 09:10:00',
          statusEnvio: 'Sincronizado',
          origem: 'Coletor Industrial'
        },
        {
          idHist: 2,
          codEmpresa: '001',
          dtSaldo: '2026-11-16',
          codEstabel: '101',
          codDepos: 'ALM',
          nrFicha: 3,
          itCodigo: '11500028',
          descItem: 'ACETATO DE ISOPROPILA GRAU FARMA',
          lote: '211000049',
          codLocaliz: 'B-02-01',
          codRefer: '',
          nrContagem: 1,
          qtApurada: 4480.0,
          qtContabil: 4500.0,
          divergencia: -20.0,
          codUsuario: 'conferente1',
          codMobile: 'COL-HONEYWELL-02',
          dtLeitura: '2026-11-16 09:35:00',
          statusEnvio: 'Sincronizado',
          origem: 'Coletor Industrial'
        }
      ]
    };
  }

  _gerarItensIniciais() {
    const baseEmp1 = [
      { itCodigo: '11000015', descItem: 'CARBONATO DE CALCIO (PA)', tipoConEst: 3, locUnica: true, depositoPad: 'ALM', nomeDeposito: 'ALMOXARIFADO CENTRAL', codLocaliz: 'A-01-01', descricaoLocaliz: 'RUA A - PRATELEIRA 01 - NIVEL 01', un: 'KG', codBarras: '7891100000151', requerValorFicha: false },
      { itCodigo: '11000028', descItem: 'CLORETO DE SODIO CRISTAL', tipoConEst: 3, locUnica: false, depositoPad: 'EXP', nomeDeposito: 'EXPEDICAO PRODUTOS', codLocaliz: 'DOCA-01', descricaoLocaliz: 'DOCA DE EXPEDICAO 01', un: 'KG', codBarras: '7891100000281', requerValorFicha: false },
      { itCodigo: '11500028', descItem: 'ACETATO DE ISOPROPILA GRAU FARMA', tipoConEst: 3, locUnica: true, depositoPad: 'ALM', nomeDeposito: 'ALMOXARIFADO CENTRAL', codLocaliz: 'B-02-01', descricaoLocaliz: 'RUA B - PRATELEIRA 02 - NIVEL 01', un: 'KG', codBarras: 'R2200000016883', requerValorFicha: true },
      { itCodigo: '33500002', descItem: 'BENZOATO DE SODIO EM PO', tipoConEst: 3, locUnica: true, depositoPad: 'ALM', nomeDeposito: 'ALMOXARIFADO CENTRAL', codLocaliz: 'A-01-02', descricaoLocaliz: 'RUA A - PRATELEIRA 01 - NIVEL 02', un: 'KG', codBarras: '7893350000025', requerValorFicha: false },
      { itCodigo: 'PI0010', descItem: 'TUBO ACO CARBONO SCH 40 1/2 6000MM', tipoConEst: 4, locUnica: false, depositoPad: 'ALM', nomeDeposito: 'ALMOXARIFADO CENTRAL', codLocaliz: 'A-01-01', descricaoLocaliz: 'RUA A - PRATELEIRA 01 - NIVEL 01', un: 'PC', codBarras: '7897000000104', requerValorFicha: false },
      { itCodigo: 'PI0020', descItem: 'VALVULA ESFERA TRIPARTIDA INOX 1/2 BSP', tipoConEst: 1, locUnica: true, depositoPad: 'ALM', nomeDeposito: 'ALMOXARIFADO CENTRAL', codLocaliz: 'A-01-01', descricaoLocaliz: 'RUA A - PRATELEIRA 01 - NIVEL 01', un: 'PC', codBarras: '7897000000203', requerValorFicha: true },
      { itCodigo: 'PI0030', descItem: 'FLANGE SOBREPOSTO 150 LBS 1/2 POL', tipoConEst: 1, locUnica: true, depositoPad: 'EXP', nomeDeposito: 'EXPEDICAO PRODUTOS', codLocaliz: 'DOCA-02', descricaoLocaliz: 'DOCA DE EXPEDICAO 02', un: 'PC', codBarras: '7897000000302', requerValorFicha: false },
      { itCodigo: 'PI0041', descItem: 'CURVA 90 RAIO LONGO SCH 40 1/2', tipoConEst: 1, locUnica: true, depositoPad: 'ALM', nomeDeposito: 'ALMOXARIFADO CENTRAL', codLocaliz: 'A-01-02', descricaoLocaliz: 'RUA A - PRATELEIRA 01 - NIVEL 02', un: 'PC', codBarras: '7897000000418', requerValorFicha: false },
      { itCodigo: 'PI0440', descItem: 'ELETRODO SOLDA INOX 316L 2.5MM', tipoConEst: 1, locUnica: true, depositoPad: 'PRO', nomeDeposito: 'DEPOSITO PRODUCAO', codLocaliz: 'LIN-01', descricaoLocaliz: 'LINHA DE MONTAGEM 01', un: 'KG', codBarras: '7897000004409', requerValorFicha: false },
      { itCodigo: 'PI0600', descItem: 'REGULADOR PRESSAO ALTA VAZAO 50KG/H', tipoConEst: 3, locUnica: true, depositoPad: 'ALM', nomeDeposito: 'ALMOXARIFADO CENTRAL', codLocaliz: 'B-02-01', descricaoLocaliz: 'RUA B - PRATELEIRA 02 - NIVEL 01', un: 'PC', codBarras: '7897000006007', requerValorFicha: true },
      { itCodigo: '01010115', descItem: 'Porta Latas Simples 348 x 91 x 115mm 01010115', tipoConEst: 1, locUnica: false, depositoPad: 'AL1', nomeDeposito: 'Almoxarifado 1', codLocaliz: 'BRANCO', descricaoLocaliz: 'BRANCO', un: 'Un', codBarras: '7890101011500', requerValorFicha: false },
      { itCodigo: '01010125', descItem: 'Kit Pistão a Gás 50N Cinza', tipoConEst: 1, locUnica: false, depositoPad: 'AL1', nomeDeposito: 'Almoxarifado 1', codLocaliz: 'BRANCO', descricaoLocaliz: 'BRANCO', un: 'Un', codBarras: '7890101012507', requerValorFicha: false },
      { itCodigo: '01010047', descItem: 'Kit Pont Prince (10) Unidades', tipoConEst: 1, locUnica: true, depositoPad: 'AL1', nomeDeposito: 'Almoxarifado 1', codLocaliz: 'BRANCO', descricaoLocaliz: 'BRANCO', un: 'UN', codBarras: '7890101004700', requerValorFicha: false },
      { itCodigo: 'D352-221/1', descItem: 'Roupeiro Lumiere 6Pts 6Gav Cinamomo/Off White Vol 1/5', tipoConEst: 3, locUnica: false, depositoPad: 'AST', nomeDeposito: 'ASSISTENCIA TECNICA', codLocaliz: '', descricaoLocaliz: 'BRANCO', un: 'UN', codBarras: '7890000352221', requerValorFicha: false }
    ].map(it => ({ codEmpresa: '001', ...it, dataAtualiz: '2026-11-16T08:00:00Z' }));

    // Adiciona mais 40 itens gerados para validar carga progressiva em chunks na Empresa 001
    for (let i = 1; i <= 40; i++) {
      const cod = `MP-${String(i).padStart(4, '0')}`;
      baseEmp1.push({
        codEmpresa: '001',
        itCodigo: cod,
        descItem: `COMPONENTE INDUSTRIAL PADRAO ${cod}`,
        tipoConEst: (i % 3 === 0) ? 3 : 1,
        locUnica: true,
        depositoPad: 'ALM',
        nomeDeposito: 'ALMOXARIFADO CENTRAL',
        codLocaliz: 'A-01-01',
        descricaoLocaliz: 'RUA A - PRATELEIRA 01 - NIVEL 01',
        un: 'UN',
        codBarras: `78990000${String(i).padStart(5, '0')}`,
        requerValorFicha: false,
        dataAtualiz: '2026-11-16T08:00:00Z'
      });
    }

    const baseEmp2 = [
      { codEmpresa: '002', itCodigo: '052900017', descItem: 'ANTIFERRUGEM INDUSTRIAL PROTETIVO', tipoConEst: 3, locUnica: true, depositoPad: '102', nomeDeposito: 'DEPOSITO GERAL FAZENDA', codLocaliz: '4-2-2', descricaoLocaliz: 'GALPAO 4 CORREDOR 2 NIVEL 2', un: 'LT', codBarras: '7890529000172', requerValorFicha: false, dataAtualiz: '2026-11-15T08:00:00Z' },
      { codEmpresa: '002', itCodigo: '052900019', descItem: 'LUBRIFICANTE SPRAY MULTIUSO', tipoConEst: 1, locUnica: true, depositoPad: '102', nomeDeposito: 'DEPOSITO GERAL FAZENDA', codLocaliz: '4-3-4', descricaoLocaliz: 'GALPAO 4 CORREDOR 3 NIVEL 4', un: 'UN', codBarras: '7890529000196', requerValorFicha: false, dataAtualiz: '2026-11-15T08:00:00Z' },
      { codEmpresa: '002', itCodigo: '052900120', descItem: 'FILTRO DE OLEO COMBUSTIVEL', tipoConEst: 1, locUnica: true, depositoPad: '105', nomeDeposito: 'OFICINA E PECAS', codLocaliz: 'OF-01', descricaoLocaliz: 'BANCADA OFICINA 01', un: 'PC', codBarras: '7890529001209', requerValorFicha: false, dataAtualiz: '2026-11-15T08:00:00Z' },
      { codEmpresa: '002', itCodigo: 'AGRO-9901', descItem: 'FERTILIZANTE NPK 20-05-20 SACO 50KG', tipoConEst: 3, locUnica: true, depositoPad: '102', nomeDeposito: 'DEPOSITO GERAL FAZENDA', codLocaliz: '4-2-2', descricaoLocaliz: 'GALPAO 4 CORREDOR 2 NIVEL 2', un: 'SC', codBarras: '7890529990015', requerValorFicha: true, dataAtualiz: '2026-11-15T08:00:00Z' }
    ];

    return [...baseEmp1, ...baseEmp2];
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.estabelec && parsed.inventario) {
          this.data = parsed;
        }
      } else {
        this.saveToDisk();
      }
    } catch (err) {
      console.warn('Aviso ao ler totvs_db.json, utilizando dados iniciais:', err.message);
    }
  }

  saveToDisk() {
    try {
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.storageFile, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Erro ao salvar totvs_db.json:', err.message);
    }
  }

  resetDefault() {
    this.initDefaultData();
    this.saveToDisk();
  }

  matchEmpresa(a, b) {
    return matchEmpresa(a, b);
  }

  normalizarEmpresa(ep) {
    return normalizarEmpresa(ep);
  }
}

module.exports = new TotvsDataStore();
