import { useEffect, useMemo, useState } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { getMedicosCompleto, getRelatorioResumido, enviarRelatorioResumido } from '../../services/api/orders';
import './RelatoriosPage.css';
import './RelatorioResumidoPage.css';

/**
 * RELATÓRIO RESUMIDO — o que sai da empresa para o médico.
 *
 * POR QUE é diferente do Consolidado: aquele é a visão INTERNA completa
 * (todos os status, valores). Este é o que o MÉDICO recebe sobre os
 * pedidos dele — pendências com o SLA correndo (mesma régua 24h/96h do
 * Dashboard/SLA) e o que já foi resolvido, sem valor de comissão interna.
 */

interface MedicoOption {
  label: string;
  value: number;
}

interface MedicoRow {
  id: number;
  nomeSistema?: string;
  razaoSocial?: string;
  nomeCompleto?: string;
}

interface FaseAberta {
  nome: string;
  dias_aberta: number;
  estourado: boolean;
  atraso_dias: number;
}

interface Pendente {
  id: number;
  paciente: string;
  procedimento: string | null;
  status: string;
  fase_aberta: FaseAberta | null;
}

interface Resolvido {
  id: number;
  paciente: string;
  procedimento: string | null;
  desfecho: string;
  data: string | null;
}

interface Resumo {
  medico: { id: number; nome: string; email: string | null };
  pendentes: Pendente[];
  resolvidos: Resolvido[];
  gerado_em: string;
}

function formatarData(iso: string | null) {
  if (!iso) return '--';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function RelatorioResumidoPage() {
  const [medicos, setMedicos] = useState<MedicoRow[]>([]);
  const [medicoSelecionado, setMedicoSelecionado] = useState<number | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    getMedicosCompleto()
      .then((r) => setMedicos(r.data ?? []))
      .catch(() => setMedicos([]));
  }, []);

  const medicosOptions = useMemo<MedicoOption[]>(
    () =>
      medicos.map((m) => ({
        label: m.razaoSocial || m.nomeCompleto || m.nomeSistema || `Médico ${m.id}`,
        value: m.id,
      })),
    [medicos]
  );

  useEffect(() => {
    if (medicoSelecionado === null) {
      setResumo(null);
      return;
    }
    setCarregando(true);
    setMensagem(null);
    getRelatorioResumido(medicoSelecionado)
      .then((r) => setResumo(r.data))
      .catch(() => setMensagem({ tipo: 'erro', texto: 'Não foi possível carregar o resumo deste médico.' }))
      .finally(() => setCarregando(false));
  }, [medicoSelecionado]);

  const enviar = async () => {
    if (medicoSelecionado === null) return;
    setEnviando(true);
    setMensagem(null);
    try {
      const r = await enviarRelatorioResumido(medicoSelecionado);
      setMensagem({ tipo: 'ok', texto: `Enviado para ${r.data.destinatario}.` });
    } catch (e: any) {
      setMensagem({ tipo: 'erro', texto: e?.response?.data?.error ?? 'Não foi possível enviar o e-mail.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="relatorios-page">
      <div className="page-header">
        <div>
          <h1>Relatório Resumido</h1>
          <p>O que o médico recebe sobre os pedidos dele — pendências com o SLA correndo e o que já foi resolvido.</p>
        </div>
      </div>

      <div className="card relatorio-resumido-card">
        <div className="relatorio-resumido-toolbar">
          <Dropdown
            value={medicoSelecionado}
            options={medicosOptions}
            onChange={(e) => setMedicoSelecionado(e.value)}
            placeholder="Selecionar médico"
            filter
            showClear
            style={{ minWidth: 280 }}
          />
          <Button
            label={enviando ? 'enviando…' : 'Enviar por e-mail'}
            icon="pi pi-envelope"
            onClick={() => void enviar()}
            disabled={!resumo || enviando}
          />
        </div>

        {mensagem && (
          <div className={`relatorio-resumido-mensagem relatorio-resumido-mensagem--${mensagem.tipo}`}>
            {mensagem.texto}
          </div>
        )}

        {medicoSelecionado === null && (
          <p className="relatorio-resumido-vazio">Selecione um médico para ver o resumo.</p>
        )}

        {carregando && <p className="relatorio-resumido-vazio">carregando…</p>}

        {resumo && !carregando && (
          <>
            {!resumo.medico.email && (
              <p className="relatorio-resumido-aviso">
                ⚠ este médico não tem e-mail cadastrado — o envio só funciona depois de preencher em Clientes.
              </p>
            )}

            <section className="relatorio-resumido-secao">
              <h3>⏱ Pendente agora</h3>
              {resumo.pendentes.length === 0 && <p className="relatorio-resumido-vazio">nenhuma pendência.</p>}
              <ul className="relatorio-resumido-lista">
                {resumo.pendentes.map((p) => (
                  <li key={p.id}>
                    <strong>{p.paciente}</strong>
                    <span className="relatorio-resumido-proc">{p.procedimento}</span>
                    {p.fase_aberta && (
                      <span
                        className={`relatorio-resumido-sla ${
                          p.fase_aberta.estourado ? 'relatorio-resumido-sla--estourado' : ''
                        }`}
                      >
                        {p.fase_aberta.estourado
                          ? `🔴 ${p.fase_aberta.nome} · estourado há ${p.fase_aberta.atraso_dias}d`
                          : `🟡 ${p.fase_aberta.nome} · ${p.fase_aberta.dias_aberta}d`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="relatorio-resumido-secao">
              <h3>✅ Resolvido recentemente</h3>
              {resumo.resolvidos.length === 0 && <p className="relatorio-resumido-vazio">nenhum caso resolvido.</p>}
              <ul className="relatorio-resumido-lista">
                {resumo.resolvidos.map((r) => (
                  <li key={r.id}>
                    <strong>{r.paciente}</strong>
                    <span className={`relatorio-resumido-tag relatorio-resumido-tag--${r.desfecho.toLowerCase()}`}>
                      {r.desfecho}
                    </span>
                    <span className="relatorio-resumido-proc">{formatarData(r.data)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default RelatorioResumidoPage;
