import logoG4med from '../../assets/logo-g4med-branca.svg'
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  redefinirSenha,
  solicitarCodigoRecuperacao,
  validarCodigoRecuperacao,
} from '../../services/auth';
import './LoginPage.css';

interface BrandProps { compact?: boolean }
const BrandMark = ({ compact = false }: BrandProps) => (
  <div className={`login-page__brand ${compact ? 'login-page__brand--compact' : ''}`}>
    <div className="login-page__brand-text">
      <img src={logoG4med} alt="G4MED" style={{ height: 30, display: 'block', marginBottom: 6 }} />
      <small>Urgência e Emergência Judicial</small>
    </div>
  </div>
);

function extractErrorMessage(error: any): string {
  const data = error?.response?.data;
  if (typeof data?.error === 'string') return data.error;
  if (Array.isArray(data?.error)) return data.error.join(' ');
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.detail === 'string') return data.detail;
  return 'Não foi possível concluir a operação.';
}

export function RecuperarSenhaPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'solicitar' | 'redefinir'>('solicitar');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showNovaSenha, setShowNovaSenha] = useState(false);
  const [showConfirmarSenha, setShowConfirmarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const footerText = useMemo(
    () =>
      step === 'solicitar'
        ? 'O código expira em 15 minutos após o envio.'
        : 'Use o código recebido por email para concluir a redefinição.',
    [step]
  );

  const handleSolicitar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await solicitarCodigoRecuperacao(email.trim());
      setSuccess(response?.message ?? 'Se o email existir, o código de recuperação foi enviado.');
      setStep('redefinir');
    } catch (err: any) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRedefinir = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (novaSenha !== confirmarSenha) {
      setError('As senhas não conferem.');
      return;
    }

    setLoading(true);
    try {
      const validacao = await validarCodigoRecuperacao(email.trim(), codigo.trim());
      if (!validacao?.success) {
        setError(validacao?.error ?? 'Código inválido ou expirado.');
        return;
      }

      const redefinicao = await redefinirSenha(email.trim(), codigo.trim(), novaSenha);
      setSuccess(redefinicao?.message ?? 'Senha redefinida com sucesso.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err: any) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__card login-page__card--single">
        <div className="login-page__card-bg login-page__card-bg--left">
          <div className="login-page__bg-pattern" />
        </div>

        <div className="login-page__logo login-page__logo--left is-active">
          <BrandMark />
          <p className="login-page__tagline">
            Recupere o acesso com segurança
            <br />
            e volte rapidamente para a operação.
          </p>
        </div>

        <div className="login-page__panel login-page__panel--recover login-page__panel--static is-active">
          <form className="login-page__form login-page__form--static" onSubmit={step === 'solicitar' ? handleSolicitar : handleRedefinir}>
            <span className="login-page__eyebrow">Recuperação de senha</span>
            <h1 className="login-page__title">
              {step === 'solicitar' ? 'Esqueceu sua senha?' : 'Definir nova senha'}
            </h1>
            <p className="login-page__subtitle">
              {step === 'solicitar'
                ? 'Informe seu email para receber o código de recuperação.'
                : 'Digite o código recebido e escolha sua nova senha.'}
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
                disabled={loading || step === 'redefinir'}
              />
            </div>

            {step === 'redefinir' && (
              <>
                <div className="login-page__input-box">
                  <i className="pi pi-key login-page__input-icon" />
                  <input
                    className="login-page__input"
                    type="text"
                    placeholder="Código de 6 dígitos"
                    required
                    maxLength={6}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={loading}
                  />
                </div>

                <div className="login-page__input-box">
                  <i className="pi pi-lock login-page__input-icon" />
                  <input
                    className="login-page__input"
                    type={showNovaSenha ? 'text' : 'password'}
                    placeholder="Nova senha"
                    required
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="login-page__input-trailing"
                    onClick={() => setShowNovaSenha((value) => !value)}
                    aria-label={showNovaSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    <i className={showNovaSenha ? 'pi pi-eye-slash' : 'pi pi-eye'} />
                  </button>
                </div>

                <div className="login-page__input-box">
                  <i className="pi pi-lock login-page__input-icon" />
                  <input
                    className="login-page__input"
                    type={showConfirmarSenha ? 'text' : 'password'}
                    placeholder="Confirmar nova senha"
                    required
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="login-page__input-trailing"
                    onClick={() => setShowConfirmarSenha((value) => !value)}
                    aria-label={showConfirmarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    <i className={showConfirmarSenha ? 'pi pi-eye-slash' : 'pi pi-eye'} />
                  </button>
                </div>
              </>
            )}

            {error && (
              <p className="login-page__error">
                <i className="pi pi-exclamation-circle" /> {error}
              </p>
            )}

            {success && (
              <p className="login-page__success">
                <i className="pi pi-check-circle" /> {success}
              </p>
            )}

            <button type="submit" className="login-page__button" disabled={loading}>
              {loading ? (
                <><i className="pi pi-spin pi-spinner" /> Processando...</>
              ) : step === 'solicitar' ? (
                <>Enviar código <i className="pi pi-send" /></>
              ) : (
                <>Redefinir senha <i className="pi pi-check" /></>
              )}
            </button>

            <p className="login-page__text">
              {step === 'solicitar' ? 'Lembrou a senha?' : 'Quer solicitar outro código?'}
              <button
                type="button"
                className="login-page__link-button"
                onClick={() => {
                  if (step === 'solicitar') {
                    navigate('/login');
                    return;
                  }
                  setCodigo('');
                  setNovaSenha('');
                  setConfirmarSenha('');
                  setError('');
                  setSuccess('');
                  setStep('solicitar');
                }}
              >
                {step === 'solicitar' ? 'Voltar ao login' : 'Solicitar novamente'}
              </button>
            </p>

            <div className="login-page__footer">
              <span><i className="pi pi-info-circle" /> {footerText}</span>
            </div>
          </form>
        </div>
      </div>
      <p className="login-page__copyright">© {new Date().getFullYear()} G4MED · Sistema de Judicialização</p>
    </div>
  );
}
