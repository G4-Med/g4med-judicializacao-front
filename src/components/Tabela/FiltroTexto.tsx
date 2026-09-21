import { useEffect, useRef, useState } from 'react';
import { InputText } from 'primereact/inputtext';
import type { InputTextProps } from 'primereact/inputtext';

type Opcoes = { value?: unknown; filterApplyCallback: (v?: unknown) => void };

/** Filtro de texto de coluna que NÃO refiltra a tabela a cada tecla.
 *
 *  POR QUE EXISTE (@R 21/09/2026: "uma vez carregada os filtros não operam"): 16 telas chamavam
 *  `filterApplyCallback` no onChange. Cada tecla refiltrava a tabela inteira e ainda disparava um 2º render
 *  (KPIs recalculados sobre as linhas visíveis) — digitar "joao" custava 8 renders de 50 linhas pesadas, e o
 *  campo engasgava. Aqui o texto vive no próprio campo (resposta imediata ao dedo) e a tabela é refiltrada
 *  UMA vez, 300 ms depois da última tecla — ou na hora, com Enter. Nada vai ao servidor: filtra o que já carregou. */
export function FiltroTexto({ options, ...resto }: { options: Opcoes } & Omit<InputTextProps, 'value' | 'onChange'>) {
  const externo = String(options.value ?? '');
  const [texto, setTexto] = useState(externo);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aplicar = useRef(options.filterApplyCallback);
  aplicar.current = options.filterApplyCallback;

  // "Limpar filtros" (ou outro controle) mudou o valor por fora → o campo acompanha
  useEffect(() => { setTexto(externo); }, [externo]);
  useEffect(() => () => { if (relogio.current) clearTimeout(relogio.current); }, []);

  const agendar = (v: string, espera: number) => {
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => aplicar.current(v), espera);
  };

  return (
    <InputText {...resto} value={texto}
      onChange={(e) => { setTexto(e.target.value); agendar(e.target.value, 300); }}
      onKeyDown={(e) => { if (e.key === 'Enter') agendar((e.target as HTMLInputElement).value, 0); resto.onKeyDown?.(e); }} />
  );
}
