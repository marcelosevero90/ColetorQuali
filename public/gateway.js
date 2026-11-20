// public/gateway.js - Configuração e Resolução de Ponte / Gateway para o Coletor Quali
window.ColetorGateway = {
  // Retorna a URL base do gateway (ou da Vercel)
  getBaseUrl() {
    const salvo = (localStorage.getItem('coletor_gateway_url') || '').trim();
    if (salvo) return salvo.replace(/\/+$/, '');

    // Se estiver rodando em desenvolvimento local no PC com servidor local (porta 3000 ou 3333)
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.port === '3000' || window.location.port === '3333') {
        return '';
      }
      // Se estiver rodando na própria Vercel no navegador web
      if (window.location.hostname === 'coletorquali.vercel.app') {
        return '';
      }
    }

    // No APK Android (Capacitor/Cordova/WebView) ou qualquer outro ambiente:
    // OBRIGATÓRIO buscar no servidor oficial da Vercel
    return 'https://coletorquali.vercel.app';
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
      window.location.protocol === 'file:' ||
      (window.location.hostname === 'localhost' && window.location.port !== '3000' && window.location.port !== '3333')
    );
  },

  // Retorna a URL oficial para consulta e resolução de ALIAS (Discovery)
  getDiscoveryUrl(alias) {
    const base = this.getBaseUrl();
    const cleanBase = base ? base.replace(/\/+$/, '') : '';
    return `${cleanBase}/api/discovery/resolve?alias=${encodeURIComponent(alias)}`;
  },

  // Constrói a URL final resolvendo proxy e gateway
  resolveApiUrl(pathOrFullUrl) {
    const base = this.getBaseUrl();
    const isFullUrl = pathOrFullUrl.startsWith('http://') || pathOrFullUrl.startsWith('https://');

    if (isFullUrl) {
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

// Interceptador transparente de fetch para /api/* em ambiente nativo Capacitor/Cordova ou quando Gateway/Vercel estiver ativo
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(resource, init) {
    if (typeof resource === 'string') {
      const base = window.ColetorGateway ? window.ColetorGateway.getBaseUrl() : 'https://coletorquali.vercel.app';
      if (base && resource.startsWith('/api/')) {
        resource = `${base}${resource}`;
      }
    }
    return originalFetch.call(this, resource, init);
  };
})();
