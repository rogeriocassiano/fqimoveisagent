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

## Testes end-to-end

- `npm run e2e` — suíte E2E contra banco Supabase e Gemini reais (treinar fonte, conversar com contexto, resolver imóvel, gerar flyer, enviar PDF existente, webhook HTTP). Requer `.env` e, para os testes HTTP, o dev server em `localhost:3000`.
- `npm run wa:sim` — simulador de WhatsApp no terminal que age como o wa-server (sem QR): envie mensagens como se fosse um grupo e veja o agente responder com texto, fotos e PDFs (baixados em `wa-sim-media/`). Ex.: `npm run wa:sim -- --message "manda as fotos do ref 123"`. Usa a variável `WA_SERVICE_SECRET` do `.env`.
- `npm run sync:flyers` — sincroniza os PDFs/flyers da pasta pública do Google Drive (`FLYERS_DRIVE_FOLDER_ID` no `.env`) para a tabela `sources`, com título = empreendimento + arquivo e link direto de download. Rode novamente após atualizar a pasta. O agente envia esses PDFs no WhatsApp pelo nome (ex: "manda o PDF do Place Caçara").

## Implantação

Crie um projeto Supabase, execute a migration em `supabase/migrations` e configure no serviço Railway as variáveis listadas em `.env.example`. O endpoint de saúde é `/api/health` e o webhook Meta é `/api/webhooks/whatsapp`.

Dados de preço e disponibilidade devem vir da tabela `properties`; conteúdo estável será indexado em `chunks` para RAG.
