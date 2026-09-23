/**
 * FICHA DO PEDIDO — disponível em TODA tela de fase, por um único ponto de montagem.
 *
 * @R 16/09/2026, depois de eu ter plugado a ficha só na tela Processos e tratado como
 * pronto: "é em todas as telas — tem que ter na 2, 3, 4, 5, 6 também".
 *
 * POR QUE UM CONTEXTO E NÃO UMA CÓPIA POR PÁGINA: cada tela de fase teria que declarar
 * o estado, o item de menu e o modal — seis cópias que envelhecem em ritmos diferentes,
 * e a próxima tela nasceria sem a ficha de novo. Aqui o modal é montado UMA vez no
 * MainLayout e a coluna de Ações (compartilhada pelas 6 telas) chama `abrir(id)`.
 * Tela nova que usar `colunaAcoesFase` ganha a ficha sem lembrar de nada.
 *
 * Fallback: fora do provider, `abrir` é um no-op silencioso — uma tela solta não quebra.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { FichaPedido } from './FichaPedido';
import { AvisoNovidade } from '../AvisoNovidade/AvisoNovidade';
import { useAccess } from '../../access/AccessContext';

type Ctx = {
  abrir: (orderId: number) => void;
  disponivel: boolean;
  /** Incrementa quando a ficha muda a situação de um pedido. A tela que lista põe este
   *  número nas dependências do seu efeito de carga e recarrega sozinha.
   *  @R 17/09: "atualizar a página corretamente, para garantir que moveu o item para a
   *  fase" — a ficha se atualizava e a tabela atrás continuava com a fase antiga, então
   *  quem fechava a ficha concluía que não tinha funcionado. */
  versaoDados: number;
  /** Quem muda um pedido FORA da ficha (ex.: lápis do segredo na tabela, @R 23/09) chama isto para as
   *  telas que escutam versaoDados recarregarem. */
  avisarMudanca: () => void;
};

const FichaCtx = createContext<Ctx>({ abrir: () => {}, disponivel: false, versaoDados: 0, avisarMudanca: () => {} });

export function useFichaPedido() {
  return useContext(FichaCtx);
}

export function FichaPedidoProvider({ children }: { children: React.ReactNode }) {
  const [orderId, setOrderId] = useState<number | null>(null);
  const [versaoDados, setVersaoDados] = useState(0);
  const { profile } = useAccess();

  // Quem opera a fase pode corrigi-la (@R 16/09: "libere o voltar-fase para o Jurídico
  // também"). O backend valida de novo — esta linha só decide se o botão aparece.
  const podeVoltarFase =
    profile?.group === 'ADMIN' || profile?.group === 'GERENTE' || profile?.group === 'JURIDICO';

  const valor = useMemo<Ctx>(
    () => ({ abrir: (id: number) => setOrderId(id), disponivel: true, versaoDados,
             avisarMudanca: () => setVersaoDados((v) => v + 1) }),
    [versaoDados],
  );

  return (
    <FichaCtx.Provider value={valor}>
      <AvisoNovidade id="ficha-pedido" />
      {children}
      <FichaPedido
        orderId={orderId}
        aberto={orderId !== null}
        aoFechar={() => setOrderId(null)}
        podeVoltarFase={podeVoltarFase}
        aoMudarSituacao={() => setVersaoDados((v) => v + 1)}
      />
    </FichaCtx.Provider>
  );
}
