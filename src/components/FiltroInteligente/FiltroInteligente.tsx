/**
 * FILTRO POR TEXTO INTELIGENTE (@R 23/09 12:41/12:42): "eu digito um texto — pode ser o nome do médico,
 * a cirurgia, a área — e ela usa o cruzamento de dados para fazer um filtro... e explica como ela
 * entende usando a própria tabela... que podemos limpar".
 *
 * A IA recebe só os pedidos que a tabela tem agora (ids) e devolve os que casam + como entendeu +
 * quais colunas usou + o porquê de cada um. Falha da IA NUNCA vira tabela vazia: a tabela fica
 * inteira e o aviso diz que o filtro não rodou.
 */
import { useState } from 'react';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { filtrarTextoIA, type FiltroTextoResposta } from '../../services/api/orders';
import './FiltroInteligente.css';

export interface FiltroAtivo { texto: string; ids: Set<number>; resposta: FiltroTextoResposta }

interface Props {
  idsNaTela: number[];
  ativo: FiltroAtivo | null;
  onMudar: (f: FiltroAtivo | null) => void;
  exemplo?: string;
}

export function FiltroInteligente({ idsNaTela, ativo, onMudar, exemplo }: Props) {
  const [texto, setTexto] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [verPorque, setVerPorque] = useState(false);

  const filtrar = async () => {
    const t = texto.trim();
    if (t.length < 3) { setErro('Digite pelo menos 3 letras.'); return; }
    setCarregando(true); setErro('');
    try {
      const { data } = await filtrarTextoIA(t, idsNaTela);
      onMudar({ texto: t, ids: new Set(data.ids), resposta: data }); setVerPorque(false);
    } catch (e) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(`${d || 'A IA não respondeu'} — a tabela continua com todos os pedidos.`);
    } finally { setCarregando(false); }
  };
  const limpar = () => { onMudar(null); setTexto(''); setErro(''); setVerPorque(false); };

  return (
    <div className="filtro-ia">
      <div className="filtro-ia__linha">
        <i className="pi pi-sparkles filtro-ia__icone" aria-hidden />
        <InputText value={texto} onChange={(e) => setTexto(e.target.value)} className="filtro-ia__campo"
          placeholder={exemplo || 'Filtro inteligente: médico, cirurgia, área… (ex.: vascular, Dr. Paulo, prótese de quadril)'}
          onKeyDown={(e) => { if (e.key === 'Enter') void filtrar(); }} disabled={carregando} aria-label="Filtro inteligente por texto" />
        <Button label={carregando ? 'Filtrando…' : 'Filtrar com IA'} icon="pi pi-filter" size="small"
          loading={carregando} onClick={() => void filtrar()} />
        {ativo && <Button label="Limpar" icon="pi pi-times" size="small" text severity="secondary" onClick={limpar} />}
      </div>
      {erro && <div className="filtro-ia__erro">{erro}</div>}
      {ativo && (
        <div className="filtro-ia__resultado">
          <strong>{ativo.ids.size} de {ativo.resposta.analisados} pedidos</strong> para "{ativo.texto}". {ativo.resposta.entendi}
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
          <div className="filtro-ia__nota">filtro feito pela IA — confira; os outros filtros da tabela continuam valendo</div>
        </div>
      )}
    </div>
  );
}
