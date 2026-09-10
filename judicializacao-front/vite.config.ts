import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // AVISO DE AMBIENTE (GO @R 10/09/2026, cartão perguntas_medcheck_5decisoes): o componente
  // `AvisoAmbiente` avisa na tela quando este front está falando com PRODUÇÃO. Ele lê
  // `import.meta.env.VITE_PROXY_API` — a MESMA variável que o proxy abaixo usa como alvo, exposta
  // ao bundle pelo prefixo `VITE_`, sem precisar de `define`.
  //
  // ⚠ Tentei `define: { __API_ALVO__: ... }` primeiro e ERA UMA ARMADILHA: funciona no build e
  // NÃO no dev (o Vite não aplica `define` ao módulo servido individualmente), então o aviso
  // ficava invisível justamente no localhost, onde é a única proteção. Não reintroduzir.
  server: {
    host: true,
    // /mnt (9p/drvfs) não entrega eventos inotify → HMR não vê edições.
    // Polling garante hot-reload no WSL sobre disco Windows.
    watch: { usePolling: true, interval: 300 },
    // libera o domínio do túnel zrok (preview do ambiente local)
    allowedHosts: ['.share.zrok.io', '.zrok.io', 'localhost'],
    // 1 túnel serve front + API: /api → Django local (evita CORS e 2º túnel)
    // Alvo do proxy vem do ambiente: `VITE_PROXY_API=https://api-judicializacao.medchecksaude.com.br
    // VITE_API_URL=/api npm run dev` mostra as telas novas com DADO REAL sem esbarrar em CORS
    // (28/08: banco local fora; @R quis validar as melhorias no localhost). Default = Django local.
    // ⚠ CORREÇÃO 10/09: este comentário dizia `judicializacao.medchecksaude.com.br` — que é o
    // domínio do FRONT, ¬da API. Ele devolve HTML 200 em /api/ (medido), então o proxy "funciona"
    // e a tela quebra depois, longe da causa. A API é `api-judicializacao...`, que devolve 401.
    // Falsificador de 1 comando: `curl -s -o /dev/null -w '%{http_code}' :5173/api/` — 401 = a
    // API real respondeu; 200 = veio o HTML do Vite (ou do front de produção) e o proxy mentiu.
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_API || 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  // MESMO proxy para `vite preview` (o build de produção rodando local). Serve para
  // conferir o pacote EXATO que vai ao Netlify antes de pedir revisão — build verde
  // não prova tela viva, e o dev-server esconde diferenças (React em modo dev).
  preview: {
    host: true,
    allowedHosts: ['.share.zrok.io', '.zrok.io', 'localhost'],
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_API || 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
