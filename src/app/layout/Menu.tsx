import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAccess } from '../../access/AccessContext'
import { buildMenuItems } from '../navigation/menuConfigClean'
import { DONOS } from '../../pages/processoOperacional/conteudo'
import type { MenuItem } from 'primereact/menuitem'
import './Menu.css'

interface MenuItemComDono extends MenuItem {
  dono?: 'INSTITUTO' | 'G4MED'
}

interface Props {
  visible: boolean
  onHide: () => void
}

interface Section {
  title: string
  items: MenuItem[]
}

const SECTIONS: { title: string; match: (label: string) => boolean }[] = [
  { title: 'Principal', match: (l) => /home|dashboard/i.test(l) },
  { title: 'Operação', match: (l) => /processo|pedido|or[cç]amento|resultado|perda|protocol|segredo|jur[ií]dico|m[eé]dico|relat[oó]rio/i.test(l) },
  { title: 'Admin', match: () => true }, // catch-all
]

function agruparPorSecao(items: MenuItem[]): Section[] {
  const sections: Section[] = SECTIONS.map((s) => ({ title: s.title, items: [] }))
  for (const item of items) {
    const label = String(item.label ?? '')
    const idx = SECTIONS.findIndex((s) => s.match(label))
    const alvo = idx === -1 ? sections.length - 1 : idx
    sections[alvo].items.push(item)
  }
  return sections.filter((s) => s.items.length > 0)
}

function hasActiveChild(item: MenuItem): boolean {
  const children = (item.items ?? []) as MenuItem[]
  return children.some((c) => /menu-active-item/.test(String(c.className ?? '')))
}

// Âncoras pro onboarding (26/08) — driver.js destaca por seletor CSS; só os
// itens citados no tour precisam de marcação, o resto do menu fica livre.
const TOUR_ANCHOR_BY_LABEL: Record<string, string> = {
  Home: 'menu-home',
  'Processo SES-MG': 'menu-protocolos',
  Admin: 'menu-admin',
}

export function Menu({ visible, onHide }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const { canView } = useAccess()

  const items = buildMenuItems({ navigate, currentPath: location.pathname, canView })
  const sections = agruparPorSecao(items)

  // estado: quais itens com filhos estão abertos
  const [open, setOpen] = useState<Record<string, boolean>>({})

  // abre automaticamente o pai cuja rota atual é filha
  useEffect(() => {
    const next: Record<string, boolean> = {}
    sections.forEach((s) => {
      s.items.forEach((item, i) => {
        const key = `${s.title}-${i}`
        if (Array.isArray(item.items) && item.items.length > 0 && hasActiveChild(item)) {
          next[key] = true
        }
      })
    })
    setOpen((prev) => ({ ...next, ...prev }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const isActive = (item: MenuItem): boolean =>
    /menu-active-item/.test(String(item.className ?? ''))

  const toggle = (key: string) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleLeafClick = (item: MenuItem) => {
    if (item.command) item.command({ originalEvent: new Event('click') as any, item })
    // @R 29/08 14:47 — ao fechar o menu, o botão clicado NÃO pode continuar com o foco:
    // ele ficaria dentro de um painel oculto e o navegador bloqueia a interação
    // ("Blocked aria-hidden on an element because its descendant retained focus"),
    // que é o sintoma de "clico na aba e não troca".
    ;(document.activeElement as HTMLElement | null)?.blur()
    onHide()
  }

  return (
    <>
      {visible && <div className="mc-sidebar__backdrop" onClick={onHide} aria-hidden />}
      {/* `inert` tira o painel fechado da navegacao E do foco de uma vez so — e o
          substituto correto do aria-hidden, que sozinho deixava foco preso dentro. */}
      <aside
        className={'mc-sidebar' + (visible ? ' mc-sidebar--open' : '')}
        {...(visible ? {} : ({ inert: true } as any))}
      >
        <div className="mc-sidebar__head">
          <span>Navegação</span>
          <button
            type="button"
            className="mc-sidebar__close"
            onClick={onHide}
            aria-label="Fechar menu"
          >
            <i className="pi pi-times" />
          </button>
        </div>

        <nav className="mc-sidebar__nav">
          {sections.map((section) => (
            <div key={section.title} className="mc-sidebar__section">
              <div className="mc-side-group">{section.title}</div>

              {section.items.map((item, i) => {
                const key = `${section.title}-${i}`
                const children = (item.items ?? []) as MenuItem[]
                const hasChildren = children.length > 0
                const isOpen = !!open[key]
                const parentActive = isActive(item) || hasActiveChild(item)

                if (!hasChildren) {
                  return (
                    <button
                      key={key}
                      type="button"
                      className={'mc-side-item' + (isActive(item) ? ' mc-side-item--active' : '')}
                      data-tour={TOUR_ANCHOR_BY_LABEL[String(item.label ?? '')]}
                      onClick={() => handleLeafClick(item)}
                    >
                      {item.icon && <i className={String(item.icon)} />}
                      <span title={String(item.label ?? '')}>{item.label}</span>
                    </button>
                  )
                }

                return (
                  <div key={key}>
                    <button
                      type="button"
                      className={
                        'mc-side-item mc-side-item--parent' +
                        (parentActive ? ' mc-side-item--active' : '') +
                        (isOpen ? ' mc-side-item--open' : '')
                      }
                      data-tour={TOUR_ANCHOR_BY_LABEL[String(item.label ?? '')]}
                      onClick={() => toggle(key)}
                      aria-expanded={isOpen}
                    >
                      {item.icon && <i className={String(item.icon)} />}
                      <span title={String(item.label ?? '')}>{item.label}</span>
                      <i
                        className={
                          'pi mc-side-chevron ' + (isOpen ? 'pi-chevron-down' : 'pi-chevron-right')
                        }
                      />
                    </button>

                    {isOpen && (
                      <div className="mc-side-children">
                        {children.map((child, j) => {
                          const dono = (child as MenuItemComDono).dono
                          return (
                            <button
                              key={`${key}-${j}`}
                              type="button"
                              className={
                                'mc-side-item mc-side-item--child' +
                                (isActive(child) ? ' mc-side-item--active' : '')
                              }
                              onClick={() => handleLeafClick(child)}
                            >
                              {child.icon && <i className={String(child.icon)} />}
                              <span title={String(child.label ?? '')}>{child.label}</span>
                              {dono && (
                                <span
                                  className={`mc-side-dono mc-side-dono--${dono.toLowerCase()}`}
                                  title={`Fase conduzida por: ${DONOS[dono].rotulo}`}
                                >
                                  <i className="pi pi-info-circle" />
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
