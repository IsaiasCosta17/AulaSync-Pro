import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata = {
  title: "Termos de Uso",
  description: "Condições para utilização do AulaSync Pro.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Condições do serviço"
      title="Termos de Uso"
      description="Ao utilizar o AulaSync Pro, você concorda com as condições abaixo para conexão de contas, organização e envio de aulas."
    >
      <section>
        <h2>1. Aceitação</h2>
        <p className="mt-3">
          Estes Termos regulam o uso do AulaSync Pro, administrado pela F5 Soluções. Ao acessar o sistema ou conectar uma Conta Google, o usuário declara que leu e concorda com estes Termos e com a Política de Privacidade.
        </p>
      </section>

      <section>
        <h2>2. Finalidade do serviço</h2>
        <p className="mt-3">
          O AulaSync organiza vídeos armazenados no Google Drive, cria ou reutiliza playlists e envia os arquivos escolhidos para canais do YouTube autorizados pelo usuário. O sistema também registra progresso, resultados e erros operacionais.
        </p>
      </section>

      <section>
        <h2>3. Conta e autorizações</h2>
        <ul className="mt-3">
          <li>o usuário deve proteger suas credenciais administrativas;</li>
          <li>somente contas e canais que o usuário esteja autorizado a administrar podem ser conectados;</li>
          <li>as permissões Google podem ser revogadas a qualquer momento;</li>
          <li>o usuário é responsável por manter os dados de contato e as autorizações atualizados.</li>
        </ul>
      </section>

      <section>
        <h2>4. Conteúdo e direitos</h2>
        <p className="mt-3">
          O usuário mantém seus direitos sobre arquivos, vídeos, títulos, descrições e miniaturas. Ao iniciar um envio, autoriza o processamento técnico necessário entre Drive e YouTube. O usuário garante que possui os direitos e permissões necessários sobre todo conteúdo enviado.
        </p>
      </section>

      <section>
        <h2>5. Uso aceitável</h2>
        <p className="mt-3">É proibido utilizar o AulaSync para:</p>
        <ul className="mt-3">
          <li>violar direitos autorais, privacidade ou outras normas aplicáveis;</li>
          <li>acessar contas, arquivos ou canais sem autorização;</li>
          <li>distribuir conteúdo ilegal, malicioso, enganoso ou abusivo;</li>
          <li>contornar limites, segurança ou políticas do Google e do YouTube;</li>
          <li>interferir no funcionamento ou tentar obter segredos e tokens do sistema.</li>
        </ul>
      </section>

      <section>
        <h2>6. Quotas e serviços de terceiros</h2>
        <p className="mt-3">
          Google Drive, YouTube e Google Cloud são serviços independentes e aplicam suas próprias políticas, quotas e limites. O AulaSync preserva tarefas e tenta retomá-las quando possível, mas não controla indisponibilidades, recusas, revisões, bloqueios ou mudanças realizadas por esses serviços.
        </p>
      </section>

      <section>
        <h2>7. Disponibilidade e uploads</h2>
        <p className="mt-3">
          Empregamos upload retomável, novas tentativas automáticas e gravação de progresso para melhorar a confiabilidade. Ainda assim, não é possível garantir operação ininterrupta ou sucesso quando houver falhas externas, arquivos inválidos, perda de autorização, limites de canal ou quota oficial.
        </p>
      </section>

      <section>
        <h2>8. Cancelamento e histórico</h2>
        <p className="mt-3">
          Pausar ou cancelar uma tarefa não remove automaticamente vídeos já enviados. Remover uma tarefa do histórico apenas oculta seu registro no AulaSync. A exclusão de vídeos, playlists e arquivos deve ser realizada pelo usuário nos respectivos serviços.
        </p>
      </section>

      <section>
        <h2>9. Privacidade</h2>
        <p className="mt-3">
          O tratamento dos dados é descrito na <Link href="/politica-de-privacidade">Política de Privacidade</Link>, que integra estes Termos.
        </p>
      </section>

      <section>
        <h2>10. Suspensão</h2>
        <p className="mt-3">
          O acesso poderá ser suspenso para proteger contas e dados, investigar uso indevido, cumprir obrigação legal ou impedir violação destes Termos e das políticas do Google.
        </p>
      </section>

      <section>
        <h2>11. Responsabilidade</h2>
        <p className="mt-3">
          O usuário é responsável por revisar títulos, playlists, privacidade e canal antes do envio. Na extensão permitida pela legislação aplicável, a F5 Soluções não responde por perda causada por serviços de terceiros, uso não autorizado, conteúdo do usuário ou descumprimento de políticas externas.
        </p>
      </section>

      <section>
        <h2>12. Alterações</h2>
        <p className="mt-3">
          Estes Termos podem ser atualizados quando o serviço, a legislação ou as políticas dos provedores forem alterados. A versão vigente e sua data permanecerão disponíveis nesta página.
        </p>
      </section>

      <section className="rounded-2xl bg-brand-50 p-5">
        <h2>Contato</h2>
        <p className="mt-2">
          Dúvidas sobre estes Termos: <a href="mailto:f5solucoes567@gmail.com">f5solucoes567@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
