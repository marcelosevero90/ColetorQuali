// public/scanner.js - Leitura de Código de Barras e QR Code
// Suporta leitores laser industriais (Zebra, Honeywell, Datalogic via keyboard wedge / keydown rápido
// e Broadcast Intent via interface Android/Web) e câmera integrada do dispositivo com mira visual.

const Scanner = (() => {
  let videoElement = null;
  let mediaStream = null;
  let scanInterval = null;
  let hardwareCallback = null;

  let bufferTeclas = '';
  let ultimoTempoTecla = 0;
  let listenerInicializado = false;

  function initHardwareListener(onLeitura) {
    hardwareCallback = onLeitura;
    if (listenerInicializado) return;
    listenerInicializado = true;

    // 1. Captura via eventos de teclado rápido (Keyboard Wedge: Zebra DataWedge, Honeywell ScanWedge, Datalogic)
    window.addEventListener('keydown', (e) => {
      const agora = Date.now();
      const tempoDecorrido = agora - ultimoTempoTecla;
      ultimoTempoTecla = agora;

      // Não interceptar se o usuário estiver digitando manualmente em um campo numérico ou input de senha/login
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const inputType = (document.activeElement?.type || '').toLowerCase();
      const isCampoDigitacao = (tag === 'input' || tag === 'textarea') && inputType !== 'search';

      if (e.key === 'Enter') {
        if (bufferTeclas.length >= 3 && (!isCampoDigitacao || tempoDecorrido < 55)) {
          const codigoLido = bufferTeclas.trim();
          bufferTeclas = '';
          tocarBeep();
          if (hardwareCallback) hardwareCallback(codigoLido, 'HARDWARE_LASER');
          if (!isCampoDigitacao) e.preventDefault();
        } else {
          bufferTeclas = '';
        }
        return;
      }

      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (tempoDecorrido > 80) {
          bufferTeclas = e.key;
        } else {
          bufferTeclas += e.key;
        }
      }
    });

    // 2. Suporte a Broadcast Intents Android (DataWedge / Honeywell Intent Bridge via CustomEvent ou window.onBarcodeScanned)
    window.addEventListener('android-barcode-intent', (e) => {
      const codigo = e?.detail?.data || e?.detail?.barcode || e?.detail;
      if (codigo && String(codigo).trim()) {
        tocarBeep();
        if (hardwareCallback) hardwareCallback(String(codigo).trim(), 'ANDROID_INTENT');
      }
    });

    window.onBarcodeScanned = (codigo) => {
      if (codigo && String(codigo).trim()) {
        tocarBeep();
        if (hardwareCallback) hardwareCallback(String(codigo).trim(), 'ANDROID_INTENT');
      }
    };
  }

  async function abrirCamera(videoElem, onDetect) {
    videoElement = videoElem;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      videoElement.srcObject = mediaStream;
      await videoElement.play();
      iniciarDeteccao(onDetect);
      return true;
    } catch (err) {
      console.warn('Câmera indisponível ou permissão negada:', err);
      return false;
    }
  }

  function iniciarDeteccao(onDetect) {
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'data_matrix']
      });

      scanInterval = setInterval(async () => {
        if (!videoElement || videoElement.readyState < 2) return;
        try {
          const barcodes = await detector.detect(videoElement);
          if (barcodes && barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            tocarBeep();
            pararCamera();
            if (onDetect) onDetect(raw);
          }
        } catch (e) {}
      }, 220);
    } else {
      console.log('BarcodeDetector nativo indisponível neste navegador. Use leitor laser físico ou digitação manual.');
    }
  }

  function pararCamera() {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
      videoElement = null;
    }
  }

  function tocarBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch (e) {}
  }

  function tocarErro() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch (e) {}
  }

  return {
    initHardwareListener,
    abrirCamera,
    pararCamera,
    tocarBeep,
    tocarErro
  };
})();
