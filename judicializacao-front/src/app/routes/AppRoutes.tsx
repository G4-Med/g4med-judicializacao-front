import { Route, Routes } from 'react-router-dom';

import { MainLayout } from '../layout/MainLayout';

import { LoginPage } from '../../pages/auth/LoginPage';
import { RecuperarSenhaPage } from '../../pages/auth/RecuperarSenhaPage';
import { DashboardPage } from '../../pages/dashboard/DashboardPage';
import { HomePage } from '../../pages/home/HomePage';
import { ProcessosPage } from '../../pages/processos/ProcessosPage';
import { ClientesPage } from '../../pages/clientes/ClientesPage';
import { ParaProtocolarPage } from '../../pages/paraProtocolar/ParaProtocolarPage';
import { ProtocoladosPage } from '../../pages/protocolados/ProtocoladosPage';
import { EnviadoSesPage } from '../../pages/enviadoSes/EnviadoSesPage';
import { SegredoJusticaPage } from '../../pages/segredoJustica/SegredoJusticaPage';
// As 4 páginas de Resultados não são mais importadas aqui: quem as monta agora é o
// PainelResultadosPage (cada uma vira uma aba). Os ARQUIVOS continuam no disco e em uso —
// só deixaram de ter rota própria. A poda deles é a F5, condicionada a 7 dias de uso.
import { PainelResultadosPage } from '../../pages/painelResultados/PainelResultadosPage';
import { UsuariosPage } from '../../pages/usuarios/UsuariosPage';
import { ConfiguracoesPage } from '../../pages/configuracoes/ConfiguracoesPage';
import { LogsPage } from '../../pages/logs/LogsPage';
import { LixeiraPage } from '../../pages/lixeira/LixeiraPage';
import { OrcamentosTerceirosPage } from '../../pages/orcamentosTerceiros/OrcamentosTerceirosPage';
import { CentralEmailsPage } from '../../pages/centralEmails/CentralEmailsPage';
import { FunilPage } from '../../pages/funil/FunilPage';
import { SlaPage } from '../../pages/sla/SlaPage';
import { NotificacoesHistoricoPage } from '../../pages/notificacoesHistorico/NotificacoesHistoricoPage';
import { ProcessoOperacionalPage } from '../../pages/processoOperacional/ProcessoOperacionalPage';
import { JuridicoPage } from '../../pages/juridico/JuridicoPage';
import { OrcamentoMedicoPage } from '../../pages/orcamentoMedico/OrcamentoMedicoPage';
import { SelecionarMedicoPage } from '../../pages/selecionarMedico/SelecionarMedicoPage';
import { RelatorioResumidoPage } from '../../pages/relatorios/RelatorioResumidoPage';
import { RelatorioConsolidadoPage } from '../../pages/relatorios/RelatorioConsolidadoPage';
import { EmailsPage } from '../../pages/emails/EmailsPage';
import { ConfiguracoesEmailsPage } from '../../pages/configuracoesEmails/ConfiguracoesEmailsPage';
import { ConfiguracoesColunasPage } from '../../pages/configuracoesColunas/ConfiguracoesColunasPage';
import { MonitorIntegracaoPage } from '../../pages/monitorIntegracao/MonitorIntegracaoPage';
import { AccessProvider } from '../../access/AccessContext';
import { ProtectedScreen, RequireAuth } from '../../access/ProtectedRoute';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />

      <Route
        element={(
          <RequireAuth>
            <AccessProvider>
              <MainLayout />
            </AccessProvider>
          </RequireAuth>
        )}
      >
        <Route path="/" element={<ProtectedScreen screen="home"><HomePage /></ProtectedScreen>} />
        <Route path="/home" element={<ProtectedScreen screen="home"><HomePage /></ProtectedScreen>} />
        <Route path="/dashboard" element={<ProtectedScreen screen="dashboard"><DashboardPage /></ProtectedScreen>} />

        <Route path="/processos" element={<ProtectedScreen screen="processos"><ProcessosPage /></ProtectedScreen>} />
        <Route path="/clientes" element={<ProtectedScreen screen="clientes"><ClientesPage /></ProtectedScreen>} />

        <Route path="/para-protocolar" element={<ProtectedScreen screen="paraProtocolar"><ParaProtocolarPage /></ProtectedScreen>} />
        <Route path="/protocolados" element={<ProtectedScreen screen="protocolados"><ProtocoladosPage /></ProtectedScreen>} />
        <Route path="/enviado-ses" element={<ProtectedScreen screen="protocolados"><EnviadoSesPage /></ProtectedScreen>} />
        <Route path="/segredo-justica" element={<ProtectedScreen screen="segredoJustica"><SegredoJusticaPage /></ProtectedScreen>} />
        <Route path="/funil" element={<ProtectedScreen screen="funil"><FunilPage /></ProtectedScreen>} />
        <Route path="/sla" element={<ProtectedScreen screen="sla"><SlaPage /></ProtectedScreen>} />
        <Route path="/notificacoes-historico" element={<ProtectedScreen screen="notificacoesHistorico"><NotificacoesHistoricoPage /></ProtectedScreen>} />
        <Route path="/processo-operacional" element={<ProtectedScreen screen="processoOperacional"><ProcessoOperacionalPage /></ProtectedScreen>} />
        <Route path="/juridico" element={<ProtectedScreen screen="juridico"><JuridicoPage /></ProtectedScreen>} />
        <Route path="/selecionar-medico" element={<ProtectedScreen screen="selecionarMedico"><SelecionarMedicoPage /></ProtectedScreen>} />
        <Route path="/orcamento-medico" element={<ProtectedScreen screen="orcamentoMedico"><OrcamentoMedicoPage /></ProtectedScreen>} />

        {/* PAINEL DE RESULTADOS (@R 08/09) — 1 rota, 5 abas na ordem do funil.
            As 4 rotas antigas (/resultados, /aguardando-cirurgia, /resultados-financeiros,
            /perdas) foram REMOVIDAS, não redirecionadas: o @R confirmou que ninguém tem
            atalho salvo, e redirect que ninguém usa é código morto se explicando.
            As páginas continuam existindo — cada uma é uma aba deste painel.
            ⚠ Escopo de acesso conferido antes de unificar: nenhum grupo tinha permissão
            PARCIAL (ADMIN/GERENTE/JURIDICO/MEDICO/SUPERVISOR viam as 4; SECRETARIA
            nenhuma). Logo `screen="resultados"` não abre nem fecha porta para ninguém. */}
        <Route path="/painel-resultados" element={<ProtectedScreen screen="resultados"><PainelResultadosPage /></ProtectedScreen>} />
        <Route path="/emails" element={<ProtectedScreen screen="emails"><EmailsPage /></ProtectedScreen>} />

        <Route path="/relatorios/resumido" element={<ProtectedScreen screen="relatorioResumido"><RelatorioResumidoPage /></ProtectedScreen>} />
        <Route path="/relatorios/consolidado" element={<ProtectedScreen screen="relatorioConsolidado"><RelatorioConsolidadoPage /></ProtectedScreen>} />

        <Route path="/usuarios" element={<ProtectedScreen screen="usuarios"><UsuariosPage /></ProtectedScreen>} />
        <Route path="/configuracoes" element={<ProtectedScreen screen="configuracoes"><ConfiguracoesPage /></ProtectedScreen>} />
        <Route path="/configuracoes-emails" element={<ProtectedScreen screen="configuracoesEmails"><ConfiguracoesEmailsPage /></ProtectedScreen>} />
        {/* Colunas: preferência de UI do próprio usuário — mesma proteção da tela de configurações. */}
        <Route path="/configuracoes-colunas" element={<ProtectedScreen screen="configuracoes"><ConfiguracoesColunasPage /></ProtectedScreen>} />
        <Route path="/monitor-integracao" element={<ProtectedScreen screen="monitorIntegracao"><MonitorIntegracaoPage /></ProtectedScreen>} />
        <Route path="/logs" element={<ProtectedScreen screen="logs"><LogsPage /></ProtectedScreen>} />
        <Route path="/lixeira" element={<ProtectedScreen screen="lixeira"><LixeiraPage /></ProtectedScreen>} />
        <Route path="/orcamentos-terceiros" element={<ProtectedScreen screen="orcamentosTerceiros"><OrcamentosTerceirosPage /></ProtectedScreen>} />
        <Route path="/central-emails" element={<ProtectedScreen screen="centralEmails"><CentralEmailsPage /></ProtectedScreen>} />
      </Route>
    </Routes>
  );
}
