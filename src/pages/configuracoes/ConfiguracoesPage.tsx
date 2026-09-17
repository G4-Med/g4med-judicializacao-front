import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import {
  getBancos,
  getEspecialidades,
  getHospitais,
  getSubespecialidades,
  salvarBanco,
  salvarEspecialidade,
  salvarHospital,
  salvarSubespecialidade,
} from '../../services/api/orders';
import './ConfiguracoesPage.css';

interface ItemConfiguracao {
  id: number;
  nome: string;
  codigo?: string;
}

type TipoConfiguracao = 'especialidade' | 'subespecialidade' | 'hospital' | 'banco';

const CONFIGS: Record<
  TipoConfiguracao,
  {
    titulo: string;
    singular: string;
    carregar: () => Promise<any>;
    salvar: (nome: string, codigo?: string) => Promise<any>;
  }
> = {
  especialidade: {
    titulo: 'Especialidades',
    singular: 'Especialidade',
    carregar: getEspecialidades,
    salvar: (nome) => salvarEspecialidade({ especialidade: nome }),
  },
  subespecialidade: {
    titulo: 'Subespecialidades',
    singular: 'Subespecialidade',
    carregar: getSubespecialidades,
    salvar: (nome) => salvarSubespecialidade({ subespecialidade: nome }),
  },
  hospital: {
    titulo: 'Hospitais',
    singular: 'Hospital',
    carregar: getHospitais,
    salvar: (nome) => salvarHospital({ hospital: nome }),
  },
  banco: {
    titulo: 'Bancos',
    singular: 'Banco',
    carregar: getBancos,
    salvar: (nome, codigo) => salvarBanco({ codBanco: codigo || '', nomeBanco: nome }),
  },
};

function normalizarLista(data: any): ItemConfiguracao[] {
  const lista = Array.isArray(data) ? data : [];

  return lista.map((item: any, index: number) => ({
    id: Number(item?.id ?? index + 1),
    codigo: item?.codBanco ?? item?.codigo ?? '',
    nome:
      item?.nome ??
      item?.descricao ??
      item?.nomeBanco ??
      item?.especialidade ??
      item?.subespecialidade ??
      item?.hospital ??
      item?.title ??
      '',
  }));
}

export function ConfiguracoesPage() {
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState<TipoConfiguracao | null>(null);
  const [dialogTipo, setDialogTipo] = useState<TipoConfiguracao | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [novoCodigo, setNovoCodigo] = useState('');
  const [mostrarTudo, setMostrarTudo] = useState<Record<TipoConfiguracao, boolean>>({
    especialidade: false,
    subespecialidade: false,
    hospital: false,
    banco: false,
  });

  const [especialidades, setEspecialidades] = useState<ItemConfiguracao[]>([]);
  const [subespecialidades, setSubespecialidades] = useState<ItemConfiguracao[]>([]);
  const [hospitais, setHospitais] = useState<ItemConfiguracao[]>([]);
  const [bancos, setBancos] = useState<ItemConfiguracao[]>([]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [especialidadesRes, subespecialidadesRes, hospitaisRes, bancosRes] = await Promise.all([
        getEspecialidades(),
        getSubespecialidades(),
        getHospitais(),
        getBancos(),
      ]);

      setEspecialidades(normalizarLista(especialidadesRes.data));
      setSubespecialidades(normalizarLista(subespecialidadesRes.data));
      setHospitais(normalizarLista(hospitaisRes.data));
      setBancos(normalizarLista(bancosRes.data));
    } catch (error) {
      console.error('Erro ao carregar configurações do sistema', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregarDados();
  }, []);

  const abrirDialog = (tipo: TipoConfiguracao) => {
    setDialogTipo(tipo);
    setNovoNome('');
    setNovoCodigo('');
  };

  const fecharDialog = () => {
    setDialogTipo(null);
    setNovoNome('');
    setNovoCodigo('');
  };

  const salvar = async () => {
    if (!dialogTipo) return;

    const nome = novoNome.trim();
    if (!nome) {
      alert('Preencha o nome para cadastrar.');
      return;
    }

    if (dialogTipo === 'banco' && !novoCodigo.trim()) {
      alert('Preencha o código do banco.');
      return;
    }

    try {
      setSalvando(dialogTipo);
      await CONFIGS[dialogTipo].salvar(nome, novoCodigo.trim());
      await carregarDados();
      fecharDialog();
    } catch (error: any) {
      const detalhe =
        error?.response?.data?.error ??
        error?.response?.data?.detail ??
        JSON.stringify(error?.response?.data ?? {});
      alert(detalhe && detalhe !== '{}' ? detalhe : 'Erro ao salvar cadastro.');
    } finally {
      setSalvando(null);
    }
  };

  const headerTabela = (tipo: TipoConfiguracao) => (
    <div className="table-header">
      <h3>{CONFIGS[tipo].titulo}</h3>
      <div className="table-header-actions">
        <Button
          label={mostrarTudo[tipo] ? 'Ver menos' : 'Ver mais'}
          icon={mostrarTudo[tipo] ? 'pi pi-angle-up' : 'pi pi-angle-down'}
          outlined
          onClick={() =>
            setMostrarTudo((atual) => ({
              ...atual,
              [tipo]: !atual[tipo],
            }))
          }
        />
        <Button
          label={`Cadastrar ${CONFIGS[tipo].singular}`}
          icon="pi pi-plus"
          onClick={() => abrirDialog(tipo)}
        />
      </div>
    </div>
  );

  const dialogTitulo = useMemo(
    () => (dialogTipo ? `Cadastrar ${CONFIGS[dialogTipo].singular}` : 'Cadastrar'),
    [dialogTipo]
  );

  const dialogLabel = useMemo(
    () => (dialogTipo ? `Nome da ${CONFIGS[dialogTipo].singular}` : 'Nome'),
    [dialogTipo]
  );

  const especialidadesExibidas = useMemo(
    () =>
      [...especialidades]
        .sort((a, b) => a.id - b.id)
        .slice(0, mostrarTudo.especialidade ? especialidades.length : 5),
    [especialidades, mostrarTudo.especialidade]
  );

  const subespecialidadesExibidas = useMemo(
    () =>
      [...subespecialidades]
        .sort((a, b) => a.id - b.id)
        .slice(0, mostrarTudo.subespecialidade ? subespecialidades.length : 5),
    [subespecialidades, mostrarTudo.subespecialidade]
  );

  const hospitaisExibidos = useMemo(
    () =>
      [...hospitais]
        .sort((a, b) => a.id - b.id)
        .slice(0, mostrarTudo.hospital ? hospitais.length : 5),
    [hospitais, mostrarTudo.hospital]
  );

  const bancosExibidos = useMemo(
    () =>
      [...bancos]
        .sort((a, b) => a.id - b.id)
        .slice(0, mostrarTudo.banco ? bancos.length : 5),
    [bancos, mostrarTudo.banco]
  );

  return (
    <div className="configuracoes-page">
      <div className="page-header">
        <div>
          <h1>Configurações</h1>
          <p>Cadastre as listas usadas nos dropdowns do sistema.</p>
        </div>
      </div>

      <div className="card">
        <DataTable
          aria-label="Especialidades cadastradas"
          value={especialidadesExibidas}
          header={headerTabela('especialidade')}
          loading={loading}
          tableStyle={{ minWidth: '40rem' }}
          emptyMessage="Nenhuma especialidade cadastrada."
        >
          <Column field="id" header="ID" style={{ width: '120px' }} />
          <Column field="nome" header="Especialidade" />
        </DataTable>
      </div>

      <div className="card">
        <DataTable
          aria-label="Subespecialidades cadastradas"
          value={subespecialidadesExibidas}
          header={headerTabela('subespecialidade')}
          loading={loading}
          tableStyle={{ minWidth: '40rem' }}
          emptyMessage="Nenhuma subespecialidade cadastrada."
        >
          <Column field="id" header="ID" style={{ width: '120px' }} />
          <Column field="nome" header="Subespecialidade" />
        </DataTable>
      </div>

      <div className="card">
        <DataTable
          aria-label="Hospitais cadastrados"
          value={hospitaisExibidos}
          header={headerTabela('hospital')}
          loading={loading}
          tableStyle={{ minWidth: '40rem' }}
          emptyMessage="Nenhum hospital cadastrado."
        >
          <Column field="id" header="ID" style={{ width: '120px' }} />
          <Column field="nome" header="Hospital" />
        </DataTable>
      </div>

      <div className="card">
        <DataTable
          aria-label="Bancos cadastrados"
          value={bancosExibidos}
          header={headerTabela('banco')}
          loading={loading}
          tableStyle={{ minWidth: '40rem' }}
          emptyMessage="Nenhum banco cadastrado."
        >
          <Column field="id" header="ID" style={{ width: '120px' }} />
          <Column field="codigo" header="Código" style={{ width: '160px' }} />
          <Column field="nome" header="Banco" />
        </DataTable>
      </div>

      <Dialog
        header={dialogTitulo}
        visible={dialogTipo !== null}
        style={{ width: '420px' }}
        modal
        onHide={fecharDialog}
      >
        <div className="form-field">
          <label>{dialogLabel}</label>
          <InputText value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
        </div>

        {dialogTipo === 'banco' && (
          <div className="form-field">
            <label>Código do Banco</label>
            <InputText value={novoCodigo} onChange={(e) => setNovoCodigo(e.target.value)} />
          </div>
        )}

        <div className="dialog-footer">
          <Button label="Cancelar" outlined onClick={fecharDialog} />
          <Button
            label={salvando ? 'Salvando...' : 'Salvar'}
            onClick={() => void salvar()}
            loading={salvando !== null}
            disabled={salvando !== null}
          />
        </div>
      </Dialog>
    </div>
  );
}
