/** Onde a pessoa liga e desliga os avisos do sistema (@R 18/09/2026).
 *
 *  POR QUE EXISTE: o aviso de novidade dizia "Pode reativar depois em Ajuda → Avisos" — e esse
 *  lugar NÃO EXISTIA. A frase prometia um destino que ninguém tinha construído; quem dispensasse
 *  um aviso perdia o acesso a ele para sempre, acreditando que podia voltar.
 *
 *  POR QUE A LISTA É DERIVADA, ¬escrita aqui: ela vem do mesmo objeto `NOVIDADES` que os avisos
 *  usam. Um aviso novo aparece nesta tela SOZINHO. Se a lista fosse escrita à mão aqui, seria
 *  preciso lembrar de cadastrar em dois lugares — e o segundo é o que se esquece.
 *
 *  Este é o lugar único das preferências opcionais: quando houver outra coisa que a pessoa possa
 *  ligar/desligar, entra aqui, não numa tela nova.
 */
import { useEffect, useState } from 'react';
import { InputSwitch } from 'primereact/inputswitch';
import { NOVIDADES, CHAVE_AVISOS, type NovidadeId } from '../AvisoNovidade/AvisoNovidade';
import { getPreferencia, salvarPreferencia } from '../../services/api/orders';

export function PreferenciasAvisos() {
  const [dispensados, setDispensados] = useState<string[] | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    getPreferencia(CHAVE_AVISOS)
      .then((r) => setDispensados(r.data?.valor?.ids ?? []))
      .catch(() => {
        setDispensados([]);
        setErro('Não consegui ler as suas preferências agora — o que você mudar aqui pode não ser guardado.');
      });
  }, []);

  const alternar = async (id: NovidadeId, ligado: boolean) => {
    const atual = dispensados ?? [];
    // ligado = a pessoa QUER ver o aviso ⇒ ele sai da lista de dispensados.
    const novos = ligado ? atual.filter((x) => x !== id) : Array.from(new Set([...atual, id]));
    setDispensados(novos); // resposta imediata: o switch não deve esperar a rede para reagir
    try {
      await salvarPreferencia(CHAVE_AVISOS, { ids: novos });
      setErro('');
    } catch {
      setDispensados(atual); // desfaz: mostrar ligado sem ter gravado seria mentir para quem clicou
      setErro('Não consegui guardar essa mudança. Tente de novo em instantes.');
    }
  };

  const ids = Object.keys(NOVIDADES) as NovidadeId[];

  return (
    <section className="mc-prefs">
      <p className="mc-prefs__intro">
        Avisos que o sistema mostra quando uma novidade aparece. Desligar não apaga a
        funcionalidade — só para de avisar.
      </p>
      {erro && <p className="mc-prefs__erro">{erro}</p>}
      {dispensados === null && <p>Carregando…</p>}
      {dispensados !== null &&
        ids.map((id) => {
          const ligado = !dispensados.includes(id);
          return (
            <div key={id} className="mc-prefs__linha">
              <InputSwitch checked={ligado} onChange={(e) => alternar(id, !!e.value)} />
              <div>
                <strong>{NOVIDADES[id].titulo}</strong>
                <p className="mc-prefs__texto">{NOVIDADES[id].texto}</p>
              </div>
            </div>
          );
        })}
    </section>
  );
}
