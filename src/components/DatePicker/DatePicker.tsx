import { useEffect, useMemo, useState } from 'react';
import { Calendar } from 'primereact/calendar';
import { Button } from 'primereact/button';
import './DatePicker.css';

type TipoPeriodo = 'anterior' | 'atual' | 'customizado';

export interface PeriodoSelecionado {
  tipo: TipoPeriodo;
  dataInicio: Date | null;
  dataFim: Date | null;
}

interface DatePickerPeriodoProps {
  value?: PeriodoSelecionado;
  onChange?: (periodo: PeriodoSelecionado) => void;
}

function getPrimeiroDiaMesAtual() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
}

function getUltimoDiaMesAtual() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
}

function getPrimeiroDiaMesAnterior() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
}

function getUltimoDiaMesAnterior() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 0);
}

function formatarDataExtensa(data: Date | null) {
  if (!data) return '';
  return data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function formatarPeriodo(dataInicio: Date | null, dataFim: Date | null) {
  if (!dataInicio || !dataFim) return 'Selecione um período';
  return `${formatarDataExtensa(dataInicio)} a ${formatarDataExtensa(dataFim)}`;
}

export function DatePickerPeriodo({ value, onChange }: DatePickerPeriodoProps) {
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoPeriodo>(
    value?.tipo ?? 'atual'
  );

  const [rangeCustomizado, setRangeCustomizado] = useState<(Date | null)[]>(
    value?.dataInicio && value?.dataFim
      ? [value.dataInicio, value.dataFim]
      : [getPrimeiroDiaMesAtual(), getUltimoDiaMesAtual()]
  );

  const [rangePendente, setRangePendente] = useState<(Date | null)[]>(rangeCustomizado);
  const [calendarioAberto, setCalendarioAberto] = useState(false);

  const periodoCalculado = useMemo<PeriodoSelecionado>(() => {
    if (tipoSelecionado === 'anterior') {
      return { tipo: 'anterior', dataInicio: getPrimeiroDiaMesAnterior(), dataFim: getUltimoDiaMesAnterior() };
    }
    if (tipoSelecionado === 'atual') {
      return { tipo: 'atual', dataInicio: getPrimeiroDiaMesAtual(), dataFim: getUltimoDiaMesAtual() };
    }
    return {
      tipo: 'customizado',
      dataInicio: rangeCustomizado[0] ?? null,
      dataFim: rangeCustomizado[1] ?? null
    };
  }, [tipoSelecionado, rangeCustomizado]);

  useEffect(() => {
    onChange?.(periodoCalculado);
  }, [periodoCalculado, onChange]);

  const handleAbrirCustomizado = () => {
    setTipoSelecionado('customizado');
    setRangePendente(rangeCustomizado);
    setCalendarioAberto(true);
  };

  const handleAplicar = () => {
    if (rangePendente[0] && rangePendente[1]) {
      setRangeCustomizado(rangePendente);
    }
    setCalendarioAberto(false);
  };

  const handleCancelar = () => {
    setRangePendente(rangeCustomizado);
    setCalendarioAberto(false);
  };

  const textoPeriodo = formatarPeriodo(periodoCalculado.dataInicio, periodoCalculado.dataFim);

  return (
    <div className="date-picker-periodo">
      <div className="periodo-tabs">
        <button
          type="button"
          className={tipoSelecionado === 'anterior' ? 'active' : ''}
          onClick={() => { setTipoSelecionado('anterior'); setCalendarioAberto(false); }}
        >
          Anterior
        </button>

        <button
          type="button"
          className={tipoSelecionado === 'atual' ? 'active' : ''}
          onClick={() => { setTipoSelecionado('atual'); setCalendarioAberto(false); }}
        >
          Atual
        </button>

        <button
          type="button"
          className={tipoSelecionado === 'customizado' ? 'active' : ''}
          onClick={handleAbrirCustomizado}
        >
          Customizado
        </button>
      </div>

      <div className="periodo-label">{textoPeriodo}</div>

      {tipoSelecionado === 'customizado' && calendarioAberto && (
        <div className="periodo-calendar-box">
          <Calendar
            value={rangePendente}
            onChange={(e) => setRangePendente((e.value as Date[]) || [])}
            selectionMode="range"
            inline
            numberOfMonths={2}
            readOnlyInput
          />

          <div className="calendario-acoes">
            <Button
              label="Cancelar"
              text
              severity="secondary"
              onClick={handleCancelar}
            />
            <Button
              label="Aplicar"
              onClick={handleAplicar}
              disabled={!rangePendente[0] || !rangePendente[1]}
            />
          </div>
        </div>
      )}
    </div>
  );
}