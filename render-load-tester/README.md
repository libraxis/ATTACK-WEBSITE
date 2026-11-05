# Render Load Tester

Painel web estático (GitHub Pages) + executor Node.js (Render) para testes de carga autorizados em serviços próprios.

## Limites de segurança incluídos

- Apenas HTTPS, métodos GET e origem/domínio explicitamente autorizado.
- Redirecionamentos não são seguidos.
- Máximo de 50 requisições iniciadas por segundo.
- Máximo de 20 requisições simultâneas.
- Máximo de 120 segundos por teste.
- Máximo de 6.000 tentativas por teste.
- Chave de API obrigatória quando `API_KEY` estiver configurada.
- O executor não aceita URL arbitrária: valida hostname exato em `ALLOWED_HOSTS`.

> Execute somente em serviços seus ou com autorização expressa. Faça primeiro testes pequenos e aumente gradualmente. O gerador também consome CPU/rede e pode se tornar o gargalo, especialmente se estiver em uma instância pequena do Render.

## 1. Publicar o executor no Render

1. Crie um repositório GitHub e envie o conteúdo desta pasta.
2. No Render, escolha **New + → Web Service** e conecte o repositório.
3. Configure **Root Directory** como `backend`.
4. Build Command: `npm install` (não há dependências externas; também pode usar `npm ci` somente se adicionar lockfile).
5. Start Command: `npm start`.
6. Use Node 20 ou superior.
7. Em Environment, configure:

| Variável | Exemplo | Obrigatória |
|---|---|---|
| `API_KEY` | uma chave longa e aleatória | Sim, recomendado |
| `ALLOWED_HOSTS` | `meu-app.onrender.com,api.meudominio.com` | Sim |
| `ALLOWED_ORIGINS` | `https://seuusuario.github.io` | Recomendado |
| `PORT` | fornecida pelo Render | Não |

`ALLOWED_HOSTS` deve conter somente os hostnames exatos dos serviços que você controla, separados por vírgula, sem `https://` e sem caminhos. Se o frontend estiver em outro domínio, ajuste `ALLOWED_ORIGINS`. Para um teste local, pode temporariamente usar `*`, mas não é recomendado em produção.

Depois do deploy, abra `https://SEU-EXECUTOR.onrender.com/health`. Deve retornar JSON com `ok: true`.

## 2. Publicar o frontend no GitHub Pages

1. Envie os arquivos `index.html`, `styles.css` e `app.js` que estão na raiz deste pacote para a raiz do repositório GitHub. A pasta `backend` pode permanecer no mesmo repositório; ela não será publicada pelo Pages.
2. No GitHub, acesse **Settings → Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**, branch `main`, pasta `/ (root)`.
4. Abra a URL do GitHub Pages.

## 3. Usar

1. Informe a URL HTTPS do endpoint que deseja testar, por exemplo `https://meu-app.onrender.com/health`.
2. Informe a URL do executor Render, a chave `API_KEY`, RPS, concorrência e duração.
3. Comece com 1–5 RPS por 10 segundos.
4. Acompanhe métricas e interrompa o teste quando necessário.

O executor realiza GET e descarta o corpo da resposta. Respostas HTTP 200–399 contam como sucesso; 4xx/5xx e falhas de rede contam como erro. Redirects são medidos sem seguir o destino.

## Observações

- O estado dos testes fica em memória no processo do executor; reiniciar ou redeployar o serviço apaga o histórico.
- Este projeto não é um gerador distribuído. O limite de RPS é por instância do executor.
- Para testes de carga de maior escala, use uma ferramenta dedicada como k6 ou Artillery em infraestrutura controlada e combine com métricas do Render.
