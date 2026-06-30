import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata = {
  title: "Política de Privacidade",
  description: "Como o AulaSync Pro acessa, utiliza, protege e elimina dados.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="Privacidade e proteção de dados"
      title="Política de Privacidade"
      description="Esta política explica de forma clara como o AulaSync Pro trata os dados necessários para conectar o Google Drive ao YouTube."
    >
      <section>
        <h2>1. Quem administra o AulaSync Pro</h2>
        <p className="mt-3">
          O AulaSync Pro é administrado pela F5 Soluções. Dúvidas, solicitações de acesso ou pedidos de exclusão podem ser enviados para{" "}
          <a href="mailto:f5solucoes567@gmail.com">f5solucoes567@gmail.com</a>.
        </p>
      </section>

      <section>
        <h2>2. Dados que acessamos</h2>
        <p className="mt-3">Mediante autorização expressa do usuário, o sistema pode acessar:</p>
        <ul className="mt-3">
          <li>nome, endereço de e-mail e imagem da Conta Google;</li>
          <li>identificação das contas do Google Drive e dos canais do YouTube conectados;</li>
          <li>nomes, identificadores, estrutura de pastas, tipo e tamanho dos arquivos do Drive;</li>
          <li>conteúdo dos vídeos escolhidos pelo usuário para envio ao YouTube;</li>
          <li>playlists, canais e vídeos necessários para executar e acompanhar o envio;</li>
          <li>registros técnicos, progresso, erros e resultados das tarefas de upload.</li>
        </ul>
        <p className="mt-3">
          O AulaSync não lê arquivos que não sejam necessários para as pastas e aulas selecionadas pelo usuário.
        </p>
      </section>

      <section>
        <h2>3. Como utilizamos os dados</h2>
        <p className="mt-3">Os dados são utilizados exclusivamente para:</p>
        <ul className="mt-3">
          <li>listar pastas e localizar aulas em vídeo no Drive;</li>
          <li>criar ou selecionar playlists no canal indicado;</li>
          <li>transferir os vídeos selecionados do Drive para o YouTube;</li>
          <li>retomar uploads interrompidos, impedir duplicidades e exibir relatórios;</li>
          <li>proteger a conta, diagnosticar falhas e manter o funcionamento do serviço.</li>
        </ul>
        <p className="mt-3">
          Não vendemos dados, não criamos perfis publicitários e não utilizamos dados do Google para anúncios, concessão de crédito ou vigilância.
        </p>
      </section>

      <section>
        <h2>4. Transferência entre Google Drive e YouTube</h2>
        <p className="mt-3">
          Quando o usuário inicia uma tarefa, o vídeo escolhido é transmitido do Google Drive para o canal do YouTube selecionado. Essa transferência ocorre somente para executar uma ação visível e solicitada pelo próprio usuário. O arquivo não é armazenado permanentemente pelo AulaSync em uma pasta intermediária.
        </p>
      </section>

      <section>
        <h2>5. Armazenamento e segurança</h2>
        <p className="mt-3">
          Tokens OAuth e endereços de sessões de upload retomável são mantidos apenas no servidor e criptografados com AES-256-GCM. Cookies de autenticação são essenciais, protegidos e inacessíveis a scripts do navegador. O sistema aplica controle de acesso, validação de entradas e ocultação de segredos nos logs.
        </p>
      </section>

      <section>
        <h2>6. Compartilhamento</h2>
        <p className="mt-3">
          Os dados são compartilhados somente com as APIs do Google Drive e do YouTube para fornecer as funções solicitadas. Não compartilhamos dados com anunciantes, corretores de dados ou terceiros para finalidades independentes. Poderemos tratar informações quando necessário para segurança ou cumprimento de obrigação legal.
        </p>
      </section>

      <section>
        <h2>7. Retenção e exclusão</h2>
        <p className="mt-3">
          Tokens permanecem armazenados enquanto a conta estiver conectada. Ao desconectar uma conta no AulaSync, a autorização é revogada quando possível e os tokens locais são apagados. Metadados de tarefas e relatórios podem permanecer para histórico operacional até que sua exclusão seja solicitada. “Remover do histórico” apenas oculta o registro e não apaga arquivos do Drive nem vídeos do YouTube.
        </p>
        <p className="mt-3">
          Para solicitar a exclusão definitiva dos registros associados, envie uma mensagem para{" "}
          <a href="mailto:f5solucoes567@gmail.com">f5solucoes567@gmail.com</a>. O usuário também pode revogar o acesso diretamente nas configurações de segurança da Conta Google.
        </p>
      </section>

      <section>
        <h2>8. Direitos e escolhas do usuário</h2>
        <p className="mt-3">
          O usuário pode solicitar informações, correção ou exclusão dos dados sob controle do AulaSync, além de desconectar contas a qualquer momento. Vídeos e playlists já criados no YouTube devem ser administrados diretamente pelo usuário no YouTube.
        </p>
      </section>

      <section>
        <h2>9. Uso das APIs do Google</h2>
        <p className="mt-3">
          O uso e a transferência de informações recebidas das APIs do Google seguem a{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , inclusive os requisitos de uso limitado. Solicitamos somente as permissões necessárias às funções apresentadas no sistema.
        </p>
      </section>

      <section>
        <h2>10. Crianças e adolescentes</h2>
        <p className="mt-3">
          O AulaSync é uma ferramenta profissional de administração de cursos e não é direcionado a crianças menores de 13 anos.
        </p>
      </section>

      <section>
        <h2>11. Alterações desta política</h2>
        <p className="mt-3">
          Esta política poderá ser atualizada para refletir mudanças legais, técnicas ou funcionais. A data da versão mais recente permanecerá visível nesta página.
        </p>
      </section>

      <section className="rounded-2xl bg-brand-50 p-5">
        <h2>Contato</h2>
        <p className="mt-2">
          E-mail: <a href="mailto:f5solucoes567@gmail.com">f5solucoes567@gmail.com</a>
        </p>
        <p className="mt-1">
          Consulte também os <Link href="/termos-de-uso">Termos de Uso</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
