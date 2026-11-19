// public/gateway.js - Configuração e Resolução de Ponte / Gateway para o Coletor Quali
window.ColetorGateway = {
  // Retorna a URL base do gateway (ex: "http://192.168.0.8:3000")
  getBaseUrl() {
    const salvo = (localStorage.getItem('coletor_gateway_url') || '').trim();
    if (salvo) return salvo.replace(/\/+$/, '');

    const isNativeApp = Boolean(
      window.Capacitor ||
      window.cordova ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:'
    );

    // Se estiver rodando dentro de um navegador comum com host acessível, usa caminhos relativos
    if (!isNativeApp && window.location.origin && !window.location.origin.includes('file://')) {
      return '';
    }

    // IP padrão do notebook para testes em APK nativo
    return 'http://192.168.0.8:3000';
  },

  setBaseUrl(url) {
    if (!url || !url.trim()) {
      localStorage.removeItem('coletor_gateway_url');
    } else {
      let clean = url.trim().replace(/\/+$/, '');
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `http://${clean}`;
      }
      localStorage.setItem('coletor_gateway_url', clean);
    }
  },

  isNative() {
    return Boolean(
      window.Capacitor ||
      window.cordova ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:'
    );
  },

  // Constrói a URL final resolvendo proxy e gateway
  resolveApiUrl(pathOrFullUrl) {
    const base = this.getBaseUrl();
    const isFullUrl = pathOrFullUrl.startsWith('http://') || pathOrFullUrl.startsWith('https://');

    if (isFullUrl) {
      // Se for URL externa (ex: PASOE 10.15.1.20:8180) e não for o próprio gateway
      if (!base || !pathOrFullUrl.startsWith(base)) {
        const proxyPath = `/api/pasoe-proxy?url=${encodeURIComponent(pathOrFullUrl)}`;
        return base ? `${base}${proxyPath}` : proxyPath;
      }
      return pathOrFullUrl;
    }

    const cleanPath = pathOrFullUrl.startsWith('/') ? pathOrFullUrl : `/${pathOrFullUrl}`;
    return base ? `${base}${cleanPath}` : cleanPath;
  }
};

// Interceptador transparente de fetch para /api/* em ambiente nativo Capacitor/Cordova ou quando Gateway estiver definido
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(resource, init) {
    if (typeof resource === 'string') {
      const base = window.ColetorGateway ? window.ColetorGateway.getBaseUrl() : '';
      if (base && resource.startsWith('/api/')) {
        resource = `${base}${resource}`;
      }
    }
    return originalFetch.call(this, resource, init);
  };
})();
