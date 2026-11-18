// scripts/captureE2EEvidence.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const debugPort = 9222;

async function run() {
  console.log('Iniciando Edge headless com remote debugging...');
  const edge = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--user-data-dir=' + path.join(__dirname, '../.edge-temp-profile'),
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000'
  ], { detached: false });

  // Aguardar porta 9222 abrir
  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json`);
      const tabs = await res.json();
      if (tabs && tabs.length > 0 && tabs[0].webSocketDebuggerUrl) {
        wsUrl = tabs[0].webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    edge.kill();
    throw new Error('Falha ao obter WebSocket do Edge DevTools');
  }

  console.log('Conectando ao Edge via CDP WebSocket:', wsUrl);
  const ws = new WebSocket(wsUrl);

  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  await new Promise((resolve) => ws.onopen = resolve);

  function sendCmd(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evalCode(expression) {
    const res = await sendCmd('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    return res.result?.value;
  }

  async function saveScreenshot(filename) {
    const res = await sendCmd('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(res.data, 'base64');
    const artifactPath = path.join('C:\\Users\\marce\\.gemini\\antigravity\\brain\\892a9681-92a4-4047-9a19-333a114b18bc', filename);
    fs.writeFileSync(artifactPath, buf);
    console.log(`[EVIDÊNCIA SALVA] ${artifactPath} (${buf.length} bytes)`);
    return artifactPath;
  }

  try {
    await sendCmd('Page.enable');
    await sendCmd('Runtime.enable');
    await sendCmd('Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log('Esperando app carregar...');
    await new Promise(r => setTimeout(r, 1500));

    // Realizar login no app
    console.log('Preenchendo login...');
    await evalCode(`
      (function() {
        const selAlias = document.getElementById('login-alias');
        if (selAlias) selAlias.value = 'demo';
        const inpUser = document.getElementById('login-usuario');
        if (inpUser) inpUser.value = 'matheus.st';
        const inpPass = document.getElementById('login-senha');
        if (inpPass) inpPass.value = 'qwe8451';
        const selEmp = document.getElementById('login-empresa');
        if (selEmp) selEmp.value = '001';
        App.fazerLogin();
      })()
    `);

    await new Promise(r => setTimeout(r, 1500));

    // Acessar Inventário Físico
    console.log('Acessando inventários...');
    await evalCode(`App.navegar('inventarios_ativos')`);
    await new Promise(r => setTimeout(r, 800));

    // Entrar no inventário da data 2026-11-16
    console.log('Entrando no inventário 2026-11-16...');
    await evalCode(`App.entrarNoInventario('2026-11-16')`);
    await new Promise(r => setTimeout(r, 800));

    // Entrar no depósito ALM
    console.log('Entrando no depósito ALM...');
    await evalCode(`App.entrarNoDeposito('ALM')`);
    await new Promise(r => setTimeout(r, 1200));

    // 1. Screenshot da Aba 1: Apuração CE0712
    console.log('Capturando Aba Apuração CE0712...');
    await evalCode(`App.alternarAbaInventario('APURACAO')`);
    await new Promise(r => setTimeout(r, 800));
    await saveScreenshot('evidencia_aba_apuracao_ce0712.png');

    // 2. Screenshot da Aba 2: Inclusão de Ficha Avulsa
    console.log('Capturando Aba Inclusão de Ficha Avulsa...');
    await evalCode(`App.alternarAbaInventario('AVULSA')`);
    await new Promise(r => setTimeout(r, 800));
    await saveScreenshot('evidencia_aba_inclusao_ficha_avulsa.png');

    console.log('SUCESSO: Evidências capturadas!');
  } finally {
    ws.close();
    edge.kill();
  }
}

run().catch(err => {
  console.error('[ERRO]', err);
  process.exit(1);
});
