import logoG4med from '../../assets/logo-g4med-branca.svg'
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { persistAuthProfile } from '../../access/authProfile';
import { getDefaultRouteForGroup } from '../../access/permissions';
import { login } from '../../services/auth';
import './LoginPage.css';

type ViewType = 'login' | 'recover';

/* ============================================================
   Brand mark — MEDCHECK (sem dependência de arquivo de imagem)
   ============================================================ */
interface BrandProps { compact?: boolean }
const BrandMark = ({ compact = false }: BrandProps) => (
  <div className={`login-page__brand ${compact ? 'login-page__brand--compact' : ''}`}>
    <div className="login-page__brand-text">
      <img src={logoG4med} alt="G4MED" style={{ height: 30, display: 'block', marginBottom: 6 }} />
      <small>Urgência e Emergência Judicial</small>
    </div>
  </div>
);

/* ============================================================
   Backgrounds (rotação preservada)
   ============================================================ */
interface LoginCardBackgroundProps { view: ViewType }
const LoginCardBackground = ({ view }: LoginCardBackgroundProps) => {
  const bgClass = view === 'login' ? 'recover' : 'login';
  return (
    <>
      <div className={`login-page__card-bg login-page__card-bg--left ${bgClass}`}>
        <div className="login-page__bg-pattern" />
      </div>
      <div className={`login-page__card-bg login-page__card-bg--right ${bgClass}`}>
        <div className="login-page__bg-pattern" />
      </div>
    </>
  );
};

/* ============================================================
   Logo flutuante de cada lado (transição preservada)
   ============================================================ */
interface LoginLogoGroupProps { view: ViewType }
const LoginLogoGroup = ({ view }: LoginLogoGroupProps) => (
  <>
    <div className={`login-page__logo login-page__logo--left ${view === 'recover' ? 'is-active' : ''}`}>
      <BrandMark />
      <p className="login-page__tagline">
        Gestão integrada de casos de urgência e emergência judicial em saúde.
      </p>
    </div>
    <div className={`login-page__logo login-page__logo--right ${view === 'login' ? 'is-active' : ''}`}>
      <BrandMark />
      <p className="login-page__tagline">
        Recupere seu acesso com segurança<br />e volte à operação em segundos.
      </p>
    </div>
  </>
);

/* ============================================================
   Formulários
   ============================================================ */
interface LoginFormsProps { view: ViewType; toggleView: () => void }
const LoginForms = ({ view, toggleView }: LoginFormsProps) => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoverSent, setRecoverSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(username, password);
      const profile = persistAuthProfile(data);
      navigate(getDefaultRouteForGroup(profile.group));
    } catch (err: any) {
      // "Usuário ou senha incorretos" só é verdade no 401 — antes disto, qualquer
      // falha (servidor fora, rede, timeout) mostrava a MESMA mensagem, escondendo
      // a causa real (achado 26/08: tentativa de login bateu no backend subindo,
      // a tela disse "senha errada" quando a senha nunca chegou a ser checada).
      if (err?.response?.status === 401) {
        setError('Usuário ou senha incorretos.');
      } else if (!err?.response) {
        setError('Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.');
      } else {
        setError('Erro ao entrar. Tente novamente em instantes.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = (e: React.FormEvent) => {
    e.preventDefault();
    setRecoverSent(true);
  };

  return (
    <>
      {/* ---------- LOGIN ---------- */}
      <div className={`login-page__panel login-page__panel--login ${view === 'login' ? 'is-active' : ''}`}>
        <form className="login-page__form" onSubmit={handleLogin}>
          <span className="login-page__eyebrow">Acesso ao sistema</span>
          <h1 className="login-page__title">Bem-vindo de volta</h1>
          <p className="login-page__subtitle">Entre com suas credenciais para continuar.</p>

          <div className="login-page__input-box">
            <i className="pi pi-user login-page__input-icon" />
            <input
              className="login-page__input"
              type="text"
              placeholder="Usuário"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="login-page__input-box">
            <i className="pi pi-lock login-page__input-icon" />
            <input
              className="login-page__input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Senha"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="login-page__input-trailing"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              <i className={showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'} />
            </button>
          </div>

          {error && (
            <p className="login-page__error">
              <i className="pi pi-exclamation-circle" /> {error}
            </p>
          )}

          <button type="submit" className="login-page__button" disabled={loading}>
            {loading ? (
              <><i className="pi pi-spin pi-spinner" /> Entrando...</>
            ) : (
              <>Entrar <i className="pi pi-arrow-right" /></>
            )}
          </button>

          <p className="login-page__text">
            Esqueceu sua senha?
            <button type="button" className="login-page__link-button" onClick={() => navigate('/recuperar-senha')}>
              Recuperar aqui
            </button>
          </p>

          <div className="login-page__footer">
            <span><i className="pi pi-shield" /> Conexão protegida por SSL</span>
          </div>
        </form>
      </div>

      {/* ---------- RECUPERAR ---------- */}
      <div className={`login-page__panel login-page__panel--recover ${view === 'recover' ? 'is-active' : ''}`}>
        <form className="login-page__form" onSubmit={handleRecover}>
          <span className="login-page__eyebrow">Recuperação de senha</span>
          <h1 className="login-page__title">Esqueceu sua senha?</h1>
          <p className="login-page__subtitle">
            Informe seu email cadastrado e enviaremos um link para redefinir sua senha.
          </p>

          <div className="login-page__input-box">
            <i className="pi pi-envelope login-page__input-icon" />
            <input
              className="login-page__input"
              type="email"
              placeholder="seuemail@dominio.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {recoverSent && (
            <p className="login-page__success">
              <i className="pi pi-check-circle" /> Se o email estiver cadastrado, você receberá as instruções em breve.
            </p>
          )}

          <button type="submit" className="login-page__button">
            Enviar link de recuperação <i className="pi pi-send" />
          </button>

          <p className="login-page__text">
            Lembrou a senha?
            <button type="button" className="login-page__link-button" onClick={toggleView}>
              Voltar ao login
            </button>
          </p>

          <div className="login-page__footer">
            <span><i className="pi pi-info-circle" /> O link expira em 30 minutos</span>
          </div>
        </form>
      </div>
    </>
  );
};

/* ============================================================
   Página
   ============================================================ */
export const LoginPage = () => {
  const [view, setView] = useState<ViewType>('login');
  const toggleView = () => setView((prev) => (prev === 'login' ? 'recover' : 'login'));

  return (
    <div className="login-page">
      <div className="login-page__card">
        <LoginCardBackground view={view} />
        <LoginLogoGroup view={view} />
        <LoginForms view={view} toggleView={toggleView} />
      </div>
      <p className="login-page__copyright">© {new Date().getFullYear()} G4MED · Sistema de Judicialização</p>
    </div>
  );
};
