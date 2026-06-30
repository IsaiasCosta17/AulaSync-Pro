# Publicar AulaSync Pro na Hostinger VPS

## Arquivo para upload

Envie o arquivo aulasync-pro-hostinger-vps.zip ao diretório do domínio e extraia seu conteúdo. O ZIP não contém .env, senhas, tokens, banco local, node_modules, .next ou logs.

## Requisitos

- VPS Hostinger com Ubuntu e acesso SSH
- Node.js 20 ou 22
- domínio apontado para o VPS
- HTTPS/SSL ativo
- PM2 instalado globalmente

## Instalação

No diretório extraído:

~~~bash
corepack enable
pnpm install --frozen-lockfile
cp .env.production.example .env
~~~

Edite .env e substitua todos os valores de exemplo. Depois:

~~~bash
pnpm run db:push
pnpm run db:seed
pnpm run build
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
~~~

Execute o comando adicional mostrado por pm2 startup para habilitar a inicialização automática no Linux.

## Proxy e SSL

Configure o domínio no CloudPanel, aponte o proxy para http://127.0.0.1:3000 e emita um certificado Let's Encrypt.

## Google Cloud

No cliente OAuth, substitua localhost por:

- https://SEU-DOMINIO.com/api/oauth/google/drive/callback
- https://SEU-DOMINIO.com/api/oauth/google/youtube/callback

No Branding use:

- Página inicial: https://SEU-DOMINIO.com/sobre
- Política: https://SEU-DOMINIO.com/politica-de-privacidade
- Termos: https://SEU-DOMINIO.com/termos-de-uso
- Domínio autorizado: SEU-DOMINIO.com

Verifique o domínio no Google Search Console antes de solicitar a verificação OAuth.

## Segurança

Não envie o .env local nem prisma/dev.db. Conecte novamente as contas Google no domínio de produção. Guarde cópias seguras de AUTH_SECRET, TOKEN_ENCRYPTION_KEY e do banco prisma/production.db.

## Atualizações

Substitua os arquivos de código e execute:

~~~bash
pnpm install --frozen-lockfile
pnpm run db:push
pnpm run build
pm2 restart ecosystem.config.cjs
~~~

## Verificação

~~~bash
pm2 status
pm2 logs aulasync-web
pm2 logs aulasync-worker
~~~

O site e o worker precisam aparecer como online.


## Gestão de usuários

Depois da primeira inicialização, entre com o administrador definido no arquivo `.env` e abra **Administração > Usuários**. Os demais acessos são criados manualmente por essa tela. Não compartilhe a senha do administrador.


## Isolamento multiusuário

Na primeira inicialização desta versão, as conexões e tarefas já existentes são vinculadas ao administrador inicial. Cada usuário criado depois começa com um espaço vazio e conecta suas próprias contas Google. Execute sempre `pnpm run deploy:setup` ao atualizar para aplicar a estrutura do banco.


## Três perfis

Após entrar como administrador, cadastre operadores para a gestão de acessos e clientes para uso operacional. Clientes começam sem conexões ou histórico. Operadores não têm acesso aos dados Drive, YouTube, cursos ou uploads dos clientes.
