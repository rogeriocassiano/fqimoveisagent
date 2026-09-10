# FQ Imóveis Agent

Fundação da plataforma de agentes de IA da FQ Imóveis.

## Recursos atuais

- Next.js e TypeScript com deploy standalone
- Integração server-side com Gemini
- Busca estruturada de imóveis no Supabase
- Schema multiempresa com pgvector e RLS
- Validação de assinatura do webhook oficial da Meta
- Health check para Railway

## Desenvolvimento

1. Instale as dependências com `npm install`.
2. Copie apenas os nomes de `.env.example` para `.env.local` e preencha os valores localmente.
3. Execute `npm run dev`.
4. Acesse `http://localhost:3000`.

Nunca envie ou faça commit de chaves. A chave Gemini anteriormente compartilhada deve permanecer revogada.

## Verificação

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Implantação

Crie um projeto Supabase, execute a migration em `supabase/migrations` e configure no serviço Railway as variáveis listadas em `.env.example`. O endpoint de saúde é `/api/health` e o webhook Meta é `/api/webhooks/whatsapp`.

Dados de preço e disponibilidade devem vir da tabela `properties`; conteúdo estável será indexado em `chunks` para RAG.
