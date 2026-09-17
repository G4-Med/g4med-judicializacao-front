import { Dialog } from 'primereact/dialog';
import { useLocation } from 'react-router-dom';
import { ajudaDaRota } from '../../content/ajudaPaginas';
import './AjudaModal.css';

/**
 * MODAL DE AJUDA — o "?" do header explicando a tela em que você está.
 *
 * Lê a rota atual (useLocation) e busca o conteúdo em ajudaPaginas.ts.
 * Página sem conteúdo registrado ainda mostra isso HONESTAMENTE (¬esconde
 * o botão, ¬finge que documentou) — a régua já usada em todo o sistema:
 * ausência de dado é diferente de "não existe nada aqui".
 */
export function AjudaModal({ visible, onHide }: { visible: boolean; onHide: () => void }) {
  const { pathname } = useLocation();
  const ajuda = ajudaDaRota(pathname);

  return (
    <Dialog
      header={ajuda ? `Ajuda — ${ajuda.titulo}` : 'Ajuda'}
      visible={visible}
      onHide={onHide}
      style={{ width: '32rem', maxWidth: '92vw' }}
      dismissableMask
    >
      {ajuda ? (
        <div className="ajuda-modal">
          <p className="ajuda-modal__oquee">{ajuda.oQueE}</p>

          <h4>O que você encontra aqui</h4>
          <ul>
            {ajuda.contem.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          {ajuda.indicadores && (
            <>
              <h4>Indicadores desta tela</h4>
              <ul>
                {ajuda.indicadores.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <p className="ajuda-modal__vazio">
          Esta tela ainda não tem ajuda documentada. Se precisar de explicação
          agora, veja o{' '}
          <a href="/processo-operacional">manual do Processo Operacional</a>.
        </p>
      )}
    </Dialog>
  );
}

export default AjudaModal;
