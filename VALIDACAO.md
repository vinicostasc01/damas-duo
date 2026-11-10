# Validação da entrega

Revisão realizada em 10/11/2026.

- `npm test`: **39 testes aprovados**, cobrindo regras e autorização das salas.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado localmente e na Vercel, com Node.js 24.
- `npm run format:check`: aprovado.
- Auditoria do npm na instalação: nenhuma vulnerabilidade reportada.
- Playwright: **2 cenários E2E aprovados** localmente e novamente em `https://damas-duo.vercel.app`.
- Contextos independentes de navegador jogaram seis turnos contra a API real. Houve captura, persistência após reload, bloqueio de intruso e jogada fora da vez, empate acordado, revanche com inversão das cores e desistência.
- Layouts de **1365×900** e **390×844** revisados por screenshot, sem rolagem horizontal ou erro de JavaScript. Modo local e fechamento das regras com Escape também verificados.
- Saúde pública: `/api/health` respondeu `status: ok` e `onlineConfigured: true`.
- Banco: `anon` não pode ler salas, `authenticated` não pode atualizar salas e `anon` não pode executar a função de controle de requisições.
- Supabase Advisor: sem avisos ou erros de segurança; há dois informativos esperados de RLS sem policy, pois as tabelas são exclusivas da função de backend.
- `tonjao1313`: acesso **write** confirmado pela API do GitHub.

## Limites práticos

Sincronização por polling a cada 2,5 segundos, sem relógio de competição. Variante casual de damas 8×8; não inclui todas as regras especiais de empate de torneios. Salas expiram após 7 dias sem jogadas. Apagar cookies perde a cadeira. Não foram realizados testes de carga nem testes em hardware iOS/Android físico; o layout móvel foi testado em Chromium com viewport de 390×844.

O plano gratuito do Supabase pode pausar projetos inativos. Uma nova versão das regras ou da lógica de salas exige republicar a Edge Function além do frontend; o README descreve a estrutura.
