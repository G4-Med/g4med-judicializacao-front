import { Avatar } from 'primereact/avatar'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout } from '../../services/auth'
import { setTheme } from '../../utils/theme'
import { getEmailsPendentesCount, getNotificacoesCentral } from '../../services/api/orders'
import { getMinhaSessao, trocarMinhaSenha } from '../../services/api/client'
import { readAuthProfile } from '../../access/authProfile'
import { chaveOnboardingHome } from '../onboarding/useHomeOnboarding'
// Marca G4MED — lockup canônico 3 blocos (G|4|MED), asset do acervo oficial da marca
// SVG A0 (Anton, manual v2) é o canônico; os PNG logo-g4med-*.png são rasterizados DELE (fallback fiel).
// NUNCA usar o antigo logog4med_REPROVADA_* (5 blocos com serifa — lockup reprovado).
import logo from '../../assets/logo-g4med-preta.svg'
import { AjudaModal } from '../../components/AjudaModal/AjudaModal'
import './Header.css'

interface MinhaSessao {
  username: string;
  nome: string;
  grupo: string | null;
  lastLogin: string | null;
  loginCount: number;
  sessaoDesde: string | null;
  sessaoAtivaProvavel: boolean;
}

interface NotificacaoCentral {
  aguardandoJuridico: { quantidade: number; nota: string };
  slaEstourado: { quantidade: number; itens: { order_id: number; paciente: string; fase: string; atraso_dias: number }[]; nota: string };
}

const GRUPOS_COM_CENTRAL = new Set(['ADMIN', 'GERENTE', 'JURIDICO', 'SUPERVISOR']);

interface Props {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: Props) {
  const [dark, setDark] = useState(false)
  const [emailsPendentes, setEmailsPendentes] = useState(0)
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false)
  const [ajudaAberta, setAjudaAberta] = useState(false)
  const [central, setCentral] = useState<NotificacaoCentral | null>(null)
  const [perfilAberto, setPerfilAberto] = useState(false)
  const [minhaSessao, setMinhaSessao] = useState<MinhaSessao | null>(null)
  const [trocarSenhaVisible, setTrocarSenhaVisible] = useState(false)
  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [senhaNovaConfirma, setSenhaNovaConfirma] = useState('')
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const navigate = useNavigate()
  const notificacoesRef = useRef<HTMLDivElement | null>(null)
  const perfilRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light'
    if (savedTheme === 'dark') { setDark(true); setTheme('dark') } else { setTheme('light') }
  }, [])

  useEffect(() => {
    let ativo = true
    const carregar = async () => {
      try {
        const { data } = await getEmailsPendentesCount()
        if (ativo) setEmailsPendentes(data?.quantidade ?? 0)
      } catch { if (ativo) setEmailsPendentes(0) }
    }
    void carregar()
    const id = window.setInterval(() => { void carregar() }, 60000)
    return () => { ativo = false; window.clearInterval(id) }
  }, [])

  useEffect(() => {
    const grupo = readAuthProfile()?.group
    if (!grupo || !GRUPOS_COM_CENTRAL.has(grupo)) return
    let ativo = true
    const carregar = async () => {
      try {
        const { data } = await getNotificacoesCentral()
        if (ativo) setCentral(data)
      } catch { if (ativo) setCentral(null) }
    }
    void carregar()
    const id = window.setInterval(() => { void carregar() }, 120000)
    return () => { ativo = false; window.clearInterval(id) }
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!notificacoesRef.current) return
      if (!notificacoesRef.current.contains(e.target as Node)) setNotificacoesAbertas(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!perfilRef.current) return
      if (!perfilRef.current.contains(e.target as Node)) setPerfilAberto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const abrirPerfil = () => {
    const abrindo = !perfilAberto
    setPerfilAberto(abrindo)
    if (abrindo) {
      getMinhaSessao()
        .then(({ data }) => setMinhaSessao(data))
        .catch(() => setMinhaSessao(null))
    }
  }

  const formatarDataHora = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const abrirTrocarSenha = () => {
    setPerfilAberto(false)
    setSenhaAtual('')
    setSenhaNova('')
    setSenhaNovaConfirma('')
    setTrocarSenhaVisible(true)
  }

  // Rever tour (26/08): apaga a marca "já vi" e leva pra Home — se já estiver
  // lá, um reload força o efeito de 1ª-visita a rodar de novo (mesma rota não remonta).
  const reverOnboarding = () => {
    try {
      const usuario = readAuthProfile()?.username ?? ''
      localStorage.removeItem(chaveOnboardingHome(usuario))
    } catch {
      /* sem storage: nada a limpar */
    }
    setPerfilAberto(false)
    if (window.location.pathname === '/home') {
      window.location.reload()
    } else {
      navigate('/home')
    }
  }

  const handleTrocarSenha = async () => {
    if (!senhaAtual || !senhaNova) {
      alert('Preencha a senha atual e a nova senha.')
      return
    }
    if (senhaNova.length < 8) {
      alert('A nova senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (senhaNova !== senhaNovaConfirma) {
      alert('A confirmação não bate com a nova senha.')
      return
    }
    setTrocandoSenha(true)
    try {
      await trocarMinhaSenha(senhaAtual, senhaNova)
      alert('Senha alterada com sucesso.')
      setTrocarSenhaVisible(false)
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Erro ao trocar a senha.')
    } finally {
      setTrocandoSenha(false)
    }
  }

  const toggleTheme = () => {
    const nd = !dark; setDark(nd); setTheme(nd ? 'dark' : 'light')
  }

  return (
    <header className="mc-header">
      <div className="mc-brand">
        <Button
          icon="pi pi-bars"
          text rounded
          className="mc-iconbtn mc-iconbtn--menu"
          onClick={onMenuClick}
          aria-label="Abrir menu"
        />
        <span className="mc-brand__mark">
          <img src={logo} alt="G4MED" style={{ height: 40 }} />
        </span>

        
        </div>

      <div className="mc-header__tools">
        <Button
          icon={dark ? 'pi pi-sun' : 'pi pi-moon'}
          text rounded onClick={toggleTheme} className="mc-iconbtn"
          tooltip={dark ? 'Tema claro' : 'Tema escuro'}
          tooltipOptions={{ position: 'bottom' }}
        />

        <div className="mc-notif" ref={notificacoesRef}>
          <Button
            icon="pi pi-bell"
            text rounded className="mc-iconbtn"
            onClick={() => setNotificacoesAbertas(v => !v)}
            aria-label="Notificações"
          />
          {(() => {
            const total = emailsPendentes + (central?.aguardandoJuridico.quantidade ?? 0) + (central?.slaEstourado.quantidade ?? 0)
            return total > 0 && (
              <span className="mc-iconbtn__dot">{total > 99 ? '99+' : total}</span>
            )
          })()}

          {notificacoesAbertas && (
            <div className="mc-notif__panel">
              <div className="mc-notif__head">Notificações</div>
              <div className="mc-notif__body">
                {emailsPendentes === 0 && !central?.aguardandoJuridico.quantidade && !central?.slaEstourado.quantidade && (
                  <div className="mc-notif__empty">Nenhuma notificação no momento.</div>
                )}

                {emailsPendentes > 0 && (
                  <button
                    type="button"
                    className="mc-notif__item"
                    onClick={() => { setNotificacoesAbertas(false); navigate('/emails') }}
                  >
                    <strong>Emails pendentes</strong>
                    <span>{emailsPendentes} pendência{emailsPendentes > 1 ? 's' : ''} aguardando envio</span>
                  </button>
                )}

                {!!central?.aguardandoJuridico.quantidade && (
                  <button
                    type="button"
                    className="mc-notif__item"
                    onClick={() => { setNotificacoesAbertas(false); navigate('/juridico') }}
                  >
                    <strong>Aguardando Jurídico</strong>
                    <span>{central.aguardandoJuridico.quantidade} pedido{central.aguardandoJuridico.quantidade > 1 ? 's' : ''} sem triagem ainda</span>
                  </button>
                )}

                {!!central?.slaEstourado.quantidade && (
                  <button
                    type="button"
                    className="mc-notif__item mc-notif__item--grave"
                    onClick={() => { setNotificacoesAbertas(false); navigate('/sla') }}
                  >
                    <strong>⚠ SLA estourado</strong>
                    <span>
                      {central.slaEstourado.quantidade} pedido{central.slaEstourado.quantidade > 1 ? 's' : ''} fora do prazo
                      {central.slaEstourado.itens[0] && ` — o mais atrasado: ${central.slaEstourado.itens[0].paciente} (${central.slaEstourado.itens[0].atraso_dias}d)`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <Button
          icon="pi pi-question-circle" text rounded className="mc-iconbtn"
          onClick={() => setAjudaAberta(true)}
          tooltip="Ajuda" tooltipOptions={{ position: 'bottom' }}
        />
        <AjudaModal visible={ajudaAberta} onHide={() => setAjudaAberta(false)} />
        <Button
          icon="pi pi-sign-out"
          text rounded className="mc-iconbtn"
          onClick={logout}
          tooltip="Sair"
          tooltipOptions={{ position: 'bottom' }}
        />

        <div className="mc-perfil" ref={perfilRef}>
          <button type="button" className="mc-perfil__trigger" onClick={abrirPerfil} aria-label="Meu perfil">
            <Avatar icon="pi pi-user" shape="circle" className="mc-avatar" />
          </button>

          {perfilAberto && (
            <div className="mc-notif__panel mc-perfil__panel">
              {!minhaSessao && <div className="mc-notif__empty">Carregando...</div>}

              {minhaSessao && (
                <>
                  <div className="mc-perfil__head">
                    <strong>{minhaSessao.nome}</strong>
                    <span>{minhaSessao.username} · {minhaSessao.grupo ?? 'sem grupo'}</span>
                  </div>

                  <div className="mc-perfil__info">
                    <div className="mc-perfil__info-row">
                      <i className="pi pi-key" />
                      <span>{minhaSessao.loginCount} login{minhaSessao.loginCount === 1 ? '' : 's'} realizado{minhaSessao.loginCount === 1 ? '' : 's'}</span>
                    </div>
                    <div className="mc-perfil__info-row">
                      <i className="pi pi-clock" />
                      <span>Último login: {formatarDataHora(minhaSessao.lastLogin)}</span>
                    </div>
                    <div className="mc-perfil__info-row">
                      <i className="pi pi-circle-fill" style={{ fontSize: '0.55rem', color: 'var(--mc-green-500, #00a651)' }} />
                      <span>Sessão atual desde: {formatarDataHora(minhaSessao.sessaoDesde)}</span>
                    </div>
                  </div>

                  <div className="mc-perfil__actions">
                    <button type="button" className="mc-notif__item" onClick={abrirTrocarSenha}>
                      <i className="pi pi-lock" /> Trocar senha
                    </button>
                    <button type="button" className="mc-notif__item" onClick={reverOnboarding}>
                      <i className="pi pi-compass" /> Rever tour de boas-vindas
                    </button>
                    <button type="button" className="mc-notif__item" onClick={() => { setPerfilAberto(false); logout() }}>
                      <i className="pi pi-sign-out" /> Sair
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog
        header="Trocar senha"
        visible={trocarSenhaVisible}
        style={{ width: '28rem', maxWidth: '95vw' }}
        modal
        onHide={() => setTrocarSenhaVisible(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Senha atual</label>
            <InputText
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Nova senha</label>
            <InputText
              type="password"
              value={senhaNova}
              onChange={(e) => setSenhaNova(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Confirmar nova senha</label>
            <InputText
              type="password"
              value={senhaNovaConfirma}
              onChange={(e) => setSenhaNovaConfirma(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>
        <div className="dialog-footer-actions" style={{ marginTop: '20px' }}>
          <Button label="Cancelar" outlined onClick={() => setTrocarSenhaVisible(false)} />
          <Button
            label={trocandoSenha ? 'Salvando...' : 'Salvar'}
            icon="pi pi-check"
            loading={trocandoSenha}
            disabled={trocandoSenha}
            onClick={handleTrocarSenha}
          />
        </div>
      </Dialog>
    </header>
  )
}
