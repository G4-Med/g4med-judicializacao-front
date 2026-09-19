import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { Tag } from 'primereact/tag';
import { useAccess } from '../../access/AccessContext';
import {
  atualizarGrupoWhatsappCliente,
  criarGrupoWhatsappCliente,
  getCatalogoGruposWhatsapp,
  getGruposWhatsappCliente,
  removerGrupoWhatsappCliente,
  type GrupoWhatsappCatalogo,
  type GrupoWhatsappCliente,
} from '../../services/api/client';
import './GruposWhatsappCliente.css';

/**
 * Grupos de WhatsApp do cliente — VÁRIOS por cliente, cada um com a FUNÇÃO da conversa.
 *
 * Por que existe (@R 19/09/2026, decisão 3 do /sc:perguntas --rapha): o campo antigo
 * "Grupo WhatsApp" é 1 texto por cliente, e a realidade é 1:N — o Fajardo tem 3 grupos
 * (conversar / bater preço / solicitação nova) e o IBG tem 4, um por especialidade atendida.
 * O grupo é escolhido do CATÁLOGO (os 86 que existem no WhatsApp da G4MED, JID vindo do
 * roteador), não digitado — foi digitando que o campo antigo envelheceu.
 *
 * "Envio ativo" nasce DESLIGADO em todos e é decisão do @R, cliente a cliente: 32 dos 36
 * grupos de médicos são só-escuta por ordem dele, e o WhatsApp não desfaz um envio.
 */
const FUNCOES = [
  { label: 'Conversa / dia a dia', value: 'CONVERSA' },
  { label: 'Bater preço', value: 'PRECO' },
  { label: 'Solicitação nova', value: 'SOLICITACAO' },
  { label: 'Outro', value: 'OUTRO' },
];
const rotuloFuncao = (f: string) => FUNCOES.find((x) => x.value === f)?.label ?? f;

type Props = { idMedico: number | null | undefined };

export function GruposWhatsappCliente({ idMedico }: Props) {
  const { isReadOnly: isReadOnlyDe } = useAccess();
  const isReadOnly = isReadOnlyDe('clientes');
  const [grupos, setGrupos] = useState<GrupoWhatsappCliente[]>([]);
  const [catalogo, setCatalogo] = useState<GrupoWhatsappCatalogo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [novoJid, setNovoJid] = useState<string | null>(null);
  const [novaFuncao, setNovaFuncao] = useState<string>('CONVERSA');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!idMedico) return;
    setCarregando(true);
    setErro(null);
    try {
      const [g, c] = await Promise.all([getGruposWhatsappCliente(idMedico), getCatalogoGruposWhatsapp()]);
      setGrupos(g.data ?? []);
      setCatalogo(c.data?.grupos ?? []);
    } catch (e: any) {
      // o servidor respondeu com erro — dizer que não olhamos, não que "não há grupo"
      setErro(`Não consegui ler os grupos (${e?.response?.status ?? 'sem resposta'}).`);
    } finally {
      setCarregando(false);
    }
  }, [idMedico]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const opcoesCatalogo = useMemo(() => {
    const jaVinculados = new Set(grupos.map((g) => `${g.grupoJid}|${g.funcao}`));
    return catalogo
      .filter((c) => !jaVinculados.has(`${c.grupoJid}|${novaFuncao}`))
      .map((c) => ({ label: c.grupoNome, value: c.grupoJid }));
  }, [catalogo, grupos, novaFuncao]);

  const adicionar = async () => {
    if (!idMedico || !novoJid) return;
    const item = catalogo.find((c) => c.grupoJid === novoJid);
    if (!item) return;
    setSalvando(true);
    try {
      await criarGrupoWhatsappCliente({
        idMedico,
        grupoJid: item.grupoJid,
        grupoNome: item.grupoNome,
        funcao: novaFuncao as GrupoWhatsappCliente['funcao'],
        envioAtivo: false,
        confirmadoPor: 'ficha do cliente (usuário da plataforma)',
      });
      setNovoJid(null);
      await carregar();
    } catch (e: any) {
      setErro(`Não consegui vincular (${e?.response?.status ?? 'sem resposta'}).`);
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (g: GrupoWhatsappCliente) => {
    if (!window.confirm(`Desvincular "${g.grupoNome}" (${rotuloFuncao(g.funcao)}) deste cliente?`)) return;
    try {
      await removerGrupoWhatsappCliente(g.id);
      await carregar();
    } catch (e: any) {
      setErro(`Não consegui desvincular (${e?.response?.status ?? 'sem resposta'}).`);
    }
  };

  const alternarEnvio = async (g: GrupoWhatsappCliente) => {
    const ligar = !g.envioAtivo;
    if (
      ligar &&
      !window.confirm(
        `Ligar o envio automático para "${g.grupoNome}"?\n\nA partir daí a plataforma pode mandar mensagem nesse grupo — o WhatsApp não desfaz envio. Só ligue se o cliente já sabe que o canal ficou ativo.`,
      )
    )
      return;
    try {
      await atualizarGrupoWhatsappCliente(g.id, { envioAtivo: ligar });
      await carregar();
    } catch (e: any) {
      setErro(`Não consegui ${ligar ? 'ligar' : 'desligar'} o envio (${e?.response?.status ?? 'sem resposta'}).`);
    }
  };

  if (!idMedico) return null;

  return (
    <div className="gw-bloco">
      <div className="gw-cabecalho">
        <strong>Grupos de WhatsApp deste cliente</strong>
        <small className="ajuda-campo">
          Um cliente pode ter vários grupos, cada um com uma função. O envio nasce desligado em todos.
        </small>
      </div>

      {erro && <div className="gw-erro" role="alert">{erro}</div>}

      {carregando ? (
        <small>Lendo grupos…</small>
      ) : grupos.length === 0 ? (
        <small className="gw-vazio">Nenhum grupo vinculado ainda.</small>
      ) : (
        <ul className="gw-lista">
          {grupos.map((g) => (
            <li key={g.id} className="gw-item">
              <div className="gw-item__nome">
                <span>{g.grupoNome}</span>
                {g.funcao === 'SOLICITACAO' ? (
                  <Tag value={rotuloFuncao(g.funcao)} severity="info" />
                ) : g.funcao === 'PRECO' ? (
                  <Tag value={rotuloFuncao(g.funcao)} severity="warning" />
                ) : (
                  <Tag value={rotuloFuncao(g.funcao)} />
                )}
                {g.especialidadeAtendida && <Tag value={g.especialidadeAtendida} />}
              </div>
              <div className="gw-item__acoes">
                <label className="gw-envio" title={g.envioAtivo ? 'A plataforma pode mandar mensagem neste grupo' : 'Só leitura: a plataforma não manda nada aqui'}>
                  <Checkbox checked={g.envioAtivo} onChange={() => void alternarEnvio(g)} disabled={isReadOnly} />
                  <span>{g.envioAtivo ? 'envio LIGADO' : 'envio desligado'}</span>
                </label>
                {!isReadOnly && (
                  <Button icon="pi pi-times" text severity="secondary" aria-label={`Desvincular ${g.grupoNome}`} onClick={() => void remover(g)} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!isReadOnly && (
        <div className="gw-adicionar">
          <Dropdown
            value={novoJid}
            options={opcoesCatalogo}
            onChange={(e) => setNovoJid(e.value)}
            filter
            placeholder={catalogo.length ? 'Escolher grupo do catálogo' : 'Catálogo indisponível'}
            emptyFilterMessage="Nenhum grupo com esse nome"
            disabled={!catalogo.length}
            className="gw-adicionar__grupo"
            aria-label="Grupo do catálogo"
          />
          <Dropdown value={novaFuncao} options={FUNCOES} onChange={(e) => setNovaFuncao(e.value)} aria-label="Função do grupo" />
          <Button label="Vincular" icon="pi pi-link" onClick={() => void adicionar()} disabled={!novoJid || salvando} loading={salvando} />
        </div>
      )}
    </div>
  );
}

export default GruposWhatsappCliente;
