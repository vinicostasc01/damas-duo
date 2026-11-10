# Dama — bons encontros, boas jogadas

**Jogar:** https://damas-duo.vercel.app  
**Código:** https://github.com/vinicostasc01/damas-duo

Jogo de damas online para **duas pessoas**, sem cadastro. Uma pessoa cria a sala e compartilha o link; a outra entra pelo navegador. Também há modo local para duas pessoas no mesmo dispositivo.

## Funcionalidades

- Tabuleiro responsivo, orientação automática para cada jogador e navegação por teclado.
- Salas privadas por código aleatório de oito caracteres.
- Captura obrigatória, regra da maior captura, sequências de captura, captura para trás e damas de longo alcance.
- Promoção ao final da jogada; peças capturadas bloqueiam as diagonais até o fim da sequência.
- Histórico, reconexão após atualizar, indicação de presença e partida salva.
- Empate por acordo, terceira repetição ou 50 turnos sem captura/movimento de pedra.
- Desistência e revanche com consentimento dos dois jogadores, alternando as cores.
- Variante casual 8×8: não implementa todas as regras especiais de empate material de competições oficiais.

## Arquitetura

**Next.js + React + TypeScript**, hospedado na Vercel. **Supabase Postgres + Edge Function** para estado persistente e validação autoritativa. Sincronização por consulta a cada 2,5 segundos, pausada em abas ocultas. Sem servidor WebSocket permanente, sem dependência de um computador ligado.

O navegador chama apenas as rotas `/api/rooms` do Next. A rota encaminha uma credencial aleatória de 256 bits em cookie HttpOnly para a Edge Function. O banco armazena somente seu SHA-256. Conhecer o código da sala não permite ler uma partida ocupada ou controlar outro jogador.

Todas as jogadas são recalculadas no servidor. Controle de versão no `UPDATE` impede que duas requisições concorrentes façam dois movimentos na mesma versão. O cliente não escolhe o tabuleiro, o vencedor ou seu lado.

As tabelas têm RLS habilitado, sem acesso para `anon` e `authenticated`. Somente a Edge Function usa a chave `service_role` injetada pelo Supabase, nunca enviada ao frontend. O alerta informativo `RLS enabled / no policy` é intencional: essas tabelas são exclusivas do backend. Há limites básicos de requisições no banco; isso não substitui uma solução antiabuso para grandes audiências públicas.

As salas expiram após 7 dias sem jogadas. A limpeza é oportunística, durante requisições. Abas sem heartbeat por 20 segundos aparecem como fora da mesa; isso não encerra a partida. Apagar cookies ou trocar de navegador perde o acesso à cadeira daquela sala.

## Rodar localmente

Node.js 22 ou superior.

```bash
npm ci
cp .env.example .env.local
# Configure GAME_API_URL com a URL da Edge Function.
npm run dev
```

Não coloque chaves de serviço em variáveis `NEXT_PUBLIC_*`. O único ambiente exigido no Next é `GAME_API_URL`; ele aponta para o endpoint público da função, sem conter segredos.

## Preparar o backend em outra conta

1. Crie um projeto Supabase.
2. Aplique `database/schema.sql` pelo SQL Editor ou como migration via Supabase CLI.
3. Publique `supabase/functions/games/index.ts` como função `games`, incluindo `lib/engine.ts` e `lib/game-service.ts`.
4. Desative **somente a verificação de JWT dessa função** (`verify_jwt = false`), pois o jogo implementa suas próprias sessões anônimas. A autorização das jogadas continua obrigatória no código.
5. Configure `GAME_API_URL=https://SEU_PROJETO.supabase.co/functions/v1/games` na Vercel, para os ambientes usados, e faça o deploy.

Não é necessário inserir `SUPABASE_SERVICE_ROLE_KEY` manualmente na Vercel. Ela existe apenas dentro do runtime da Edge Function do Supabase.

## APIs

| Endpoint            | Método | Corpo / resultado                                                                      |
| ------------------- | ------ | -------------------------------------------------------------------------------------- |
| `/api/health`       | GET    | Saúde do Next e indicação de backend configurado                                       |
| `/api/rooms`        | POST   | `{ "name": "Seu nome" }` cria a sala e define seu cookie                               |
| `/api/rooms/CODIGO` | POST   | `{ "action": "join", "name": "Seu nome" }` ocupa a segunda cadeira                     |
| `/api/rooms/CODIGO` | GET    | Estado autorizado da sala; exige cookie do jogador                                     |
| `/api/rooms/CODIGO` | POST   | `{ "action": "move", "version": 1, "path": [40, 33] }`                                 |
| `/api/rooms/CODIGO` | POST   | `resign`, `offer-draw`, `accept-draw`, `decline-draw`, `rematch`, sempre com `version` |

Casas são índices de 0 a 63, linha por linha, começando em a8. Uma captura múltipla envia a sequência completa de casas em `path`. Erros usam `{ "error": "mensagem" }`, com status 400, 401, 403, 404, 409, 410, 429 ou 503.

## Testes

```bash
npm test                # Regras, autorização, concorrência, empate e revanche
npm run typecheck
npm run build
npx playwright install chromium
# Com o servidor local em execução:
npm run test:e2e
# Ou contra o deploy:
# TEST_BASE_URL=https://seu-site.vercel.app npm run test:e2e
```

Os testes E2E usam dois contextos independentes de navegador e um terceiro intruso. Verificam sincronização, persistência após reload, rejeição de jogada fora da vez, bloqueio de terceiro jogador, empate, troca de cores na revanche e desistência. A revisão de layout cobre 1365×900 e 390×844, screenshots, ausência de rolagem horizontal e erros de JavaScript.

Os testes online criam salas reais no backend configurado; elas seguem a mesma política de expiração. Não execute testes de carga no plano gratuito.

## Operação

O frontend e o backend usam serviços independentes. Alterações apenas na interface podem ser publicadas na Vercel; mudanças em `lib/engine.ts`, `lib/game-service.ts` ou na função exigem publicar novamente a Edge Function também. O tier gratuito do Supabase pode pausar projetos inativos; retome o projeto no painel se necessário. Planos e limites das plataformas podem mudar.
