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
SERPAPI_API_KEY=
SERPAPI_GL=br
SERPAPI_HL=pt-br
```

Se voce ja tem Telegram e Travelpayouts, o sistema roda com essas fontes. Adicione `SERPAPI_API_KEY` quando quiser consultar resultados do Google Flights via SerpApi.

## Comandos do bot

- `/start` - inicia o bot.
- `/novo` - cria um monitoramento.
- `/alertas` - lista alertas.
- `/remover <id>` - remove um alerta.
- `/pausar <id>` - pausa um alerta.
- `/reativar <id>` - reativa um alerta.
- `/buscar ORIGEM DESTINO IDA [VOLTA] [PRECO_MAX]` - busca manual.
- `/status` - mostra status.
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
