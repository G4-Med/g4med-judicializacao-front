/* O DOCUMENTO da proposta comercial (@R 21/09 19:31). O texto é o da proposta ao Hospital Santa Rita
   v2 (eliza-comercial, 21/09), com o que muda de cliente para cliente virando campo: nome, tipo
   (hospital ou médico), percentual e a BASE da cobrança — sobre o valor da oportunidade captada ou
   sobre o honorário médico, no sucesso. Mudança de TEXTO é da comercial: ela manda, aqui se copia. */

export interface Proposta {
  id?: number;
  cliente: string;
  tipoCliente: 'HOSPITAL' | 'MEDICO';
  percentual: number;
  base: 'VALOR_OPORTUNIDADE' | 'HONORARIO_MEDICO';
  contato?: string | null;
  observacoes?: string | null;
  validadeDias: number;
  criadoPor?: string | null;
  criadoEm?: string;
  atualizadoPor?: string | null;
  atualizadoEm?: string;
  pdfsGerados?: { por: string | null; em: string }[];
}

const pct = (n: number) => `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const dataLonga = (d: Date) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

function somarDiasUteis(d: Date, n: number): Date {
  const r = new Date(d);
  let faltam = n;
  while (faltam > 0) {
    r.setDate(r.getDate() + 1);
    if (r.getDay() !== 0 && r.getDay() !== 6) faltam -= 1;
  }
  return r;
}

export function PropostaDocumento({ p, data }: { p: Proposta; data?: Date }) {
  const hoje = data ?? new Date();
  const hospital = p.tipoCliente === 'HOSPITAL';
  const quem = p.cliente || (hospital ? 'o hospital' : 'o médico');
  const pagoPor = p.cliente ? `por ${p.cliente}` : (hospital ? 'pelo hospital' : 'pelo médico');
  const oHospital = hospital ? 'o hospital' : 'o médico';
  const validade = somarDiasUteis(hoje, p.validadeDias || 5);
  const remuneracao = p.base === 'HONORARIO_MEDICO'
    ? `${pct(p.percentual)} sobre o honorário médico da oportunidade contemplada, pago ${pagoPor}.`
    : `${pct(p.percentual)} da oportunidade contemplada — o valor total do orçamento (honorários, parte hospitalar e OPME), pago ${pagoPor}.`;

  return (
    <article className="proposta-doc">
      <header className="pd-capa">
        <div className="pd-marca">G<b>4</b>MED</div>
        <div className="pd-sub">Inteligência em Dados para a Saúde</div>
        <h1>Proposta de parceria</h1>
        <div className="pd-cliente">{p.cliente || '(nome do cliente)'}</div>
        <div className="pd-data">{dataLonga(hoje)}</div>
      </header>

      <section>
        <h2>Pedidos judiciais de cirurgia: {oHospital} responde, o Estado paga à vista.</h2>
        <p>
          A Secretaria de Estado de Saúde de Minas Gerais e prefeituras encaminham pedidos de orçamento de cirurgia
          por ordem judicial, com pagamento à vista antes do procedimento. O procedimento está autorizado, o paciente
          aguarda, e falta quem atenda. {hospital ? `${p.cliente || 'O hospital'} tem o corpo clínico` : `${p.cliente || 'O médico'} tem a especialidade`}; a
          G4MED é a ponte — leva o caso pronto e conduz até a conclusão. De {oHospital}, uma coisa: a cotação no prazo.
        </p>
        <p className="pd-destaque">Sem mensalidade · sem exclusividade · remuneração só no sucesso</p>
      </section>

      <section>
        <h2>1 · Quem precisa, e o que falta</h2>
        <p>
          A G4MED não controla essa demanda — ela chega. Somos a ponte entre quem precisa e quem pode atender.
          A entidade concede 5 dias e prioriza reunir três cotações. Quem responde dentro da janela disputa; quem
          responde depois, não. O que decide o caso raramente é o preço: é haver quem faça — e responder dentro da janela.
        </p>
      </section>

      <section>
        <h2>2 · Como funciona</h2>
        <p>Sem custo de implantação. Sem software a instalar. Os pedidos chegam e a resposta volta pelo grupo de WhatsApp — a condução na plataforma é nossa.</p>
        <ol>
          <li><b>Capta a oportunidade.</b> A G4MED capta os pedidos de cotação das entidades públicas.</li>
          <li><b>Disponibiliza com prazo.</b> A oportunidade chega com o prazo da entidade já em contagem.</li>
          <li><b>Aceite ou recusa.</b> Recusa é resposta válida e não afeta as próximas.</li>
          <li><b>Avaliação clínica.</b> Laudo, procedimento e códigos conferidos antes de qualquer valor.</li>
          <li><b>Cotação com dados de referência.</b> Dados de fontes públicas e da nossa base; o valor é de {oHospital}.</li>
          <li><b>Envio e acompanhamento.</b> Escritório de advocacia parceiro, sem custo, protocola; trilha de cada envio na plataforma.</li>
        </ol>
      </section>

      <section>
        <h2>3 · Responsabilidades</h2>
        <table className="pd-tabela">
          <thead><tr><th>Parte do orçamento</th><th>Quem cota</th><th>Quem recebe do Estado</th></tr></thead>
          <tbody>
            <tr><td>Honorário médico — cirurgião, anestesista, auxiliares</td><td>{hospital ? 'o médico do corpo clínico' : quem}</td><td>o médico</td></tr>
            <tr><td>Parte hospitalar — diárias, CTI, centro cirúrgico, taxas</td><td>{hospital ? quem : 'o hospital onde o procedimento é feito'}</td><td>o hospital</td></tr>
            <tr><td>OPME — órteses, próteses e materiais especiais</td><td>fornecedor indicado</td><td>o fornecedor</td></tr>
          </tbody>
        </table>
        <p>
          O orçamento é de {oHospital}: preço, responsabilidade civil da operação, obrigações tributárias e execução do
          procedimento. A G4MED responde pelo sistema e pela plataforma, assessora segundo boas práticas, organiza a
          coleta documental e devolve dados da participação. A G4MED não controla a demanda, não garante resultado e não
          realiza procedimento de qualquer natureza — se a cotação não for contemplada, ninguém paga nada a ninguém.
        </p>
      </section>

      <section>
        <h2>4 · Prazo inicial de 3 meses</h2>
        <p>
          A atuação tem prazo inicial de 3 meses, contados da data em que o primeiro pedido entra na plataforma. Ao fim,
          os dois lados analisam os dados: índice de resposta, taxas de sucesso e de não sucesso. Não há renovação
          automática — a continuação depende dessa análise e de nova proposta formalizada.
        </p>
      </section>

      <section className="pd-remuneracao">
        <h2>5 · Remuneração</h2>
        <p className="pd-fee"><b>Fee de sucesso:</b> {remuneracao}</p>
        <p>
          O fee é devido apenas quando a cotação é contemplada e a fonte pagadora deposita. Oportunidade que não se
          converte não gera cobrança de nenhuma natureza. A equipe administrativa solicita o pagamento em até 48 horas do
          recebimento e emite a nota fiscal de prestação de serviço de tecnologia e serviço complementar.
        </p>
        <p className="pd-destaque">Sem mensalidade. Sem adesão. Sem custo de plataforma. Sem exclusividade.</p>
      </section>

      <section>
        <h2>6 · Acesso e registro</h2>
        <p>
          {hospital ? 'O hospital' : 'O médico'} não instala nem aprende sistema nenhum: os pedidos chegam pelo WhatsApp e
          a resposta volta pelo WhatsApp. Os documentos de cada pedido vão num link seguro da G4MED, de acordo com a LGPD.
          A plataforma é https://plataforma.g4med.com.br/, onde cada alteração fica registrada com autor, data e valores.
        </p>
      </section>

      <section>
        <h2>7 · Quem somos</h2>
        <p>
          MedCheck Auditoria e Assessoria em Saúde Ltda, de Juiz de Fora. Opera judicialização em saúde junto à Secretaria
          de Estado de Saúde de Minas Gerais desde dezembro de 2024. Incubada no CRITT/UFJF. Três trabalhos apresentados
          no Unicorn Summit South America 2026.
        </p>
      </section>

      {p.observacoes && (
        <section>
          <h2>Observações</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{p.observacoes}</p>
        </section>
      )}

      <footer className="pd-rodape">
        Esta é uma proposta de parceria, de caráter não vinculante: condições e remuneração passam a obrigar as partes
        somente após a assinatura do termo de parceria. Validade: {p.validadeDias || 5} dias úteis a partir de{' '}
        {hoje.toLocaleDateString('pt-BR')} — até {validade.toLocaleDateString('pt-BR')}.
        {p.contato ? ` Contato: ${p.contato}.` : ''}
        <br />G4MED · MedCheck Auditoria e Assessoria em Saúde Ltda · CNPJ 24.400.266/0001-90
      </footer>
    </article>
  );
}
