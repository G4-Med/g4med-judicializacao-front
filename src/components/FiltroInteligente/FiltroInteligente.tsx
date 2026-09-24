/**
 * FILTRO POR TEXTO INTELIGENTE (@R 23/09 12:41/12:42): "eu digito um texto — pode ser o nome do médico,
 * a cirurgia, a área — e ela usa o cruzamento de dados para fazer um filtro... e explica como ela
 * entende usando a própria tabela... que podemos limpar".
 *
 * A IA recebe só os pedidos que a tabela tem agora (ids) e devolve os que casam + como entendeu +
 * quais colunas usou + o porquê de cada um. Falha da IA NUNCA vira tabela vazia: a tabela fica
 * inteira e o aviso diz que o filtro não rodou.
 */
import { useEffect, useId, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { filtrarTextoIA, getPreferencia, salvarPreferencia, type FiltroTextoResposta, type EscopoFiltro } from '../../services/api/orders';
import { useFichaPedido } from '../FichaPedido/FichaPedidoContext';
import './FiltroInteligente.css';

export interface FiltroAtivo { texto: string; ids: Set<number>; resposta: FiltroTextoResposta }

interface Props {
  idsNaTela: number[];
  ativo: FiltroAtivo | null;
  onMudar: (f: FiltroAtivo | null) => void;
  exemplo?: string;
  /** chave da preferência do usuário onde os filtros salvos ficam (@R 23/09 13:09) — ex.: 'filtros_ia_orcamento_medico' */
  chaveSalvos?: string;
}

export function FiltroInteligente({ idsNaTela, ativo, onMudar, exemplo, chaveSalvos }: Props) {
  // o campo mostra o texto do filtro ATIVO (@R 23/09 13:05: filtro ativo com o campo vazio e aviso de '3 letras')
  const [texto, setTexto] = useState(ativo?.texto ?? '');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [verPorque, setVerPorque] = useState(false);
  // ONDE PROCURAR (#692 + #680, @R 24/09 01:23: "perguntar se queremos procurar em todos os registros ou em um número de
  // registros por período (…) para não só procurar nos ativos da tabela"). Padrão = esta tabela (o de sempre, mais rápido).
  const [onde, setOnde] = useState<'tabela' | 'todos' | 'periodo'>('tabela');
  const hojeIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [ate, setAte] = useState(hojeIso);
  const [de, setDe] = useState(new Date(Date.now() - 90 * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  const nomeGrupo = useId();
  const { abrir, disponivel: fichaDisponivel } = useFichaPedido();
  // FILTROS SALVOS (@R 23/09 13:09): "vir salvando para poder selecionar e excluir — ao excluir, confirmar —
  // para ter uma lista rápida". Por usuário, no servidor (preferencias/<chave>/): vale em qualquer computador.
  const [salvos, setSalvos] = useState<string[]>([]);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [erroSalvos, setErroSalvos] = useState('');
  useEffect(() => {
    if (!chaveSalvos) return;
    getPreferencia(chaveSalvos)
      .then(({ data }) => { const it = (data?.valor as { itens?: unknown })?.itens; setSalvos(Array.isArray(it) ? it.filter((x) => typeof x === 'string') : []); })
      .catch(() => setErroSalvos('Não consegui carregar os filtros salvos.'));
  }, [chaveSalvos]);
  const gravarSalvos = async (lista: string[]) => {
    if (!chaveSalvos) return;
    const antes = salvos;
    setSalvos(lista); setErroSalvos('');
    try { await salvarPreferencia(chaveSalvos, { itens: lista }); }
    catch { setSalvos(antes); setErroSalvos('Não consegui salvar a lista de filtros — nada mudou.'); }
  };
  const podeSalvar = !!chaveSalvos && texto.trim().length >= 3
    && !salvos.some((x) => x.toLowerCase() === texto.trim().toLowerCase());

  const filtrar = async (textoEscolhido?: string) => {
    const t = (textoEscolhido ?? texto).trim();
    if (textoEscolhido !== undefined) setTexto(textoEscolhido);
    if (t.length < 3) { setErro('Digite pelo menos 3 letras.'); return; }
    setCarregando(true); setErro('');
    try {
      if (onde === 'periodo' && (!de || !ate || de > ate)) { setErro('Escolha o período: a data inicial não pode ser depois da final.'); return; }
      const escopo: EscopoFiltro | undefined = onde === 'todos' ? { tipo: 'todos' } : onde === 'periodo' ? { tipo: 'periodo', de, ate } : undefined;
      const { data } = await filtrarTextoIA(t, idsNaTela, escopo);
      onMudar({ texto: t, ids: new Set(data.ids), resposta: data }); setVerPorque(false); setErro('');
    } catch (e) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(`${d || 'A IA não respondeu'} — a tabela continua com todos os pedidos.`);
    } finally { setCarregando(false); }
  };
  const limpar = () => { onMudar(null); setTexto(''); setErro(''); setVerPorque(false); };
  const naTela = new Set(idsNaTela);
  const fora = ativo ? [...ativo.ids].filter((i) => !naTela.has(i)) : [];
  const foraMostrados = fora.slice(0, 50);

  return (
    <section className="filtro-ia" aria-label="Filtro inteligente">
      <header className="filtro-ia__cab">
        <span className="filtro-ia__selo"><i className="pi pi-sparkles" aria-hidden /></span>
        <div>
          <div className="filtro-ia__titulo">Filtro inteligente</div>
          <div className="filtro-ia__sub">Escreva do seu jeito — médico, cirurgia, área ou uma combinação. A IA cruza as colunas e explica.</div>
        </div>
      </header>
      <div className="filtro-ia__linha">
        <span className="filtro-ia__caixa">
          <i className="pi pi-search filtro-ia__lupa" aria-hidden />
        <InputText value={texto} onChange={(e) => { setTexto(e.target.value); setErro(''); }} className="filtro-ia__campo"
          placeholder={exemplo || 'ex.: vascular · Dr. Paulo · prótese de quadril · ortopedia sem médico'}
          onKeyDown={(e) => { if (e.key === 'Enter') void filtrar(); }} disabled={carregando} aria-label="Filtro inteligente por texto" />
        </span>
        <Button label={carregando ? 'Filtrando…' : 'Filtrar com IA'} icon="pi pi-filter" size="small"
          loading={carregando} onClick={() => void filtrar()} />
        {chaveSalvos && (
          <Button label="Salvar filtro" icon="pi pi-bookmark" size="small" outlined disabled={!podeSalvar}
            title={podeSalvar ? 'Guardar este texto na lista rápida' : 'Digite um filtro novo (3+ letras) para salvar'}
            onClick={() => void gravarSalvos([...salvos, texto.trim()].slice(-20))} />
        )}
        {ativo && <Button label="Limpar" icon="pi pi-times" size="small" text severity="secondary" onClick={limpar} />}
      </div>
      <div className="filtro-ia__onde" role="radiogroup" aria-label="Onde procurar">
        <span className="filtro-ia__onde-rotulo">Procurar em:</span>
        {(['tabela', 'todos', 'periodo'] as const).map((o) => (
          <label key={o} className={`filtro-ia__onde-op${onde === o ? ' filtro-ia__onde-op--on' : ''}`}>
            <input type="radio" name={nomeGrupo} checked={onde === o} disabled={carregando} onChange={() => setOnde(o)} />
            {o === 'tabela' ? `esta tabela (${idsNaTela.length})` : o === 'todos' ? 'todos os pedidos' : 'um período'}
          </label>
        ))}
        {onde === 'periodo' && (
          <span className="filtro-ia__periodo">
            chegaram de <input type="date" value={de} max={ate} disabled={carregando} onChange={(e) => setDe(e.target.value)} aria-label="Data inicial" />
            {' '}até <input type="date" value={ate} min={de} disabled={carregando} onChange={(e) => setAte(e.target.value)} aria-label="Data final" />
          </span>
        )}
        {onde !== 'tabela' && <span className="filtro-ia__onde-nota">mais lento — a IA lê {onde === 'todos' ? 'a base inteira' : 'os pedidos do período'} (até ~1 min); o que casar fora desta tabela aparece numa lista abaixo</span>}
      </div>
      {chaveSalvos && salvos.length > 0 && (
        <div className="filtro-ia__salvos" aria-label="Filtros salvos">
          <span className="filtro-ia__salvos-rotulo">Salvos:</span>
          {salvos.map((f) => (
            <span key={f} className={`filtro-ia__chip${ativo?.texto === f ? ' filtro-ia__chip--ativo' : ''}`}>
              <button type="button" className="filtro-ia__chip-txt" disabled={carregando} title="Filtrar com este texto"
                onClick={() => void filtrar(f)}>{f}</button>
              <button type="button" className="filtro-ia__chip-x" aria-label={`Excluir o filtro ${f}`} title="Excluir"
                onClick={() => setExcluindo(f)}>×</button>
            </span>
          ))}
        </div>
      )}
      {erroSalvos && <div className="filtro-ia__erro">{erroSalvos}</div>}
      <Dialog header="Excluir filtro salvo?" visible={!!excluindo} modal style={{ width: '26rem', maxWidth: '95vw' }}
        onHide={() => setExcluindo(null)}
        footer={<div>
          <Button label="Voltar" text onClick={() => setExcluindo(null)} />
          <Button label="Excluir" icon="pi pi-trash" severity="danger"
            onClick={() => { const f = excluindo; setExcluindo(null); if (f) void gravarSalvos(salvos.filter((x) => x !== f)); }} />
        </div>}>
        <p style={{ margin: 0 }}>O filtro <b>"{excluindo}"</b> sai da sua lista rápida. Os pedidos não mudam.</p>
      </Dialog>
      {erro && !ativo && <div className="filtro-ia__erro">{erro}</div>}
      {ativo && (
        <div className="filtro-ia__resultado">
          {ativo.resposta.escopo
            ? <><strong>{ativo.ids.size} de {ativo.resposta.escopo.analisados} pedidos</strong> para "{ativo.texto}", procurando em {ativo.resposta.escopo.descricao}
                {ativo.resposta.escopo.cortado ? ` (li os ${ativo.resposta.escopo.analisados} mais novos de ${ativo.resposta.escopo.total})` : ''}
                {' — '}{[...ativo.ids].filter((i) => naTela.has(i)).length} nesta tabela. {ativo.resposta.entendi}</>
            : <><strong>{ativo.ids.size} de {ativo.resposta.analisados} pedidos</strong> para "{ativo.texto}". {ativo.resposta.entendi}</>}
          {ativo.resposta.colunasUsadas.length > 0 && <span className="filtro-ia__colunas"> · colunas: {ativo.resposta.colunasUsadas.join(', ')}</span>}
          {ativo.ids.size > 0 && (
            <button type="button" className="filtro-ia__link" onClick={() => setVerPorque((v) => !v)}>
              {verPorque ? 'esconder o porquê' : 'ver por que cada um entrou'}</button>
          )}
          {verPorque && (
            <ul className="filtro-ia__porque">
              {[...ativo.ids].map((i) => <li key={i}><b>#{i}</b> — {ativo.resposta.porque[String(i)] || '—'}</li>)}
            </ul>
          )}
          {fora.length > 0 && (
            <div className="filtro-ia__fora">
              <div className="filtro-ia__fora-cab">Fora desta tabela ({fora.length}{fora.length > foraMostrados.length ? `, mostrando ${foraMostrados.length}` : ''}) — estão em outra fase:</div>
              <ul>
                {foraMostrados.map((i) => {
                  const d = ativo.resposta.detalhes?.[String(i)];
                  return (
                    <li key={i}>
                      <b>#{i}</b> {d?.paciente || ''} — {d?.procedimento || ''}
                      <span className="filtro-ia__fora-fase"> · {[d?.fase, d?.status].filter(Boolean).join(' · ') || 'fase não informada'}</span>
                      {fichaDisponivel && <button type="button" className="filtro-ia__link" onClick={() => abrir(i)}>abrir</button>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="filtro-ia__nota">filtro feito pela IA — confira; os outros filtros da tabela continuam valendo</div>
        </div>
      )}
    </section>
  );
}
