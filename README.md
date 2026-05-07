# Reconstrucao do Quiz Mounjaro Bariatrico

Projeto vanilla HTML/CSS/JS que reconstrói o funil XQuiz/InLead da referência autorizada.

## Arquivos

- `index.html`: página única da SPA.
- `style.css`: estilos mobile-first, tema, cards, botões, progresso e animações.
- `script.js`: renderização dinâmica, respostas, avanço, loading e redirecionamento.
- `quiz-data.json`: estrutura central do quiz.
- `quiz-data.js`: espelho do JSON para permitir abrir `index.html` direto sem servidor.
- `assets/`: imagens usadas na reconstrução.
- `supabase-config.js`: credenciais públicas do projeto Supabase.
- `supabase-tracking.js`: coleta sessões, eventos, respostas e conversão.
- `dashboard.html`: painel de métricas e abandono por etapa.
- `supabase-schema.sql`: tabelas e policies para rodar no SQL Editor.
- `supabase/migrations/20260507150000_quiz_analytics.sql`: migration para Supabase CLI.

## Rodar localmente

Você pode abrir `index.html` diretamente no navegador. Para simular produção, use um servidor estático simples:

```bash
npx serve .
```

Ou:

```bash
python -m http.server 8080
```

Depois acesse `http://localhost:8080`.

## Publicar

GitHub Pages, Vercel e Netlify funcionam como site estático. Basta subir todos os arquivos da pasta raiz.

## Supabase

1. Abra o Supabase SQL Editor.
2. Cole e execute o conteúdo de `supabase-schema.sql`.
3. Abra o quiz e avance algumas etapas para gerar eventos.
4. Acesse `dashboard.html` para ver o painel.

Também pode usar CLI:

```bash
supabase login
supabase init
supabase link --project-ref wjrhjvgujycqcvkxhxtx
supabase db push
```

Para usar um subdomínio, publique o projeto na Vercel/Netlify e aponte, por exemplo:

- Quiz: `quiz.seudominio.com`
- Painel: `painel.seudominio.com/dashboard.html`

Observação de segurança: o painel estático usa a publishable key e policies públicas para leitura. Para produção profissional, o ideal é proteger o painel com autenticação Supabase ou uma área administrativa no servidor.

## Observacoes

- O fluxo foi extraído do payload público Next/XQuiz da URL original.
- Opções marcadas como `deleted` no payload foram filtradas.
- O checkout principal identificado no fluxo é `https://checkout.payt.com.br/c9cdb9f714f98780624f1cfb20acb574`.
- Existe também um link `lastlink` solto no payload; ele foi salvo como fallback em `quiz-data.json`.
- O componente de vídeo/áudio foi reconstruído visualmente, pois o payload não trouxe uma URL pública de mídia utilizável no HTML inicial.

## Checklist

- [x] Landing inicial com imagem, textos e CTA.
- [x] Perguntas renderizadas por JSON, sem páginas HTML separadas.
- [x] Seleção única com avanço automático.
- [x] Seleção múltipla com botão `Continuar`.
- [x] Formulários de nome, WhatsApp, e-mail e condição de saúde.
- [x] Sliders de peso e altura.
- [x] Barras de progresso com percentuais do funil.
- [x] Loadings com delay e avanço automático.
- [x] Depoimentos, cards, áudio/vídeo visual e CTA final.
- [x] Respostas salvas em `localStorage`.
- [x] UTMs preservadas no redirecionamento final.
- [x] Funciona abrindo `index.html` direto ou via servidor estático.
