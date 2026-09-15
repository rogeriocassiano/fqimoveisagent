// Service worker mínimo: necessário para a instalabilidade do PWA.
// Não faz cache — todas as requisições vão direto para a rede,
// evitando servir conteúdo desatualizado ou quebrar autenticação.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
