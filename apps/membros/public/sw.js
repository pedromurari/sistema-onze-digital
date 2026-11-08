// Service worker mínimo — existe só pra satisfazer o critério de instalabilidade
// do PWA (Chrome/Android exige um SW com handler de fetch registrado). De
// propósito NÃO fazemos cache agressivo de páginas/API: é uma plataforma de
// conteúdo que muda com frequência (progresso, aulas novas, avaliações), then
// cache velho servindo tela desatualizada seria pior que não ter PWA.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Passthrough puro pra rede — sem cache. Mantém o app sempre atualizado,
// só habilita o "Adicionar à tela inicial".
self.addEventListener('fetch', () => {});
