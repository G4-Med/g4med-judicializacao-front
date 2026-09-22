import { useEffect, useState } from 'react';
import { useFichaPedido } from '../FichaPedido/FichaPedidoContext';
import { getAtividades, type AtividadesResposta, type TipoAtividade } from '../../services/api/atividades';
import './AtividadesLista.css';

/** Livro de portaria (@R 22/09): o que cada pessoa alterou, abriu, baixou e por onde navegou — com filtro por
 *  tipo. Mesma peça na Início (painel da pessoa) e em /logs. Fonte: GET /api/admin/atividades/. */
const TIPOS: { id: TipoAtividade | 'TODOS'; rotulo: string }[] = [
  { id: 'TODOS', rotulo: 'Tudo' },
  { id: 'ALTERACAO', rotulo: 'Alterações' },
  { id: 'REGISTRO', rotulo: 'Registros e fichas abertos' },
  { id: 'ARQUIVO', rotulo: 'Arquivos abertos' },
  { id: 'DOWNLOAD', rotulo: 'Downloads' },
  { id: 'PAGINA', rotulo: 'Páginas' },
  { id: 'LOGIN', rotulo: 'Logins' },
];
const COR: Record<TipoAtividade, string> = {
  ALTERACAO: '#0A3D62', REGISTRO: '#7c3aed', ARQUIVO: '#0e7490', DOWNLOAD: '#b45309', PAGINA: '#64748b', LOGIN: '#00A651',
};

const diaHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function AtividadesLista({ usuario, dataInicio, dataFim, pedido }: {
  usuario?: string; dataInicio?: string; dataFim?: string; pedido?: string;
}) {
  const [tipo, setTipo] = useState<TipoAtividade | 'TODOS'>('TODOS');
  const [dados, setDados] = useState<AtividadesResposta | null>(null);
  const [contagem, setContagem] = useState<AtividadesResposta['porTipo']>({});
  const [erro, setErro] = useState(false);
  const ficha = useFichaPedido();

  const base: Record<string, string> = {};
  if (usuario) base.usuario = usuario;
  if (dataInicio) base.dataInicio = dataInicio;
  if (dataFim) base.dataFim = dataFim;
  if (pedido) base.pedido = pedido;
  const chave = JSON.stringify(base);

  // contagem por tipo SEM o filtro de tipo (as abas mostram quanto há em cada uma)
  useEffect(() => {
    const t = setTimeout(() => {
      getAtividades(base).then((r) => setContagem(r.data.porTipo || {})).catch(() => setContagem({}));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  useEffect(() => {
    setErro(false);
    setDados(null);
    const t = setTimeout(() => {
      getAtividades(tipo === 'TODOS' ? base : { ...base, tipo }).then((r) => setDados(r.data)).catch(() => setErro(true));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, tipo]);

  const total = Object.values(contagem).reduce((a, b) => a + (b || 0), 0);
  return (
    <div className="ativ">
      <div className="ativ__tipos" role="tablist">
        {TIPOS.map((t) => {
          const n = t.id === 'TODOS' ? total : (contagem[t.id] ?? 0);
          return (
            <button key={t.id} type="button" role="tab" aria-selected={tipo === t.id}
              className={`ativ__tipo${tipo === t.id ? ' ativ__tipo--on' : ''}`} onClick={() => setTipo(t.id)}>
              {t.rotulo} <span>{n}</span>
            </button>
          );
        })}
      </div>
      {erro && <p className="ativ__vazio">Não foi possível ler as atividades agora — isso não quer dizer que não houve.</p>}
      {!erro && !dados && <p className="ativ__vazio">Carregando…</p>}
      {dados && dados.itens.length === 0 && <p className="ativ__vazio">Nada registrado{tipo !== 'TODOS' ? ' deste tipo' : ''} no período.</p>}
      {dados && dados.itens.length > 0 && (
        <ul className="ativ__lista">
          {dados.itens.map((a) => (
            <li key={a.id} className={a.status >= 400 ? 'ativ__item ativ__item--falha' : 'ativ__item'}>
              <b className="ativ__hora">{diaHora(a.em)}</b>
              <span className="ativ__selo" style={{ background: COR[a.tipo] }}>{TIPOS.find((t) => t.id === a.tipo)?.rotulo.split(' ')[0] ?? a.tipo}</span>
              <span className="ativ__acao">
                {!usuario && a.usuario && <em>{a.usuario} · </em>}
                {a.acao}
                {a.pedido ? <> · <button type="button" className="ativ__pedido" onClick={() => ficha.abrir(a.pedido as number)} title="Abrir a ficha do pedido">#{a.pedido}</button></> : null}
                {a.status >= 400 ? <strong> · recusado ({a.status})</strong> : null}
              </span>
              <span className="ativ__rota" title={`${a.metodo} ${a.rota}${a.ip ? ` · IP ${a.ip}` : ''}${a.duracaoMs != null ? ` · ${a.duracaoMs} ms` : ''}`}>
                {a.tipo === 'PAGINA' ? a.rota : a.ip ? `IP ${a.ip}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {dados && (
        <p className="ativ__nota">
          {dados.total > dados.itens.length ? `Mostrando as ${dados.itens.length} mais recentes de ${dados.total}. ` : ''}
          {dados.nota}
        </p>
      )}
    </div>
  );
}
