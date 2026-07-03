# AulaSync Pro

O AulaSync Pro conecta contas Google Drive a canais YouTube, organiza cursos por pastas, cria ou reutiliza playlists e envia aulas com upload resumable. O sistema não impõe limite interno de aulas por tarefa; os limites oficiais do Google e do canal continuam válidos.

## Recursos atuais

- Login administrativo e proteção de páginas e APIs.
- OAuth separado para Drive e YouTube, com suporte a várias contas e canais.
- Refresh tokens e sessões resumable criptografados com AES-256-GCM.
- Navegação de pastas, leitura recursiva de módulos e filtro de MP4, MOV, AVI, MKV e WEBM.
- Todas as aulas encontradas ficam selecionadas inicialmente.
- Ordenação natural por número da aula, revisão de títulos, prefixo Aula 01 e correção automática de títulos duplicados.
- Playlist nova ou playlist já existente no canal.
- Privacidade pública, privada ou não listada.
- Upload resumable em blocos, retomando do byte confirmado pelo YouTube.
- Concorrência configurável de 1 a 10 uploads por canal, padrão 3.
- Quantidade ilimitada de contas e canais conectados, com filas independentes entre canais.
- Redução automática da concorrência após erros temporários e restauração gradual.
- Nova tentativa automática com backoff para erros 408, 429, 5xx e falhas de rede.
- Limite diário de upload do canal: somente esse canal pausa por 24 horas e depois retoma automaticamente.
- Quota diária do projeto Google Cloud: pausa por 24 horas; por ser uma quota oficial compartilhada do projeto, pode afetar todos os canais que usam o mesmo cliente OAuth.
- Recuperação de tarefas pendentes depois que o aplicativo reinicia.
- Verificação de arquivo, formato, tamanho, conta, canal, playlist e duplicidade antes do envio.
- Pausar, continuar, cancelar e reenviar apenas aulas com erro.
- Progresso geral e individual, velocidade média, tempo estimado, notificação e logs por aula.
- Pesquisa global por cursos, aulas, contas Drive e canais YouTube.
- Central de notificações com contador de não lidas, atualização automática e acesso à tarefa.
- Menu do administrador e indicador lateral alimentados por dados reais.
- Histórico removível sem apagar nada no Drive ou no YouTube, com aba Removidos e restauração.
- Relatórios filtráveis e exportação CSV e Excel/XLSX.
- Configurações de cada usuário persistidas no PostgreSQL.

## Início rápido no Windows

Use o arquivo ABRIR-AULASYNC.cmd. Quando existir uma atualização, ele atualiza o banco, compila a nova versão e só então inicia o sistema. Mantenha a janela aberta durante o uso.

Para instalação manual:

~~~bash
npm install
npm run db:push
npm run db:seed
npm run dev
~~~

Abra http://localhost:3000 e entre com o administrador definido no arquivo .env.

## Configuração do Google Cloud

1. Crie ou selecione um projeto em https://console.cloud.google.com/.
2. Ative Google Drive API e YouTube Data API v3.
3. Em Google Auth Platform, configure a tela de consentimento.
4. Enquanto o app estiver em modo de teste, inclua cada e-mail em Test users. O limite de usuários do modo de teste é imposto pelo Google, não pelo AulaSync.
5. Adicione os escopos openid, email, profile, drive.readonly, youtube e youtube.upload.
6. Crie um cliente OAuth do tipo Web application.
7. Cadastre os redirecionamentos:
   - http://localhost:3000/api/oauth/google/drive/callback
   - http://localhost:3000/api/oauth/google/youtube/callback
8. Copie Client ID e Client Secret para o arquivo .env.

Em produção, use domínio HTTPS, troque as URLs de callback e conclua a verificação OAuth exigida pelo Google para os escopos do YouTube.

## Supabase em produção

Use a URI PostgreSQL fornecida pelo Supabase em `DATABASE_URL`. A variável deve existir tanto na fase de construção quanto na execução da aplicação. Não publique essa URI no GitHub. Em hospedagens sem IPv6, prefira o endereço do pooler em modo Session indicado pelo Supabase.

## Variáveis de ambiente

| Variável | Finalidade |
|---|---|
| DATABASE_URL | Conexão PostgreSQL persistente, por exemplo Supabase |
| ADMIN_NAME | Nome do administrador inicial |
| ADMIN_EMAIL | E-mail de login |
| ADMIN_PASSWORD | Senha inicial ou nova senha administrativa |
| AUTH_SECRET | Assinatura de sessão e estado OAuth |
| TOKEN_ENCRYPTION_KEY | Chave Base64 de 32 bytes para criptografar tokens |
| GOOGLE_CLIENT_ID | Cliente OAuth do Google |
| GOOGLE_CLIENT_SECRET | Segredo OAuth do Google |
| GOOGLE_REDIRECT_URI_DRIVE | Callback do Drive |
| GOOGLE_REDIRECT_URI_YOUTUBE | Callback do YouTube |
| UPLOAD_CHUNK_SIZE_MB | Tamanho dos blocos do resumable; padrão 8 MB |
| UPLOAD_MAX_RETRIES | Tentativas por bloco; padrão 8 |
| UPLOAD_REQUEST_TIMEOUT_MS | Timeout de cada solicitação; padrão 120000 ms |
| NEXT_PUBLIC_APP_URL | URL pública do sistema |

A concorrência das aulas e os tempos de nova tentativa são definidos em Configurações, não no .env. Não existe teto global de contas ou canais em processamento.

Nunca publique o arquivo .env nem troque TOKEN_ENCRYPTION_KEY depois de conectar contas, pois os tokens existentes dependem dessa chave.

## Página Configurações

Em /settings o administrador pode definir:

- uploads simultâneos entre 1 e 10;
- espera para erros temporários;
- retomada automática após 24 horas quando o YouTube informar limite diário;
- privacidade, descrição e tags padrão;
- ID opcional de uma miniatura JPG ou PNG no Drive, até 2 MB;
- verificação de duplicados;
- redução automática de concorrência.

Alterações são salvas no banco e aplicadas às operações seguintes. O valor recomendado de concorrência é 3. Usar 10 exige conexão estável e pode aumentar a chance de limitação temporária pelo Google; a proteção adaptativa reduz automaticamente o número quando necessário.

## Fluxo de upload

1. Conecte a conta em Contas > Google Drive.
2. Conecte o canal em Contas > Canais YouTube.
3. Em Cursos, selecione a pasta principal.
4. Em Novo upload, revise todos os títulos e, se desejar, aplique o prefixo Aula 01.
5. Escolha uma playlist existente ou informe o nome da nova playlist.
6. Defina a privacidade e inicie.
7. Acompanhe em Uploads ou abra Detalhes para ver cada aula e os logs.

Nenhuma quantidade máxima de aulas é aplicada à tarefa. A concorrência define apenas quantas aulas são transmitidas ao mesmo tempo.

Cada canal possui sua própria fila, concorrência adaptativa e estado de quota. Uma redução de velocidade ou limite diário em um canal não ocupa nem reduz as vagas dos demais canais.

## Retomada e prevenção de duplicados

A URI da sessão resumable é criptografada e salva por aula. Depois de timeout, pausa ou reinício, o AulaSync consulta o byte confirmado pelo YouTube e continua dali. Progresso é gravado continuamente no banco.

Antes do upload, o sistema confirma que o arquivo existe, não está na lixeira, tem tamanho válido e possui extensão aceita. Também valida a conta, o canal e a playlist. Se uma playlist vinculada tiver sido excluída, uma nova é criada com o mesmo nome.

Com a verificação de duplicados ativa, o mesmo arquivo do mesmo Drive não é enviado novamente ao mesmo canal: o vídeo já existente é reutilizado e somente a associação à playlist é verificada.

Somente erros reais de autorização pausam a tarefa para reconexão. Erros temporários são retomados automaticamente. Erros permanentes ficam visíveis para correção e uso do botão Reenviar apenas erros.

## Histórico e relatórios

Remover do histórico oculta apenas o registro visual. O vídeo no YouTube, a playlist e o arquivo no Drive permanecem intactos. Use a aba Removidos para restaurar.

Os relatórios podem ser filtrados por canal, curso, aula e status. CSV é gerado com proteção contra fórmulas maliciosas. XLSX inclui cabeçalho formatado, filtros, primeira linha congelada, datas e percentuais tipados, status coloridos e links clicáveis.

## Banco de dados

A produção usa PostgreSQL e Prisma. A implantação executa db:push antes da compilação para criar ou atualizar as tabelas. As tabelas principais são User, GoogleDriveAccount, YoutubeChannel, DriveFolder, UploadJob, UploadItem, Playlist, Log, AppSettings e HiddenUploadJob.

AppSettings armazena as configurações globais. HiddenUploadJob implementa a remoção reversível do histórico. Para vários servidores de upload, recomenda-se também uma fila durável como BullMQ/Redis ou Cloud Tasks.

## Segurança

- Tokens nunca são enviados ao frontend.
- Refresh tokens e URIs resumable ficam criptografados no servidor.
- Cookies usam httpOnly, SameSite=Lax e Secure em produção.
- Mensagens e logs ocultam tokens, segredos, cabeçalhos Bearer e URLs privadas de sessão.
- Cancelamento e remoção de histórico exigem confirmação.
- Entradas são validadas com Zod.
- Use HTTPS, backup do banco e um cofre de segredos em produção.

## Verificação recomendada

Depois de atualizar, faça uma tarefa pequena com 3 a 5 vídeos sem importância:

1. confira se todos aparecem selecionados;
2. escolha concorrência 3;
3. pause e continue durante uma aula;
4. feche e reabra o app para confirmar a retomada;
5. repita a mesma pasta no mesmo canal e confirme a reutilização;
6. exporte CSV e XLSX;
7. remova a tarefa do histórico e restaure-a.

Esse teste usa uploads reais e consome quota do YouTube.

## Uploads em segundo plano

O arquivo ABRIR-AULASYNC.cmd inicia também um motor independente e invisível de uploads. Depois que ele estiver ativo, fechar o navegador ou a janela principal do AulaSync não interrompe os envios. O computador precisa permanecer ligado, sem suspensão, e conectado à internet.

O worker consulta tarefas pendentes a cada cinco segundos, mantém as sessões resumable e usa um lease no PostgreSQL para impedir que a interface e o processo de fundo executem a mesma tarefa. Se o processo for interrompido, o lease expira e outro worker pode retomar a tarefa com segurança. Logs operacionais ficam na pasta .runtime e não incluem tokens.

O worker é iniciado ao abrir o AulaSync. Depois de reiniciar o Windows, execute ABRIR-AULASYNC.cmd novamente para reativá-lo.


## Gestão de usuários

A área **Administração > Usuários** permite ao administrador criar acessos manualmente, pesquisar usuários, escolher a função, bloquear/reativar contas, editar dados, redefinir senhas e excluir acessos.

- **Administrador:** possui acesso total ao sistema, incluindo operações e gestão de usuários.
- **Operador:** gerencia clientes e outros operadores, sem acessar os dados operacionais deles e sem poder alterar administradores.
- **Cliente:** possui seu ambiente privado de Drive, YouTube, cursos, uploads, relatórios, notificações, histórico e configurações.
- Todo usuário novo recebe uma senha temporária e deve criar uma nova senha no primeiro acesso.
- Bloquear, alterar a função ou redefinir a senha invalida as sessões anteriores do usuário.
- O sistema impede que o último administrador ativo seja bloqueado, rebaixado ou excluído.

O usuário inicial continua sendo configurado pelas variáveis `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Para redefinir a senha do administrador, mantenha o mesmo `ADMIN_EMAIL`, altere `ADMIN_PASSWORD` na hospedagem e publique novamente. A senha configurada é sincronizada na primeira inicialização de cada publicação. Nenhuma senha deve ser gravada no GitHub. Após publicar uma atualização, entre novamente para que a sessão receba as novas permissões.


## Isolamento entre usuários

Cada usuário possui um espaço operacional totalmente separado. Contas Google Drive, canais YouTube, cursos, playlists registradas, tarefas, aulas, relatórios, histórico removido, notificações e configurações pertencem ao usuário que os criou.

- O administrador gerencia os cadastros de acesso, mas não recebe automaticamente acesso aos dados operacionais dos demais usuários.
- Um usuário novo começa sem contas Google conectadas, sem canais, cursos, uploads ou relatórios.
- Todas as consultas e ações da API validam o proprietário do recurso; alterar manualmente um endereço ou identificador não permite acessar dados de outro usuário.
- Durante a atualização, os dados já existentes são atribuídos ao administrador inicial definido por `ADMIN_EMAIL`.


## Perfis de acesso

O AulaSync Pro possui três perfis: Administrador, Operador e Cliente. O administrador tem acesso total. O operador trabalha exclusivamente na gestão de usuários e não pode criar, alterar, bloquear ou excluir administradores. O cliente utiliza as funcionalidades operacionais em um ambiente isolado.
