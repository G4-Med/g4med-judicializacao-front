import { getStatusTagStyle } from '../../utils/statusTag';

interface RelatorioPedidoCardProps {
  index: number;
  paciente: string;
  status: string;
  idade: string;
  procedimento: string;
  valorG4Med: string;
  orcamentosApresentados: string;
  processo: string;
  observacao: string;
}

function hexToRgba(hex: string, alpha: number) {
  const sanitized = hex.replace('#', '');
  if (sanitized.length !== 6) return `rgba(100, 116, 139, ${alpha})`;

  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function RelatorioPedidoCard({
  index,
  paciente,
  status,
  idade,
  procedimento,
  valorG4Med,
  orcamentosApresentados,
  processo,
  observacao,
}: RelatorioPedidoCardProps) {
  const statusStyle = getStatusTagStyle(status);

  return (
    <article
      className="relatorio-consolidado-pedido"
      style={{
        borderColor: statusStyle.borderColor,
        background: hexToRgba(statusStyle.backgroundColor, 0.08),
      }}
    >
      <div className="relatorio-consolidado-pedido__header">
        <strong>{index}. {paciente}</strong>
        <span
          className="relatorio-consolidado-pedido__status"
          style={{
            backgroundColor: statusStyle.backgroundColor,
            color: statusStyle.color,
            borderColor: statusStyle.borderColor,
          }}
        >
          {status}
        </span>
      </div>

      <div className="relatorio-consolidado-pedido__content">
        <p><strong>Idade:</strong> {idade} | <strong>Procedimento:</strong> {procedimento}</p>
        <p><strong>Valor G4Med:</strong> {valorG4Med}</p>
        <p><strong>Orçamentos apresentados:</strong> {orcamentosApresentados}</p>
        <p><strong>Processo:</strong> {processo}</p>
        <p><strong>Observação:</strong> {observacao}</p>
      </div>
    </article>
  );
}
