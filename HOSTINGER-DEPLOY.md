# Implantação limpa na Hostinger

## 1. Criar o aplicativo

1. No hPanel, abra **Sites > Adicionar site > Node.js Web App**.
2. Escolha **Importar repositório GitHub**.
3. Selecione `IsaiasCosta17/AulaSync-Pro` e a branch `main`.
4. Deixe o diretório raiz vazio ou use `.`.
5. Confirme o framework **Next.js** e Node.js **20.x**.
6. Use `pnpm build` para construir e `pnpm start` para iniciar.
7. Não crie a variável `PORT`: a Hostinger fornece a porta automaticamente.

## 2. Variáveis obrigatórias

Cadastre em **Configurações > Variáveis de ambiente**:

- `DATABASE_URL`
- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `AUTH_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI_DRIVE`
- `GOOGLE_REDIRECT_URI_YOUTUBE`
- `NEXT_PUBLIC_APP_URL`

Use o arquivo `.env.example` como referência, mas nunca envie os valores reais ao GitHub.

Para Supabase na Hostinger, copie **Connect > Session pooler**, porta **5432**. A senha precisa estar codificada para URL quando contiver caracteres especiais.

Não troque `TOKEN_ENCRYPTION_KEY` depois que contas Google forem conectadas, pois ela protege os tokens armazenados.

## 3. Construção

A construção valida as variáveis antes de executar Prisma. Em seguida:

1. gera o Prisma Client;
2. cria/atualiza as tabelas;
3. cria ou atualiza o administrador;
4. compila o Next.js.

O log bem-sucedido deve conter:

- `Variáveis obrigatórias de produção verificadas com sucesso.`
- `Your database is now in sync with your Prisma schema.`
- `Administrador criado:`
- `Compiled successfully`

Se a validação parar a construção, corrija somente as variáveis indicadas e reimplante.

## 4. Verificação

Depois de a implantação aparecer como **Concluída**, abra:

- `https://universosmixcursos.com/api/health`

Resultado saudável:

```json
{"status":"ok","application":"AulaSync Pro","database":"connected"}
```

- Se o domínio inteiro mostrar 503, confirme o commit implantado e o comando `pnpm start`.
- Se a rota responder com `database: "unavailable"`, revise `DATABASE_URL`.
- Se a rota estiver saudável e o login falhar, confira `ADMIN_EMAIL` e `ADMIN_PASSWORD`, sem aspas ou espaços extras.
