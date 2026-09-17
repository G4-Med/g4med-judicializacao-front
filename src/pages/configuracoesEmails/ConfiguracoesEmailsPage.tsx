import { useEffect, useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import {
  atualizarConfiguracaoEmail,
  getConfiguracoesEmails,
  salvarConfiguracaoEmail,
} from '../../services/api/orders';
import './ConfiguracoesEmailsPage.css';

type TipoEmail = 'DAR_PERDA' | 'PEDIR_EXAMES' | 'ENVIAR_ORCAMENTO' | 'RECEBIMENTO_PEDIDO' | 'RECEBIMENTO_PEDIDO_SEGREDO' | 'RECEBIMENTO_PEDIDO_SEM_ANEXO' | 'PEDIDO_EXAMES_PEDIATRICO';

interface ConfiguracaoEmail {
  id?: number;
  tipoEmail: TipoEmail;
  assunto: string;
  corpo: string;
  ativo?: boolean;
}

const CONFIG_PADRAO: Record<TipoEmail, ConfiguracaoEmail> = {
  DAR_PERDA: { tipoEmail: 'DAR_PERDA', assunto: '', corpo: '', ativo: true },
  PEDIR_EXAMES: { tipoEmail: 'PEDIR_EXAMES', assunto: '', corpo: '', ativo: true },
  ENVIAR_ORCAMENTO: { tipoEmail: 'ENVIAR_ORCAMENTO', assunto: '', corpo: '', ativo: true },
  RECEBIMENTO_PEDIDO: { tipoEmail: 'RECEBIMENTO_PEDIDO', assunto: '', corpo: '', ativo: true },
  RECEBIMENTO_PEDIDO_SEGREDO: { tipoEmail: 'RECEBIMENTO_PEDIDO_SEGREDO', assunto: '', corpo: '', ativo: true },
  RECEBIMENTO_PEDIDO_SEM_ANEXO: { tipoEmail: 'RECEBIMENTO_PEDIDO_SEM_ANEXO', assunto: '', corpo: '', ativo: true },
  PEDIDO_EXAMES_PEDIATRICO: { tipoEmail: 'PEDIDO_EXAMES_PEDIATRICO', assunto: '', corpo: '', ativo: true },
};

const TIPOS_EMAIL: Array<{
  tipoEmail: TipoEmail;
  titulo: string;
  descricao: string;
  icon: string;
}> = [
  {
    tipoEmail: 'DAR_PERDA',
    titulo: 'Dar Perda',
    descricao: 'Configura o assunto e o corpo do email usado quando o pedido não terá orçamento.',
    icon: 'pi pi-times-circle',
  },
  {
    tipoEmail: 'PEDIR_EXAMES',
    titulo: 'Pedir Exames',
    descricao: 'Configura o email de devolutiva para solicitar exames complementares ao estado.',
    icon: 'pi pi-search',
  },
  {
    tipoEmail: 'ENVIAR_ORCAMENTO',
    titulo: 'Enviar Orçamento',
    descricao: 'Configura o email usado quando o orçamento foi obtido e será enviado ao estado.',
    icon: 'pi pi-file',
  },
  {
    tipoEmail: 'RECEBIMENTO_PEDIDO',
    titulo: 'Recebimento Pedido',
    descricao: 'Configura o email de confirmação de recebimento do pedido enviado pelo estado.',
    icon: 'pi pi-inbox',
  },
  {
    tipoEmail: 'RECEBIMENTO_PEDIDO_SEGREDO',
    titulo: 'Recebimento Pedido (Segredo de Justiça)',
    descricao: 'Usado automaticamente quando o paciente é menor de 18 anos (sugestão de segredo de ' +
      'justiça, task #193). ⚠ Não inclua nome completo do paciente nem número de processo no corpo — ' +
      'é justamente o e-mail que precisa proteger essa identidade. Sem configuração aqui, o sistema ' +
      'usa o template normal de Recebimento Pedido.',
    icon: 'pi pi-lock',
  },
  {
    tipoEmail: 'RECEBIMENTO_PEDIDO_SEM_ANEXO',
    titulo: 'Recebimento Pedido (sem anexo)',
    descricao: 'Usado automaticamente quando o e-mail do pedido chega SEM nenhum documento anexado — ' +
      'em vez de só confirmar, pede ao remetente o que falta (ofício, laudo, exames). Segredo de ' +
      'justiça tem prioridade sobre este. Sem configuração aqui, o sistema usa o Recebimento Pedido normal.',
    icon: 'pi pi-paperclip',
  },
  {
    tipoEmail: 'PEDIDO_EXAMES_PEDIATRICO',
    titulo: 'Pedido de exames (pediátrico / recém-nascido)',
    descricao: 'Segundo e-mail, automático, para todo pedido de paciente com menos de 18 anos: explica que casos ' +
      'infantis e de recém-nascidos sem os exames da patologia quase não recebem cotação e pede qualquer exame além ' +
      'dos juntados ao processo (inclusive em posse da família). Placeholders extras: {{faixaPediatrica}} ' +
      '("recém-nascido(a)", "criança de 4 anos", "adolescente de 15 anos") e {{idadePaciente}}. A resposta entra ' +
      'sozinha na thread do pedido. Sem template ativo aqui, o e-mail não sai.',
    icon: 'pi pi-heart',
  },
];

const VARIAVEIS_EMAIL = [
  { label: 'Nome solicitante', value: '{{nomeSolicitante}}' },
  { label: 'Email solicitante', value: '{{emailSolicitante}}' },
  { label: 'Paciente', value: '{{paciente}}' },
  { label: 'Procedimento', value: '{{procedimento}}' },
  { label: 'Nome do médico', value: '{{medico}}' },
  { label: 'Exames solicitados', value: '{{exames}}' },
];

export function ConfiguracoesEmailsPage() {
  const [loading, setLoading] = useState(false);
  const [salvandoTipo, setSalvandoTipo] = useState<TipoEmail | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoEmail | null>(null);
  const [configuracoes, setConfiguracoes] = useState<Record<TipoEmail, ConfiguracaoEmail>>(CONFIG_PADRAO);
  const [form, setForm] = useState<ConfiguracaoEmail>(CONFIG_PADRAO.DAR_PERDA);

  const carregarConfiguracoes = async () => {
    setLoading(true);
    try {
      const response = await getConfiguracoesEmails();
      const lista = Array.isArray(response.data) ? response.data : [];

      const mapa = lista.reduce<Record<TipoEmail, ConfiguracaoEmail>>((acc, item) => {
        if (item?.tipoEmail && acc[item.tipoEmail as TipoEmail]) {
          acc[item.tipoEmail as TipoEmail] = {
            id: item.id,
            tipoEmail: item.tipoEmail,
            assunto: item.assunto ?? '',
            corpo: item.corpo ?? '',
            ativo: item.ativo ?? true,
          };
        }
        return acc;
      }, { ...CONFIG_PADRAO });

      setConfiguracoes(mapa);
    } catch (error) {
      console.error('Erro ao carregar configurações de emails', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregarConfiguracoes();
  }, []);

  const cards = useMemo(
    () => TIPOS_EMAIL.map((tipo) => ({ ...tipo, dados: configuracoes[tipo.tipoEmail] ?? CONFIG_PADRAO[tipo.tipoEmail] })),
    [configuracoes]
  );

  const abrirDialog = (tipoEmail: TipoEmail) => {
    setTipoSelecionado(tipoEmail);
    setForm(configuracoes[tipoEmail] ?? CONFIG_PADRAO[tipoEmail]);
    setDialogVisible(true);
  };

  const fecharDialog = () => {
    setDialogVisible(false);
    setTipoSelecionado(null);
  };

  const salvar = async () => {
    if (!tipoSelecionado) return;
    if (!form.assunto.trim() || !form.corpo.trim()) {
      alert('Preencha assunto e corpo do email.');
      return;
    }

    try {
      setSalvandoTipo(tipoSelecionado);
      if (form.id) {
        await atualizarConfiguracaoEmail(form.id, {
          assunto: form.assunto.trim(),
          corpo: form.corpo.trim(),
          ativo: true,
        });
      } else {
        await salvarConfiguracaoEmail({
          tipoEmail: tipoSelecionado,
          assunto: form.assunto.trim(),
          corpo: form.corpo.trim(),
          ativo: true,
        });
      }
      await carregarConfiguracoes();
      fecharDialog();
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Erro ao salvar configuração do email.');
    } finally {
      setSalvandoTipo(null);
    }
  };

  const cardSelecionado = tipoSelecionado
    ? TIPOS_EMAIL.find((item) => item.tipoEmail === tipoSelecionado)
    : null;

  const inserirVariavel = (campo: 'assunto' | 'corpo', variavel: string) => {
    setForm((atual) => ({
      ...atual,
      [campo]: atual[campo] ? `${atual[campo]} ${variavel}` : variavel,
    }));
  };

  return (
    <div className="configuracoes-emails-page">
      <div className="page-header">
        <div>
          <h1>Configurações Emails</h1>
          <p>Escolha um tipo de email para configurar o assunto e o corpo padrão.</p>
        </div>
      </div>

      <div className="emails-config-cards">
        {cards.map((item) => (
          <Card key={item.tipoEmail} className="email-config-card email-config-card-clickable">
            <button
              type="button"
              className="email-config-card-button"
              onClick={() => abrirDialog(item.tipoEmail)}
            >
              <div className="email-config-icon">
                <i className={item.icon} />
              </div>

              <div className="email-config-card-content">
                <h3>{item.titulo}</h3>
                <p>{item.descricao}</p>
              </div>

              <div className="email-config-card-footer">
                <span className="email-config-badge">{item.tipoEmail}</span>
                <span className="email-config-open">Configurar</span>
              </div>
            </button>
          </Card>
        ))}
      </div>

      <Dialog
        header={cardSelecionado ? `Configurar ${cardSelecionado.titulo}` : 'Configurar Email'}
        visible={dialogVisible}
        modal
        onHide={fecharDialog}
        style={{ width: '62vw', maxWidth: '900px' }}
        className="configuracao-email-dialog"
      >
        <div className="configuracao-email-dialog-content">
          {cardSelecionado && (
            <div className="configuracao-email-dialog-top">
              <div>
                <div className="configuracao-email-dialog-type">{cardSelecionado.titulo}</div>
                <p className="configuracao-email-dialog-description">{cardSelecionado.descricao}</p>
              </div>
              <span className="email-config-badge">{cardSelecionado.tipoEmail}</span>
            </div>
          )}

          <div className="email-variaveis-box">
            <label>Variáveis disponíveis</label>
            <div className="email-variaveis-buttons">
              {VARIAVEIS_EMAIL.map((variavel) => (
                <Button
                  key={variavel.value}
                  type="button"
                  label={variavel.label}
                  outlined
                  size="small"
                  onClick={() => inserirVariavel('corpo', variavel.value)}
                />
              ))}
            </div>
          </div>

          <div className="email-config-field">
            <label>Assunto</label>
            <InputText
              value={form.assunto}
              onChange={(e) => setForm((atual) => ({ ...atual, assunto: e.target.value }))}
              placeholder="Digite o assunto padrão"
            />
          </div>

          <div className="email-config-field">
            <label>Corpo do email</label>
            <InputTextarea
              value={form.corpo}
              onChange={(e) => setForm((atual) => ({ ...atual, corpo: e.target.value }))}
              rows={14}
              autoResize
              placeholder="Digite o corpo padrão do email"
            />
          </div>

          <div className="email-config-actions">
            <Button label="Cancelar" outlined onClick={fecharDialog} />
            <Button
              label={salvandoTipo === tipoSelecionado ? 'Salvando...' : 'Salvar configuração'}
              icon="pi pi-save"
              loading={salvandoTipo === tipoSelecionado}
              disabled={loading || salvandoTipo !== null}
              onClick={() => void salvar()}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
