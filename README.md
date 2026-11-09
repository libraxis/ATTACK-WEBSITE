# HTTP Cron — GitHub Pages + GitHub Actions

Projeto simples de agendamento periódico de requisições HTTP. O GitHub Pages hospeda o painel; o GitHub Actions executa as verificações remotamente.

## Instalação

1. Crie um repositório no GitHub e envie todos os arquivos desta pasta (incluindo `.github/workflows/cron.yml`).
2. No repositório, acesse **Settings → Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**, escolha `main` e a pasta `/ (root)`. Salve.
4. Acesse **Settings → Actions → General → Workflow permissions** e permita **Read and write permissions**.
5. Abra a aba **Actions**, selecione **HTTP Cron** e clique em **Run workflow** para testar. Depois ele será executado automaticamente a cada 5 minutos.
6. O endereço do painel será `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Configurar destinos

Edite `jobs.json` diretamente pelo GitHub e faça commit:

```json
{
  "jobs": [
    {
      "name": "Verificação do meu site",
      "url": "https://seu-dominio.com/health",
      "method": "GET",
      "enabled": true,
      "interval_minutes": 5
    }
  ]
}
```

- `enabled`: `true` ativa; `false` pausa.
- `interval_minutes`: múltiplos de 5, de 5 a 60 minutos.
- Métodos permitidos: `GET`, `HEAD` e `POST`.
- Máximo de 20 destinos; timeout de 15 segundos por requisição.
- O workflow faz no máximo uma requisição por destino em cada execução programada.
- São aceitos somente destinos HTTP(S) públicos. Não use para enviar tráfego a sistemas sem autorização.

## Limitações importantes

- O agendamento do GitHub Actions é aproximado; o GitHub pode atrasar execuções em períodos de alta demanda.
- O menor intervalo deste projeto é 5 minutos. Não é um serviço de execução a cada segundo nem um gerador de carga.
- O painel é estático. Para alterar os agendamentos, edite `jobs.json` no GitHub. O painel não grava alterações no repositório.
- O histórico básico fica em `status.json`; o log completo de cada execução fica na aba **Actions**.
- Repositórios públicos e privados têm limites e regras de uso do GitHub Actions. Confira as cotas do seu plano.

## Segurança

Não coloque tokens, senhas ou cabeçalhos secretos em `jobs.json`, pois o arquivo pode ficar público. Esta versão não envia corpo POST nem permite headers personalizados.
