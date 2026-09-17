/**
 * Configurações › Colunas das tabelas (@R 29/08 13:28: "um local em configurações para saber o que
 * é cada coluna e podermos marcar para cada usuário... pode ser por tela... uma área mais fácil e
 * intuitiva para ajudar e explicar").
 *
 * Dois níveis: PADRÃO (vale para todas as telas) e POR TELA (sobrescreve o padrão só naquela).
 * Cada linha explica o que a coluna é e de onde vem o dado. As opcionais nascem desmarcadas.
 * Grava no mesmo lugar que o botão "Colunas" das tabelas já usa (/preferencias/...), por usuário.
 */
import { useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { Dropdown } from 'primereact/dropdown';
import { Tag } from 'primereact/tag';
import api from '../../services/api';
import { DICIONARIO_COLUNAS, TELAS_COM_COLUNAS, CHAVE_PADRAO } from '../../components/ColunasVisiveis/dicionarioColunas';
import './ConfiguracoesColunasPage.css';

const GRUPOS = ['Identidade', 'Pedido', 'Tempo', 'Documentos', 'Processo', 'Dinheiro'] as const;
const chaveDe = (tela: string) => (tela === '__padrao__' ? CHAVE_PADRAO : `colunas_ocultas:${tela}`);

export function ConfiguracoesColunasPage() {
  const [tela, setTela] = useState('__padrao__');
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [padrao, setPadrao] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvo, setSalvo] = useState<string | null>(null);

  const carregar = (t: string) => {
    setCarregando(true);
    const pedidos = [api.get(`/preferencias/${encodeURIComponent(chaveDe(t))}/`).catch(() => null)];
    if (t !== '__padrao__') pedidos.push(api.get(`/preferencias/${encodeURIComponent(CHAVE_PADRAO)}/`).catch(() => null));
    Promise.all(pedidos).then(([r, rp]) => {
      const lista = (r as any)?.data?.valor?.ocultas;
      const listaP = (rp as any)?.data?.valor?.ocultas;
      setOcultas(Array.isArray(lista) ? lista : (t === '__padrao__' ? DICIONARIO_COLUNAS.filter((v) => v.padraoOculta).map((v) => v.id) : []));
      setPadrao(Array.isArray(listaP) ? listaP : (t === '__padrao__' ? [] : DICIONARIO_COLUNAS.filter((v) => v.padraoOculta).map((v) => v.id)));
    }).finally(() => setCarregando(false));
  };
  useEffect(() => { carregar(tela); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tela]);

  const salvar = (novas: string[]) => {
    setOcultas(novas);
    try { localStorage.setItem(`mc_${chaveDe(tela)}`, JSON.stringify(novas)); } catch { /* fail-soft */ }
    api.put(`/preferencias/${encodeURIComponent(chaveDe(tela))}/`, { valor: { ocultas: novas } })
      .then(() => { setSalvo('Salvo'); setTimeout(() => setSalvo(null), 1800); })
      .catch(() => setSalvo('Não consegui salvar no servidor — vale só neste navegador.'));
  };
  const alternar = (id: string, visivel: boolean) => salvar(visivel ? ocultas.filter((o) => o !== id) : [...new Set([...ocultas, id])]);
  const herdadaDoPadrao = (id: string) => tela !== '__padrao__' && padrao.includes(id) && !ocultas.includes(id);

  return (
    <div className="ccol-page">
      <h1>Colunas das tabelas</h1>
      <p className="ccol-sub">
        Escolha o que aparece nas tabelas — a escolha é <b>sua</b> (não muda a tela dos colegas) e vale em qualquer computador.
        Comece pelo <b>Padrão</b>: ele vale para todas as telas. Depois, se uma tela precisar de algo a mais, escolha a tela na lista e ligue só ali.
      </p>

      <div className="ccol-barra">
        <label>
          Configurando
          <Dropdown value={tela} onChange={(e) => setTela(e.value)} style={{ minWidth: '20rem' }}
            options={[{ label: '★ Padrão — todas as telas', value: '__padrao__' },
                      ...TELAS_COM_COLUNAS.map((t) => ({ label: t.nome, value: t.chave }))]} />
        </label>
        <span className="ccol-contagem">{DICIONARIO_COLUNAS.length - ocultas.length} de {DICIONARIO_COLUNAS.length} visíveis</span>
        <Button label="Mostrar todas" text size="small" onClick={() => salvar([])} />
        <Button label="Voltar ao recomendado" text size="small"
          onClick={() => salvar(DICIONARIO_COLUNAS.filter((v) => v.padraoOculta).map((v) => v.id))} />
        {salvo && <span className="ccol-salvo">{salvo}</span>}
      </div>

      {carregando ? <p className="ccol-sub">Carregando…</p> : GRUPOS.map((g) => {
        const itens = DICIONARIO_COLUNAS.filter((v) => v.grupo === g);
        if (!itens.length) return null;
        return (
          <section key={g} className="ccol-grupo">
            <h2>{g}</h2>
            <div className="ccol-lista">
              {itens.map((v) => {
                const visivel = !ocultas.includes(v.id);
                return (
                  <label key={v.id} className={`ccol-item${visivel ? '' : ' ccol-item--off'}`}>
                    <Checkbox checked={visivel} onChange={(e) => alternar(v.id, !!e.checked)} />
                    <div className="ccol-txt">
                      <span className="ccol-nome">
                        {v.nome}
                        {v.padraoOculta && <Tag value="opcional" severity="secondary" className="ccol-tag" />}
                        {herdadaDoPadrao(v.id) && <Tag value="ligada só aqui" severity="info" className="ccol-tag" />}
                      </span>
                      <span className="ccol-oque">{v.oQueE}</span>
                      <span className="ccol-fonte">De onde vem: {v.deOndeVem}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="ccol-rodape">
        As colunas <b>#</b>, <b>Ações</b> e <b>Paciente</b> ficam sempre visíveis e fixas à esquerda — são a identidade e a decisão da linha.
        Dentro de cada tabela, o botão <b>Colunas</b> continua funcionando como atalho para ajustar só aquela tela.
      </p>
    </div>
  );
}
