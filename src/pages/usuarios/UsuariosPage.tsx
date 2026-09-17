import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import type {
  DataTableFilterMeta,
  DataTablePageEvent,
  DataTableSortEvent
} from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Password } from 'primereact/password';
import { FilterMatchMode } from 'primereact/api';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputSwitch } from 'primereact/inputswitch';
import {
  criarUsuario,
  editarUsuario,
  getGruposUsuarios,
  getMedicosUsuario,
  getUsuarios,
  type UsuarioPayload
} from '../../services/api/usuarios';
import { getMedicosCompleto } from '../../services/api/orders';
import './UsuariosPage.css';
import { PainelKpis } from '../../components/PainelKpis/PainelKpis';
import { cabecalhoComHint } from '../../components/ColunasIdentificacao/colunasIdentificacao';

interface ApiUsuario {
  id: number;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  date_joined?: string;
  last_login?: string | null;
  lastLogin?: string | null;
  group?: { id: number; name: string } | string | null;
  groups?: Array<{ id?: number; name?: string } | string> | null;
  group_id?: number | null;
  group_name?: string | null;
  medico?: { id: number; nome?: string } | null;
  medico_id?: number | null;
  medico_nome?: string | null;
}

interface ApiGrupo {
  id: number;
  name: string;
}

interface ApiMedico {
  id: number;
  nomeSistema?: string;
  razaoSocial?: string;
  nome?: string;
  ativo?: boolean;
  status?: boolean | string;
}

interface UsuarioRow {
  id: number;
  sequencial: number;
  username: string;
  nomeCompleto: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isStaff: boolean;
  isSuperuser: boolean;
  groupId: number | null;
  groupName: string;
  medicoId: number | null;
  medicoNome: string;
  dateJoined: string | null;
  lastLogin: string | null;
}

interface FormUsuario {
  id: number | null;
  username: string;
  password: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isStaff: boolean;
  isSuperuser: boolean;
  groupId: number | null;
  medicoId: number | null;
}

const formVazio: FormUsuario = {
  id: null,
  username: '',
  password: '',
  email: '',
  firstName: '',
  lastName: '',
  isActive: true,
  isStaff: false,
  isSuperuser: false,
  groupId: null,
  medicoId: null
};

function nomeMedico(m: ApiMedico) {
  return m.nomeSistema || m.razaoSocial || m.nome || `Médico ${m.id}`;
}

function formatarDataHora(value?: string | null) {
  if (!value) return '--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString('pt-BR');
}

export function UsuariosPage() {
  const [loading, setLoading] = useState(false);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [grupos, setGrupos] = useState<ApiGrupo[]>([]);
  const [medicos, setMedicos] = useState<ApiMedico[]>([]);

  const [selectedUsuarios, setSelectedUsuarios] = useState<UsuarioRow[]>([]);
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(50);
  const [sortField, setSortField] = useState<string | undefined>('lastLogin');
  const [sortOrder, setSortOrder] = useState<1 | 0 | -1 | null | undefined>(-1);

  const [filters, setFilters] = useState<DataTableFilterMeta>({
    nomeCompleto: { value: '', matchMode: FilterMatchMode.CONTAINS },
    username: { value: '', matchMode: FilterMatchMode.CONTAINS },
    email: { value: '', matchMode: FilterMatchMode.CONTAINS },
    groupName: { value: '', matchMode: FilterMatchMode.CONTAINS }
  });

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogModo, setDialogModo] = useState<'criar' | 'editar'>('criar');
  const [form, setForm] = useState<FormUsuario>(formVazio);
  const [salvando, setSalvando] = useState(false);
  const [medicosDropdownIds, setMedicosDropdownIds] = useState<number[]>([]);

  const [vincularDialogVisible, setVincularDialogVisible] = useState(false);
  const [usuarioVinculando, setUsuarioVinculando] = useState<UsuarioRow | null>(null);
  const [medicosVinculados, setMedicosVinculados] = useState<number[]>([]);
  const [carregandoVinculos, setCarregandoVinculos] = useState(false);
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);

  const grupoOptions = useMemo(
    () => grupos.map((g) => ({ label: g.name, value: g.id })),
    [grupos]
  );

  const medicosAtivos = useMemo(
    () =>
      medicos.filter((m) => {
        if (typeof m.ativo === 'boolean') return m.ativo;
        if (typeof m.status === 'boolean') return m.status;
        if (typeof m.status === 'string') return m.status.toLowerCase() === 'ativo';
        return true;
      }),
    [medicos]
  );

  const medicoOptions = useMemo(
    () => {
      // Ao criar novo usuário, mostra TODOS os médicos ativos.
      // Ao editar, restringe aos médicos já autorizados (medicosDropdownIds
      // é populado a partir do backend em abrirEditar).
      const listaBase =
        dialogModo === 'criar'
          ? medicosAtivos
          : medicos.filter((m) => medicosDropdownIds.includes(m.id));
      return listaBase.map((m) => ({ label: nomeMedico(m), value: m.id }));
    },
    [dialogModo, medicos, medicosAtivos, medicosDropdownIds]
  );

  const mapUsuario = (u: ApiUsuario, index: number): UsuarioRow => {
    const firstGroup = Array.isArray(u.groups) ? u.groups[0] : null;
    let groupId: number | null = null;
    if (typeof u.group === 'object' && u.group) {
      groupId = u.group.id;
    } else if (typeof firstGroup === 'object' && firstGroup) {
      groupId = firstGroup.id ?? null;
    } else {
      groupId = u.group_id ?? null;
    }

    let groupName = '--';
    if (typeof u.group === 'string' && u.group) {
      groupName = u.group;
    } else if (typeof u.group === 'object' && u.group?.name) {
      groupName = u.group.name;
    } else if (typeof firstGroup === 'string' && firstGroup) {
      groupName = firstGroup;
    } else if (typeof firstGroup === 'object' && firstGroup?.name) {
      groupName = firstGroup.name;
    } else if (u.group_name) {
      groupName = u.group_name;
    }

    const medicoId = u.medico?.id ?? u.medico_id ?? null;
    const medicoNomeVal = u.medico?.nome ?? u.medico_nome ?? '';
    const first = u.first_name ?? '';
    const last = u.last_name ?? '';
    const nomeCompleto = `${first} ${last}`.trim() || u.username || `Usuário ${u.id}`;

    return {
      id: u.id,
      sequencial: index + 1,
      username: u.username ?? '',
      nomeCompleto,
      email: u.email ?? '',
      firstName: first,
      lastName: last,
      isActive: u.is_active ?? true,
      isStaff: u.is_staff ?? false,
      isSuperuser: u.is_superuser ?? false,
      groupId,
      groupName,
      medicoId,
      medicoNome: medicoNomeVal || (medicoId ? `Médico ${medicoId}` : '--'),
      dateJoined: u.date_joined ?? null,
      lastLogin: u.last_login ?? u.lastLogin ?? null
    };
  };

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [usuariosRes, gruposRes, medicosRes] = await Promise.all([
        getUsuarios(),
        getGruposUsuarios(),
        getMedicosCompleto()
      ]);

      const lista: ApiUsuario[] = Array.isArray(usuariosRes.data)
        ? usuariosRes.data
        : usuariosRes.data?.results ?? [];
      setUsuarios(lista.map(mapUsuario));

      const gruposLista: ApiGrupo[] = Array.isArray(gruposRes.data)
        ? gruposRes.data
        : gruposRes.data?.results ?? [];
      setGrupos(gruposLista);

      setMedicos(((medicosRes.data as ApiMedico[]) ?? []) || []);
    } catch (error) {
      console.error('Erro ao carregar usuários', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregarDados();
  }, []);

  const kpis = useMemo(() => {
    const total = usuarios.length;
    const ativos = usuarios.filter((u) => u.isActive).length;
    const inativos = total - ativos;
    const semLogin = usuarios.filter((u) => !u.lastLogin).length;
    return { total, ativos, inativos, semLogin };
  }, [usuarios]);

  const onPage = (event: DataTablePageEvent) => {
    setFirst(event.first);
    setRows(event.rows);
  };

  const onSort = (event: DataTableSortEvent) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder);
  };

  const abrirCriar = () => {
    setDialogModo('criar');
    setForm({ ...formVazio });
    setMedicosDropdownIds([]);
    setDialogVisible(true);
  };

  const abrirEditar = async (row: UsuarioRow) => {
    setDialogModo('editar');
    setForm({
      id: row.id,
      username: row.username,
      password: '',
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      isActive: row.isActive,
      isStaff: row.isStaff,
      isSuperuser: row.isSuperuser,
      groupId: row.groupId,
      medicoId: row.medicoId
    });
    setMedicosDropdownIds(row.medicoId ? [row.medicoId] : []);
    setDialogVisible(true);

    try {
      const res = await getMedicosUsuario(row.id);
      const lista = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
      const ids = lista
        .map((item: any) => item?.medico_id ?? item?.medico?.id ?? item?.id)
        .filter((id: any): id is number => typeof id === 'number');

      const idsUnicos: number[] = Array.from(new Set<number>(row.medicoId ? [...ids, row.medicoId] : ids));
      setMedicosDropdownIds(idsUnicos);
    } catch (error) {
      console.error('Erro ao carregar médicos vinculados para edição do usuário', error);
      setMedicosDropdownIds(row.medicoId ? [row.medicoId] : []);
    }
  };

  const updateForm = <K extends keyof FormUsuario>(field: K, value: FormUsuario[K]) => {
    setForm((atual) => ({ ...atual, [field]: value }));
  };

  const handleSalvar = async () => {
    if (!form.username.trim()) {
      alert('Informe o nome de usuário.');
      return;
    }
    if (dialogModo === 'criar' && !form.password.trim()) {
      alert('Informe uma senha para o novo usuário.');
      return;
    }

    const payload: UsuarioPayload = {
      username: form.username.trim(),
      email: form.email.trim(),
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      is_active: form.isActive,
      is_staff: form.isStaff,
      is_superuser: form.isSuperuser,
      group_id: form.groupId,
      medico_id: form.medicoId
    };

    if (form.password.trim()) {
      payload.password = form.password;
    }

    setSalvando(true);
    try {
      if (dialogModo === 'criar') {
        await criarUsuario(payload);
      } else if (form.id != null) {
        await editarUsuario(form.id, payload);
      }
      setDialogVisible(false);
      await carregarDados();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ??
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        'Erro ao salvar usuário.';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSalvando(false);
    }
  };

  const abrirVincular = async (row: UsuarioRow) => {
    setUsuarioVinculando(row);
    setVincularDialogVisible(true);
    setMedicosVinculados(row.medicoId ? [row.medicoId] : []);
    setCarregandoVinculos(true);
    try {
      const res = await getMedicosUsuario(row.id);
      const lista = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
      const ids = lista
        .map((item: any) => item?.medico_id ?? item?.medico?.id ?? item?.id)
        .filter((id: any): id is number => typeof id === 'number');
      setMedicosVinculados(ids);
    } catch (error) {
      console.error('Erro ao carregar vínculos do usuário', error);
    } finally {
      setCarregandoVinculos(false);
    }
  };

  const toggleMedicoVinculo = (medicoId: number) => {
    setMedicosVinculados((atual) =>
      atual.includes(medicoId) ? atual.filter((id) => id !== medicoId) : [...atual, medicoId]
    );
  };

  const handleSalvarVinculo = async () => {
    if (!usuarioVinculando) return;
    setSalvandoVinculo(true);
    try {
      await editarUsuario(usuarioVinculando.id, { medico_ids: medicosVinculados });
      setVincularDialogVisible(false);
      await carregarDados();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ??
        err?.response?.data?.detail ??
        'Erro ao salvar vínculo.';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSalvandoVinculo(false);
    }
  };

  const filterElement = (options: any, placeholder: string) => (
    <InputText
      value={options.value || ''}
      onChange={(e) => options.filterApplyCallback(e.target.value)}
      placeholder={placeholder}
      className="p-column-filter"
    />
  );

  const statusBody = (row: UsuarioRow) => (
    <Tag value={row.isActive ? 'Ativo' : 'Inativo'} severity={row.isActive ? 'success' : 'danger'} />
  );

  const editarBody = (row: UsuarioRow) => (
    <Button
      icon="pi pi-pencil"
      rounded
      outlined
      severity="secondary"
      aria-label={`Editar usuário ${row.id}`}
      onClick={() => abrirEditar(row)}
    />
  );

  return (
    <div className="usuarios-page">
      <div className="page-header">
        <div>
          <h1>Usuários</h1>
          <p>Gestão dos usuários do sistema</p>
        </div>

        <div className="page-actions">
          <Button label="Novo Usuário" icon="pi pi-plus" onClick={abrirCriar} />
        </div>
      </div>

      <PainelKpis titulo="Indicadores">
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span>Total Usuários</span>
            <i className="pi pi-users"></i>
          </div>
          <div className="kpi-value">{kpis.total}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Usuários Ativos</span>
            <i className="pi pi-check-circle"></i>
          </div>
          <div className="kpi-value">{kpis.ativos}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Usuários Inativos</span>
            <i className="pi pi-times-circle"></i>
          </div>
          <div className="kpi-value">{kpis.inativos}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span>Sem Primeiro Acesso</span>
            <i className="pi pi-sign-in"></i>
          </div>
          <div className="kpi-value">{kpis.semLogin}</div>
        </div>
      </div>
      </PainelKpis>

      <div className="card">
        <h2 className="mc-tabela-titulo"><i className="pi pi-table" />Usuários cadastrados</h2>
        <DataTable
          aria-label="Usuários cadastrados"
          value={usuarios}
          dataKey="id"
          paginator
          rowsPerPageOptions={[10, 20, 50, 100, 200]}
          rows={rows}
          first={first}
          totalRecords={usuarios.length}
          onPage={onPage}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={onSort}
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          filterDisplay="row"
          loading={loading}
          selectionMode="multiple"
          selection={selectedUsuarios}
          onSelectionChange={(e) => setSelectedUsuarios(e.value as UsuarioRow[])}
          tableStyle={{ minWidth: '90rem' }}
          emptyMessage="Nenhum usuário encontrado."
          className="usuarios-table"
        >
          <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />

          <Column field="sequencial" header="#" sortable style={{ minWidth: '4rem' }} />

          <Column
            field="nomeCompleto"
            header="Nome"
            sortable
            filter
            filterElement={(o) => filterElement(o, 'Buscar')}
            style={{ minWidth: '16rem' }}
          />

          <Column
            field="username"
            header="Usuário"
            sortable
            filter
            filterElement={(o) => filterElement(o, 'Buscar')}
            style={{ minWidth: '12rem' }}
          />

          <Column
            field="email"
            header="Email"
            sortable
            filter
            filterElement={(o) => filterElement(o, 'Buscar')}
            style={{ minWidth: '18rem' }}
          />

          <Column
            field="groupName"
            header="Grupo"
            sortable
            filter
            filterElement={(o) => filterElement(o, 'Buscar')}
            style={{ minWidth: '12rem' }}
          />

          <Column
            field="isActive"
            header={cabecalhoComHint('Status', 'Onde o pedido está no funil (statusProcesso).')}
            sortable
            body={statusBody}
            style={{ minWidth: '8rem' }}
          />

          <Column
            field="lastLogin"
            header="Último acesso"
            sortable
            body={(row: UsuarioRow) => formatarDataHora(row.lastLogin)}
            style={{ minWidth: '12rem' }}
          />

          <Column
            header="Editar"
            body={editarBody}
            style={{ minWidth: '7rem' }}
            bodyStyle={{ textAlign: 'center' }}
          />

          <Column
            header="Vincular Médico"
            body={(row: UsuarioRow) => (
              <Button
                label="Vincular"
                icon="pi pi-link"
                outlined
                onClick={() => void abrirVincular(row)}
              />
            )}
            style={{ minWidth: '12rem' }}
            bodyStyle={{ textAlign: 'center' }}
          />
        </DataTable>
      </div>

      <Dialog
        header={dialogModo === 'criar' ? 'Novo Usuário' : 'Editar Usuário'}
        visible={dialogVisible}
        style={{ width: '54rem', maxWidth: '95vw' }}
        modal
        onHide={() => setDialogVisible(false)}
        className="usuario-edit-dialog"
      >
        <div className="usuario-form-grid">
          <div className="field">
            <label>Nome</label>
            <InputText value={form.firstName} onChange={(e) => updateForm('firstName', e.target.value)} />
          </div>

          <div className="field">
            <label>Sobrenome</label>
            <InputText value={form.lastName} onChange={(e) => updateForm('lastName', e.target.value)} />
          </div>

          <div className="field">
            <label>Usuário</label>
            <InputText value={form.username} onChange={(e) => updateForm('username', e.target.value)} />
          </div>

          <div className="field">
            <label>Email</label>
            <InputText value={form.email} onChange={(e) => updateForm('email', e.target.value)} />
          </div>

          <div className="field field-span-2">
            <label>{dialogModo === 'criar' ? 'Senha' : 'Nova senha (deixe em branco para manter)'}</label>
            <Password
              value={form.password}
              onChange={(e) => updateForm('password', e.target.value)}
              feedback={false}
              toggleMask
              inputStyle={{ width: '100%' }}
              style={{ width: '100%' }}
            />
          </div>

          <div className="field">
            <label>Grupo</label>
            <Dropdown
              value={form.groupId}
              options={grupoOptions}
              onChange={(e) => updateForm('groupId', e.value)}
              placeholder="Selecione um grupo"
              showClear
            />
          </div>

          <div className="field">
            <label>Médico vinculado</label>
            <Dropdown
              value={form.medicoId}
              options={medicoOptions}
              onChange={(e) => updateForm('medicoId', e.value)}
              placeholder="Selecione um médico"
              filter
            />
          </div>

          <div className="field">
            <label>Status</label>
            <div className="status-switch-box">
              <InputSwitch checked={form.isActive} onChange={(e) => updateForm('isActive', !!e.value)} />
              <span>{form.isActive ? 'Ativo' : 'Inativo'}</span>
            </div>
          </div>

          <div className="field">
            <label>Permissões internas</label>
            <div className="status-switch-box">
              <InputSwitch checked={form.isStaff} onChange={(e) => updateForm('isStaff', !!e.value)} />
              <span>Staff</span>
            </div>
            <div className="status-switch-box">
              <InputSwitch
                checked={form.isSuperuser}
                onChange={(e) => updateForm('isSuperuser', !!e.value)}
              />
              <span>Superusuário</span>
            </div>
          </div>
        </div>

        <div className="dialog-footer-actions">
          <Button label="Cancelar" outlined onClick={() => setDialogVisible(false)} disabled={salvando} />
          <Button
            label={salvando ? 'Salvando...' : 'Salvar'}
            icon="pi pi-check"
            loading={salvando}
            onClick={() => void handleSalvar()}
          />
        </div>
      </Dialog>

      <Dialog
        header={`Vincular Médico${usuarioVinculando ? ` - ${usuarioVinculando.nomeCompleto}` : ''}`}
        visible={vincularDialogVisible}
        style={{ width: '48rem', maxWidth: '95vw' }}
        modal
        onHide={() => setVincularDialogVisible(false)}
        className="usuario-vinculo-dialog"
      >
        {carregandoVinculos ? (
          <div style={{ padding: '1rem' }}>Carregando vínculos...</div>
        ) : (
          <div className="medicos-vinculo-lista">
            {medicosAtivos.length === 0 ? (
              <div style={{ padding: '1rem' }}>Nenhum médico ativo cadastrado.</div>
            ) : (
              medicosAtivos.map((medico) => {
                const checked = medicosVinculados.includes(medico.id);
                return (
                  <label key={medico.id} className="medico-vinculo-item">
                    <div className="medico-vinculo-left">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMedicoVinculo(medico.id)}
                      />
                      <div className="medico-vinculo-info">
                        <strong>{nomeMedico(medico)}</strong>
                      </div>
                    </div>
                    <Tag value="Ativo" severity="success" />
                  </label>
                );
              })
            )}
          </div>
        )}

        <div className="dialog-footer-actions">
          <Button
            label="Cancelar"
            outlined
            onClick={() => setVincularDialogVisible(false)}
            disabled={salvandoVinculo}
          />
          <Button
            label={salvandoVinculo ? 'Salvando...' : 'Salvar Vínculo'}
            icon="pi pi-check"
            loading={salvandoVinculo}
            onClick={() => void handleSalvarVinculo()}
          />
        </div>
      </Dialog>
    </div>
  );
}
