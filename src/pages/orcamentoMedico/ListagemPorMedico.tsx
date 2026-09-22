import { useEffect, useMemo, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Tag } from 'primereact/tag';
import { getOrcamentoMedicoPorMedico, registrarRespostaCotacao, CATEGORIAS_RECUSA } from '../../services/api/orders';
import type { MedicoComCasos, CasoPorMedico, RespostaCotacao, CategoriaRecusa } from '../../services/api/orders';
import { invalidarRecusas } from '../../components/Recusas/MarcadorRecusa';

/* #507 (@R 20/09): "uma listagem, não a cobrança" — o que está com CADA médico na fase, com o dia em
   que foi enviado, para mandar a ele de forma fácil e esperar em 48 h a resposta: quer cotar ou não.
   O toggle por caso grava a resposta (quem opera marca; a Eliza-urgência marca pela API com
   origem=eliza quando lê a resposta no canal do médico). O texto copiado só leva os casos SEM
   resposta — quem já disse SIM/NÃO não é perguntado de novo. */
interface Props { visible: boolean; onHide: () => void; onMudou?: () => void }

const copiar = async (texto: string) => {
  if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(texto); return }
  const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta); ta.select()
  document.execCommand('copy'); document.body.removeChild(ta)
}

export default function ListagemPorMedico({ visible, onHide, onMudou }: Props) {
  const [dados, setDados] = useState<MedicoComCasos[]>([])
  const [meta, setMeta] = useState<{ totalPedidos: number; foraPorSegredo: number; prazoHoras: number } | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  /* RECUSA COM MOTIVO (@R 22/09 13:55): antes era só um confirm. Agora quem opera escolhe a
     categoria (é o que permite contar depois "quem recusa por quê") e pode escrever o que o
     médico disse. O texto é obrigatório só em "Outro" — senão a categoria vira lixeira. */
  const [recusa, setRecusa] = useState<{ caso: CasoPorMedico; medico: string; categoria: CategoriaRecusa; motivo: string } | null>(null)
  // @R 20/09 16:20: "cada médico vir fechado para dar para todos e abrir outra coisa, pesquisar por
  // texto também" — com 10 médicos e 38 casos a lista não cabia na tela; agora cada médico é um
  // acordeão fechado e a busca abre só quem tem o que foi digitado.
  const [abertos, setAbertos] = useState<Record<number, boolean>>({})
  const [busca, setBusca] = useState('')
  const alternar = (id: number) => setAbertos((a) => ({ ...a, [id]: !a[id] }))
  const normalizar = (t: string) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const filtrados = useMemo(() => {
    const q = normalizar(busca.trim())
    if (!q) return dados
    return dados
      .map((m) => {
        const medicoBate = normalizar(m.medico.nome).includes(q)
        const casos = medicoBate ? m.casos : m.casos.filter((c) =>
          normalizar(`${c.id} ${c.paciente} ${c.procedimento || ''} ${c.area || ''}`).includes(q))
        return casos.length ? { ...m, casos } : null
      })
      .filter((m): m is MedicoComCasos => !!m)
  }, [dados, busca])

  const carregar = async () => {
    setCarregando(true); setErro(null)
    try {
      const r = await getOrcamentoMedicoPorMedico()
      setDados(r.data.medicos || [])
      setMeta({ totalPedidos: r.data.totalPedidos, foraPorSegredo: r.data.foraPorSegredo, prazoHoras: r.data.prazoHoras })
    } catch (e: any) {
      setErro(e?.response?.data?.error || 'Não foi possível carregar a listagem por médico.')
    } finally { setCarregando(false) }
  }
  useEffect(() => { if (visible) carregar() }, [visible])

  const marcar = async (c: CasoPorMedico, resposta: RespostaCotacao | null, nomeMedico?: string) => {
    let observacao = ''
    if (resposta === 'CONDICIONADO') {
      // #509: "quero cotar MAS preciso de..." — o que falta é o dado; sem ele o back recusa (400).
      const o = window.prompt(`Pedido #${c.id}: o médico quer cotar, mas precisa de quê antes? (ex.: ressonância de joelho)`, c.respostaCotacaoObs || '')
      if (o === null) return
      observacao = o.trim()
      if (!observacao) { alert('Diga o que o médico precisa antes de cotar.'); return }
    }
    if (resposta === 'RECUSOU') {
      // abre o diálogo do motivo; a gravação acontece em `confirmarRecusa`.
      setRecusa({ caso: c, medico: nomeMedico || 'o médico', categoria: 'SEM_INTERESSE', motivo: '' })
      return
    }
    setSalvando(c.id)
    try {
      const r = await registrarRespostaCotacao(c.id, resposta, observacao)
      await carregar(); onMudou?.()
      if (r.data?.devolvidoABusca) alert(`Pedido #${c.id} devolvido à busca de cotador (recusado por ${r.data.cotacaoRecusadaPor || nomeMedico || 'médico'}). Ele está no topo de "Selecionar Médico".`)
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Não foi possível gravar a resposta.')
    } finally { setSalvando(null) }
  }

  const confirmarRecusa = async () => {
    if (!recusa) return
    const { caso, medico, categoria, motivo } = recusa
    if (categoria === 'OUTRO' && !motivo.trim()) { alert('Escreva o motivo — a categoria "Outro" existe para isso.'); return }
    setSalvando(caso.id)
    try {
      const r = await registrarRespostaCotacao(caso.id, 'RECUSOU', motivo.trim(), categoria)
      setRecusa(null)
      invalidarRecusas()
      await carregar(); onMudou?.()
      const ficou = r.data?.ficouCom
      alert(ficou
        ? `Pedido #${caso.id}: recusa de ${medico} registrada. O pedido SEGUE com ${ficou.nome}, que também foi convidado.`
        : `Pedido #${caso.id} devolvido à busca de cotador (recusado por ${r.data?.cotacaoRecusadaPor || medico}). Ele está no topo de "Selecionar Médico".`)
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Não foi possível gravar a recusa.')
    } finally { setSalvando(null) }
  }

  const copiarListagem = async (m: MedicoComCasos) => {
    try { await copiar(m.mensagem); alert(`Listagem de ${m.medico.nome} copiada (${m.semResposta || m.total} caso(s)). Cole no WhatsApp.`) }
    catch { alert('Não foi possível copiar.') }
  }

  const tagResposta = (c: CasoPorMedico) => {
    if (c.respostaCotacao === 'ACEITOU') return <Tag severity="success" value="quer cotar" title={`${c.respostaCotacaoPor || ''} · ${c.respostaCotacaoOrigem || ''}`} />
    if (c.respostaCotacao === 'RECUSOU') return <Tag severity="danger" value="não quer" title={`${c.respostaCotacaoPor || ''} · ${c.respostaCotacaoOrigem || ''}`} />
    if (c.respostaCotacao === 'CONDICIONADO') return <Tag severity="warning" icon="pi pi-hourglass" value={`aguarda: ${c.respostaCotacaoObs || 'exame'}`} title={`quer cotar, mas antes precisa de: ${c.respostaCotacaoObs || ''} · ${c.respostaCotacaoPor || ''} · ${c.respostaCotacaoOrigem || ''}`} />
    const atrasado = (c.diasEsperando ?? 0) >= 2
    return <Tag severity={atrasado ? 'warning' : 'info'} value={atrasado ? `sem resposta há ${c.diasEsperando} d` : 'aguardando'} />
  }

  return (
    <Dialog header="Casos por médico — fase Orçamento" visible={visible} onHide={onHide}
      style={{ width: 'min(1100px, 96vw)' }} maximizable>
      {recusa && (
        <Dialog header={`Por que ${recusa.medico} não vai cotar? · pedido #${recusa.caso.id}`} visible modal
          dismissableMask style={{ width: '32rem', maxWidth: '94vw' }} onHide={() => setRecusa(null)}>
          <p style={{ marginTop: 0 }}>
            O pedido sai deste médico. Se houver OUTRO médico convidado para o mesmo pedido, ele
            segue com esse; senão volta ao topo de "Selecionar Médico" com o aviso da recusa.
          </p>
          <div style={{ display: 'grid', gap: '.4rem', marginBottom: '.8rem' }}>
            {CATEGORIAS_RECUSA.map((op) => (
              <label key={op.valor} style={{ display: 'flex', gap: '.5rem', alignItems: 'center', cursor: 'pointer' }}>
                <input type="radio" name="categoria-recusa" checked={recusa.categoria === op.valor}
                  onChange={() => setRecusa({ ...recusa, categoria: op.valor })} />
                {op.rotulo}
              </label>
            ))}
          </div>
          <InputText value={recusa.motivo} onChange={(e) => setRecusa({ ...recusa, motivo: e.target.value })}
            placeholder="O que o médico disse (opcional, obrigatório em Outro)" style={{ width: '100%' }} />
          <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button label="Cancelar" text severity="secondary" onClick={() => setRecusa(null)} />
            <Button label="Registrar recusa" severity="danger" icon="pi pi-times"
              disabled={salvando === recusa.caso.id} onClick={confirmarRecusa} />
          </div>
        </Dialog>
      )}
      {erro && <div className="p-message p-message-error" style={{ padding: '.5rem 1rem', marginBottom: '.75rem' }}>{erro}</div>}
      {meta && (
        <p style={{ margin: '0 0 .75rem', color: 'var(--text-color-secondary)' }}>
          {meta.totalPedidos} pedido(s) com médico designado · prazo de resposta {meta.prazoHoras} h
          {meta.foraPorSegredo > 0 && <> · <b>{meta.foraPorSegredo}</b> fora por segredo de justiça (não vão a prestador)</>}
        </p>
      )}
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.75rem', flexWrap: 'wrap' }}>
        <span className="p-input-icon-left" style={{ flex: '1 1 18rem' }}>
          <i className="pi pi-search" />
          <InputText value={busca} onChange={(e) => setBusca(e.target.value)} style={{ width: '100%' }}
            placeholder="Buscar médico, paciente, procedimento ou nº do pedido" />
        </span>
        <Button label="Abrir todos" size="small" text onClick={() => setAbertos(Object.fromEntries(dados.map((m) => [m.medico.id, true])))} />
        <Button label="Fechar todos" size="small" text onClick={() => setAbertos({})} />
      </div>
      {carregando && <p>Carregando…</p>}
      {!carregando && dados.length === 0 && !erro && <p>Nenhum pedido com médico designado nesta fase.</p>}
      {!carregando && dados.length > 0 && filtrados.length === 0 && <p>Nada bate com "{busca}".</p>}
      {filtrados.map(m => {
        const aberto = !!abertos[m.medico.id] || !!busca.trim()
        return (
        <div key={m.medico.id} style={{ border: '1px solid var(--surface-border)', borderRadius: 8, padding: '.5rem 1rem', marginBottom: '.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', marginBottom: aberto ? '.5rem' : 0, cursor: 'pointer' }}
            role="button" tabIndex={0} aria-expanded={aberto} onClick={() => alternar(m.medico.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(m.medico.id) } }}>
            <i className={aberto ? 'pi pi-chevron-down' : 'pi pi-chevron-right'} style={{ color: 'var(--text-color-secondary)' }} />
            <strong style={{ fontSize: '1.05rem' }}>{m.medico.nome}</strong>
            <span style={{ color: 'var(--text-color-secondary)' }}>
              {m.total} caso(s) · {m.semResposta} sem resposta · {m.aceitou} quer · {m.condicionado || 0} aguardando exame
            </span>
            <Button label="Copiar listagem" icon="pi pi-whatsapp" size="small" outlined
              title="Copia a lista dos casos sem resposta, com o dia de envio e o pedido de confirmação em 48 h"
              onClick={(e) => { e.stopPropagation(); copiarListagem(m) }} style={{ marginLeft: 'auto' }} />
          </div>
          {aberto && <table className="p-datatable-table" style={{ width: '100%', fontSize: '.9rem' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-color-secondary)' }}>
              <th>Pedido</th><th>Paciente</th><th>Procedimento</th><th>Enviado em</th><th>Resposta</th><th></th>
            </tr></thead>
            <tbody>
              {m.casos.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--surface-border)' }}>
                  <td style={{ padding: '.35rem .25rem' }}>#{c.id}</td>
                  <td style={{ padding: '.35rem .25rem' }}>{c.paciente}</td>
                  <td style={{ padding: '.35rem .25rem' }}>{c.procedimento || c.area || '—'}</td>
                  <td style={{ padding: '.35rem .25rem', whiteSpace: 'nowrap' }}>{c.enviadoEm || '—'}{c.diasEsperando != null && <span style={{ color: 'var(--text-color-secondary)' }}> ({c.diasEsperando} d)</span>}</td>
                  <td style={{ padding: '.35rem .25rem' }}>{tagResposta(c)}</td>
                  <td style={{ padding: '.35rem .25rem', whiteSpace: 'nowrap' }}>
                    <Button icon="pi pi-check" size="small" text severity="success" title="Médico QUER cotar"
                      disabled={salvando === c.id || c.respostaCotacao === 'ACEITOU'} onClick={() => marcar(c, 'ACEITOU')} />
                    <Button icon="pi pi-hourglass" size="small" text severity="warning" title="Médico quer cotar, mas antes precisa de algo (exame, laudo…)"
                      disabled={salvando === c.id} onClick={() => marcar(c, 'CONDICIONADO')} />
                    <Button icon="pi pi-times" size="small" text severity="danger" title="Médico NÃO quer cotar — devolve o pedido à busca de cotador"
                      disabled={salvando === c.id} onClick={() => marcar(c, 'RECUSOU', m.medico.nome)} />
                    {c.respostaCotacao && <Button icon="pi pi-undo" size="small" text severity="secondary" title="Limpar (marquei errado)"
                      disabled={salvando === c.id} onClick={() => marcar(c, null)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
        </div>
      )})}
    </Dialog>
  )
}
