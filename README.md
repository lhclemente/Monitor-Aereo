# Monitor Aereo

Bot de Telegram para monitorar passagens aereas e enviar alertas quando uma rota cair abaixo do preco desejado.

## Como rodar

1. Crie o bot no BotFather e copie o token.
2. Copie `.env.example` para `.env`.
3. Preencha `TELEGRAM_BOT_TOKEN`.
4. Instale e rode:

```powershell
npm.cmd install
npm.cmd start
```

## Banco de dados

Por padrao, o bot usa SQLite:

```env
STORAGE_DRIVER=sqlite
DATABASE_URL=./data/monitor-aereo.sqlite
```

O arquivo do banco fica em `data/`, que nao deve ser versionado.

Para usar o armazenamento antigo em JSON:

```env
STORAGE_DRIVER=json
DATA_FILE=./data/monitor-aereo.json
```

Para migrar dados existentes do JSON para SQLite:

```powershell
npm.cmd run migrate:json-to-sqlite
```

Para producao, use PostgreSQL separado do backend:

```env
STORAGE_DRIVER=postgres
DATABASE_URL=postgresql://usuario:senha@host.neon.tech/monitor_aereo?sslmode=require
```

Para migrar os dados do SQLite local para PostgreSQL:

```powershell
npm.cmd run migrate:sqlite-to-postgres
```

Se o SQLite de origem estiver em outro arquivo:

```powershell
$env:SQLITE_DATABASE_URL="./data/monitor-aereo.sqlite"; npm.cmd run migrate:sqlite-to-postgres
```

## APIs

O projeto ja tem conectores para:

- SerpApi Google Flights, usando `SERPAPI_API_KEY`.
- Travelpayouts Data API, usando `TRAVELPAYOUTS_TOKEN`.
- Mock provider, habilitado por `MOCK_PROVIDER_ENABLED=true`, util para testar o bot sem credenciais.

Sem credenciais externas de busca, o bot funciona com o mock provider para validar cadastro, scheduler e notificacoes.

Variaveis principais:

```env
TELEGRAM_BOT_TOKEN=
TRAVELPAYOUTS_TOKEN=
TRAVELPAYOUTS_MARKER=
SERPAPI_API_KEY=
SERPAPI_GL=br
SERPAPI_HL=pt-br
```

Se voce ja tem Telegram e Travelpayouts, o sistema roda com essas fontes. `TRAVELPAYOUTS_MARKER` e opcional e adiciona seu marcador de afiliado aos links do Aviasales. Adicione `SERPAPI_API_KEY` quando quiser consultar resultados do Google Flights via SerpApi.

## Comandos do bot

- `/start` - inicia o bot.
- `/novo` - cria um monitoramento.
- `/alertas` - lista alertas.
- `/remover <id>` - remove um alerta.
- `/pausar <id>` - pausa um alerta.
- `/reativar <id>` - reativa um alerta.
- `/buscar ORIGEM DESTINO IDA [VOLTA] [PRECO_MAX]` - busca manual.
- `/status` - mostra status.
- `/privacidade` - mostra quais dados sao armazenados.
- `/excluir confirmar` - apaga seu cadastro, alertas e historico local.
- `/ajuda` - lista comandos.

Exemplo:

```text
/buscar GRU LIS 2026-09-10 2026-09-25 3500
```

## Observacoes

- Precos sao informativos e podem mudar no site final.
- Travelpayouts Data API retorna dados cacheados, entao e fonte auxiliar.
- SerpApi consome creditos por busca; use intervalos conservadores no scheduler.
- Scraping de companhias nao foi incluido no MVP por risco tecnico e juridico.
