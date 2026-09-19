import { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Tag } from 'primereact/tag';
import api from '../../services/api';

/**
 * O lápis da coluna Status: ver o leque da FASE, trocar, ou criar um status novo ali.
 *
 * Pedido do @R (19/09): "na coluna status ter um lápis para abrir um modal para mudar o
 * status da fase, ver os status de cada fase e poder trocar ou criar um status naquela
 * fase, nas fases de 1 até 5, para criarmos status caso necessário rápido".
 *
 * ⚠ POR QUE O CAMPO VEM DO SERVIDOR, E NÃO ESTÁ ESCRITO AQUI: cada fase edita um campo
 * diferente. A tela de orçamento mostra `statusOrcamento` ("Solicitado ao Medico"), mas a
 * FASE é definida por `statusProcesso`. Se este modal chutasse o campo, alguém que só
 * queria marcar "já pedi ao médico" mudaria a FASE do pedido — e o chip continuaria
 * plausível, porque os dois são "status". O backend declara `campoOperacional` por fase
 * (listar_status) e aqui a gente obedece.
 */

interface FaseStatus {
  chave: string;
  rotulo: string;
  canonicos: string[];
  campoOperacional: string;
  operacionais: string[];
  personalizados: { id: number; nome: string }[];
}

interface Props {
  visivel: boolean;
  aoFechar: () => void;
  pedidoId: number;
  statusAtual: string;
  /** chave da fase em que o pedido está; se não vier, o modal descobre pelo status atual */
  faseChave?: string;
  aoSalvar: (campo: string, valor: string) => Promise<void> | void;
}

export function ModalStatusFase({ visivel, aoFechar, pedidoId, statusAtual, faseChave, aoSalvar }: Props) {
  const [fases, setFases] = useState<FaseStatus[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!visivel) return;
    setCarregando(true);
    setErro(null);
    api.get('/orders/status/')
      .then((r) => setFases(r.data?.fases ?? []))
      .catch(() => setErro('Não consegui carregar os status. Tente de novo.'))
      .finally(() => setCarregando(false));
  }, [visivel]);

  // A fase: a informada, ou aquela cujos valores operacionais contêm o status atual.
  // Fail-closed: se não der para identificar, o modal NÃO adivinha — avisa e não oferece
  // troca, porque oferecer o leque errado é pior que não oferecer nada.
  const fase = faseChave
    ? fases.find((f) => f.chave === faseChave)
    : fases.find((f) => f.operacionais.includes(statusAtual) || f.canonicos.includes(statusAtual));

  const trocar = async (valor: string) => {
    if (!fase) return;
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar(fase.campoOperacional, valor);
      aoFechar();
    } catch {
      setErro('Não consegui salvar. O status continua o mesmo.');
    } finally {
      setSalvando(false);
    }
  };

  const criar = async () => {
    const nome = novoNome.trim();
    if (!nome || !fase) return;
    // Duplicata é o risco real: "Aguardando Médico" × "Aguardando o Médico" poluem o
    // funil de todo mundo. Por isso a lista aparece ANTES do campo de criar, e aqui
    // ainda barramos o nome que já existe (comparação sem caixa/acento).
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
    const jaExiste = [...fase.operacionais, ...fase.personalizados.map((p) => p.nome)]
      .some((s) => norm(s) === norm(nome));
    if (jaExiste) {
      setErro(`"${nome}" já existe nesta fase — use o que está na lista.`);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await api.post('/client/status-orcamento-personalizado/', { nome, fase: fase.chave, ativo: true });
      const r = await api.get('/orders/status/');
      setFases(r.data?.fases ?? []);
      setNovoNome('');
    } catch {
      setErro('Não consegui criar o status.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog header={`Status do pedido #${pedidoId}`} visible={visivel} onHide={aoFechar}
            style={{ width: '32rem' }} draggable={false}>
      {carregando && <p>Carregando…</p>}
      {!carregando && !fase && (
        <p style={{ color: '#b45309' }}>
          Não identifiquei a fase deste pedido pelo status <b>{statusAtual}</b>.
          Para não mudar o campo errado, o modal não oferece troca aqui.
        </p>
      )}
      {!carregando && fase && (
        <>
          <p style={{ marginTop: 0 }}>
            <small style={{ opacity: .75 }}>{fase.rotulo} · editando <code>{fase.campoOperacional}</code></small>
          </p>
          <p>Hoje: <Tag value={statusAtual || '—'} /></p>

          <h4 style={{ marginBottom: '.4rem' }}>Status desta fase</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
            {fase.operacionais.map((s) => (
              <Button key={s} label={s} size="small" disabled={salvando}
                      severity={s === statusAtual ? 'success' : 'secondary'}
                      outlined={s !== statusAtual} onClick={() => trocar(s)} />
            ))}
            {fase.personalizados.map((p) => (
              <Button key={`p${p.id}`} label={p.nome} size="small" disabled={salvando}
                      severity={p.nome === statusAtual ? 'success' : 'help'}
                      outlined={p.nome !== statusAtual} onClick={() => trocar(p.nome)} />
            ))}
          </div>

          <h4 style={{ marginBottom: '.4rem' }}>Criar um status nesta fase</h4>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <InputText value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
                       placeholder="Nome do novo status" style={{ flex: 1 }} disabled={salvando} />
            <Button label="Criar" icon="pi pi-plus" onClick={criar} disabled={salvando || !novoNome.trim()} />
          </div>
          <small style={{ opacity: .7 }}>
            Ele passa a valer só em {fase.rotulo}, para todos os pedidos.
          </small>
        </>
      )}
      {erro && <p style={{ color: '#b91c1c', marginBottom: 0 }}>{erro}</p>}
    </Dialog>
  );
}
