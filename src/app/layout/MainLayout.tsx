import { AvisoNovaVersao } from './AvisoNovaVersao'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import 'primeflex/primeflex.css'
import '../../styles/medcheck-tokens.css'   // ← ADICIONAR (antes do global.css)
import '../../styles/global.css'
import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { BarraDeCarregamento } from './BarraDeCarregamento'
import { Menu } from './Menu'                // ← trocar MenuSidebar por Menu
import { MenuControlProvider, useMenuControl } from './MenuControlContext'
import { FichaPedidoProvider } from '../../components/FichaPedido/FichaPedidoContext'

// Arrastar-para-rolar horizontal nas tabelas (@R 28/08 03:0x: "barra de rolagem
// lateral e para arrastar para o lado") — delegação global, 1 listener p/ o app.
function usarArrastarTabelas() {
  useEffect(() => {
    let alvo: HTMLElement | null = null
    let startX = 0
    let startScroll = 0
    let arrastou = false
    const down = (e: MouseEvent) => {
      const w = (e.target as HTMLElement).closest?.('.p-datatable-wrapper') as HTMLElement | null
      if (!w || e.button !== 0) return
      if ((e.target as HTMLElement).closest('button, a, input, textarea, select, .p-checkbox, .p-dropdown')) return
      alvo = w; startX = e.pageX; startScroll = w.scrollLeft; arrastou = false
    }
    const move = (e: MouseEvent) => {
      if (!alvo) return
      const dx = e.pageX - startX
      if (Math.abs(dx) > 4) {
        arrastou = true
        alvo.classList.add('mc-arrastando')
        alvo.scrollLeft = startScroll - dx
      }
    }
    const up = (e: MouseEvent) => {
      if (alvo && arrastou) { e.preventDefault(); e.stopPropagation() }
      alvo?.classList.remove('mc-arrastando')
      alvo = null
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up, true)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up, true)
    }
  }, [])
}

/** Barra de rolagem SUPERIOR em toda tabela que transborda (@R 28/08: "deve ter
 *  uma barra superior para ajudar a entender que a tabela tem colunas pra o lado").
 *  Cria uma `.mc-scroll-topo` antes do `.p-datatable-wrapper` com um espaçador da
 *  mesma largura do conteúdo e sincroniza os dois scrollLeft. Observa o DOM porque
 *  as tabelas montam/desmontam por rota e mudam de largura ao esconder colunas. */
function usarBarraSuperior() {
  useEffect(() => {
    const ligar = (w: HTMLElement) => {
      if ((w as any).__mcTopo) return
      const topo = document.createElement('div')
      topo.className = 'mc-scroll-topo'
      const esp = document.createElement('div')
      topo.appendChild(esp)
      w.parentElement?.insertBefore(topo, w)
      ;(w as any).__mcTopo = topo
      const ajustar = () => {
        esp.style.width = `${w.scrollWidth}px`
        topo.style.display = w.scrollWidth > w.clientWidth + 2 ? '' : 'none'
      }
      let trava = false
      topo.addEventListener('scroll', () => { if (trava) return; trava = true; w.scrollLeft = topo.scrollLeft; trava = false })
      w.addEventListener('scroll', () => { if (trava) return; trava = true; topo.scrollLeft = w.scrollLeft; trava = false })
      const ro = new ResizeObserver(ajustar)
      ro.observe(w)
      const tabela = w.querySelector('table')
      if (tabela) ro.observe(tabela)
      ajustar()
    }
    const varrer = () => document.querySelectorAll<HTMLElement>('.p-datatable-wrapper').forEach(ligar)
    varrer()
    const mo = new MutationObserver(varrer)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])
}

function MainLayoutInner() {
  const menu = useMenuControl()
  usarBarraSuperior()
  usarArrastarTabelas()

  return (
    <div style={{ minHeight: '100vh' }}>
      <BarraDeCarregamento />
      <AvisoNovaVersao />
      <Header onMenuClick={menu.toggle} />

      <Menu
        visible={menu.visible}
        onHide={menu.close}
      />

      {/* A ficha do pedido e o aviso de novidade vivem AQUI, e não em cada página:
          montados uma vez, valem para todas as telas (@R 16/09: "é em todas as telas"). */}
      <main style={{ padding: '20px' }}>
        <FichaPedidoProvider>
          <Outlet />
        </FichaPedidoProvider>
      </main>
    </div>
  )
}

export function MainLayout() {
  return (
    <MenuControlProvider>
      <MainLayoutInner />
    </MenuControlProvider>
  )
}