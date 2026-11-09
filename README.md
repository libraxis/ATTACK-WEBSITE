# HTTP Cron — GitHub Pages + Actions (1 RPS)

Versão de verificação HTTP controlada com taxa fixa de no máximo uma requisição por segundo.

## Atualizar o repositório existente

Envie/substitua os arquivos deste pacote na raiz do repositório. Esta versão usa a pasta `script` (singular), para corresponder à estrutura atual do seu repositório.

## Configurar

Edite `jobs.json`:

```json
{
  "jobs": [
    {
      "name": "Meu site",
      "url": "https://SEU-DOMINIO/health",
      "method": "GET",
      "enabled": true,
      "duration_seconds": 60
    }
  ]
}
```

Ative exatamente um destino. A duração aceita de 1 a 240 segundos. A taxa é fixa em até 1 RPS; atrasos não são compensados com rajadas. Métodos: GET e HEAD. Timeout por requisição: 0,8 s.

## Executar

Abra Actions → HTTP Cron → Run workflow. O workflow também é agendado a cada 5 minutos. O agendamento pode atrasar; para iniciar um teste, use Run workflow.

GitHub Actions não é um serviço de execução contínua nem um agendador de precisão. Cada execução realiza um teste com duração configurada e termina.

Use somente em serviços que você controla ou tem autorização expressa para testar. Esta configuração é deliberadamente limitada a 1 RPS e duração curta.
