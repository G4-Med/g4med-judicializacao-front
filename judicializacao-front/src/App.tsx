import { AppRoutes } from './app/routes/AppRoutes';
import { AvisoAmbiente } from './components/AvisoAmbiente/AvisoAmbiente';
import './components/AvisoAmbiente/AvisoAmbiente.css';

function App() {
  // AvisoAmbiente vem ANTES das rotas de propósito: monta em toda tela, não só na inicial.
  // Ele devolve null quando o alvo não é produção — ver a docstring do componente.
  return (
    <>
      <AvisoAmbiente />
      <AppRoutes />
    </>
  );
}

export default App;