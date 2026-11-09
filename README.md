# Universal HTTP Load Tester — versão sem chave

Painel estático para GitHub Pages + executor Node.js para Render, Railway, VPS ou outro host Node.

## Como funciona

- O painel não pede API_KEY, senha ou chave privada.
- O site de destino não precisa ter autenticação.
- O executor aceita destinos HTTPS públicos cujo hostname esteja cadastrado em `ALLOWED_HOSTS`.
- Cadastre somente sites próprios ou de terceiros para os quais você tenha autorização expressa para realizar testes de carga.

A lista `ALLOWED_HOSTS` é uma autorização configurada pelo administrador do executor, não uma chave que o usuário precisa digitar. Ela impede que um executor público seja usado para atingir domínios arbitrários.

## Publicar o painel no GitHub Pages

1. Extraia este ZIP.
2. Envie `index.html`, `styles.css`, `app.js` e `README.md` diretamente para a raiz do repositório.
3. O diretório `backend` pode ficar no mesmo repositório, mas o Pages não o executa.
4. GitHub: **Settings → Pages → Deploy from a branch → main → /(root) → Save**.
5. Aguarde a execução de Pages em **Actions** ficar verde.

## Publicar o executor

No Render, Railway ou host Node:

- Root Directory: `backend`
- Runtime: Node 20+
- Build Command: `npm install`
- Start Command: `npm start`

Configure estas variáveis de ambiente:

| Variável | Valor |
|---|---|
| `ALLOWED_HOSTS` | Hostnames exatos dos sites autorizados, separados por vírgula |
| `ALLOWED_ORIGINS` | Origem exata do GitHub Pages, por exemplo `https://usuario.github.io` |
| `PORT` | Fornecida automaticamente pela maioria dos hosts |

Exemplo:
- `ALLOWED_HOSTS=meu-site.com,api.meu-site.com,site-de-terceiro-autorizado.com`
- `ALLOWED_ORIGINS=https://usuario.github.io`

Não coloque `https://` nem caminhos em `ALLOWED_HOSTS`. Cadastre apenas hostnames para os quais você tem autorização. Não use wildcard.

## Utilização

1. Abra o painel GitHub Pages.
2. Informe a URL HTTPS do destino.
3. Informe a URL pública do executor.
4. Selecione GET ou HEAD, RPS, concorrência e duração.
5. Comece com 1–5 RPS por 10 segundos e aumente somente dentro do escopo autorizado.

## Limites e segurança

- HTTPS obrigatório; somente GET e HEAD.
- Hostname precisa estar em `ALLOWED_HOSTS`.
- IPs privados, loopback, link-local e endereços especiais são bloqueados.
- Redirecionamentos não são seguidos.
- Máximo de 50 RPS, 20 conexões simultâneas, 120 segundos e 6.000 tentativas por teste.
- Timeout por requisição: 12 segundos.
- Apenas um teste pode estar em execução por vez neste executor.
- O estado e o histórico ficam em memória; reiniciar o executor apaga testes anteriores.
- Não é um gerador distribuído; o throughput real depende dos recursos do executor e da rede.

**Importante:** remover a chave simplifica o uso, mas não torna seguro deixar qualquer domínio disponível para qualquer pessoa. Mantenha a lista de domínios restrita a testes autorizados e a origem do painel configurada corretamente.
