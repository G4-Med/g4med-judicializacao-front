import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // /mnt (9p/drvfs) não entrega eventos inotify → HMR não vê edições.
    // Polling garante hot-reload no WSL sobre disco Windows.
    watch: { usePolling: true, interval: 300 },
    // libera o domínio do túnel zrok (preview do ambiente local)
    allowedHosts: ['.share.zrok.io', '.zrok.io', 'localhost'],
    // 1 túnel serve front + API: /api → Django local (evita CORS e 2º túnel)
    // Alvo do proxy vem do ambiente: `VITE_PROXY_API=https://judicializacao.medchecksaude.com.br
    // VITE_API_URL=/api npm run dev` mostra as telas novas com DADO REAL sem esbarrar em CORS
    // (28/08: banco local fora; @R quis validar as melhorias no localhost). Default = Django local.
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
