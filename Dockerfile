# syntax=docker/dockerfile:1
# ┌──────────────────────────────────────────────────────────────────────────┐
# │ EstuLanches · Dockerfile                                                 │
# │                                                                          │
# │ Este arquivo é a "receita" da IMAGEM da aplicação. Ele é dividido em     │
# │ ETAPAS (multi-stage). Cada etapa começa com FROM ... AS <nome>:          │
# │                                                                          │
# │   base        ponto de partida comum (Node + lista de dependências)      │
# │   deps        baixa SÓ as bibliotecas usadas em produção                 │
# │   test        imagem com as ferramentas de teste (Jest, Supertest)       │
# │   production  imagem FINAL que vai para o servidor: pequena e trancada   │
# │                                                                          │
# │ POR QUÊ: a imagem final não carrega ferramentas de teste nem lixo de     │
# │ build → fica menor, sobe mais rápido e tem menos coisa para ser atacada. │
# └──────────────────────────────────────────────────────────────────────────┘

# Versão do Node num só lugar. "alpine" = Linux mínimo (~5 MB).
ARG NODE_VERSION=22-alpine

# ─── base ──────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS base
WORKDIR /app
# Copiamos primeiro SÓ a lista de dependências. POR QUÊ: o Docker guarda cada
# passo em cache; se o código mudar mas as dependências não, o "npm ci" não
# precisa rodar de novo e o build fica muito mais rápido.
COPY package.json package-lock.json ./

# ─── deps (dependências de produção) ───────────────────────────────────────
FROM base AS deps
# npm ci           → instala exatamente as versões do package-lock (reprodutível)
# --omit=dev       → sem Jest/Supertest
# --ignore-scripts → não executa scripts de pacotes de terceiros (segurança)
# O "secret" opcional serve para redes com proxy (escola/empresa): o certificado
# é usado só durante o build e NÃO fica gravado em nenhuma camada da imagem.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ─── test (usada por: docker compose --profile test run --rm test) ─────────
FROM base AS test
ENV NODE_ENV=test
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --ignore-scripts
COPY . .
RUN chown -R node:node /app
USER node
CMD ["npm", "test"]

# ─── production (imagem final) ─────────────────────────────────────────────
FROM node:${NODE_VERSION} AS production
ARG APP_VERSION=1.0.0

# Etiquetas: quem fez, que versão é (aparece em "docker inspect")
LABEL org.opencontainers.image.title="EstuLanches" \
      org.opencontainers.image.description="Gestão de cardápio e pedidos da cantina escolar" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.authors="Fernando Rateke Neto"

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=3000

WORKDIR /app
# Só o necessário para rodar. Nada de testes, docs ou .env.
# Os arquivos ficam com dono "root" → o usuário da aplicação só consegue LER,
# então mesmo que alguém invada a aplicação, não consegue alterar o código.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY db ./db
COPY public ./public

# Roda como o usuário comum "node" (uid 1000), nunca como root.
USER node

# Documenta a porta interna do container.
EXPOSE 3000

# Saúde: a cada 15 s o Docker chama /health. Se falhar 3 vezes seguidas,
# o container aparece como "unhealthy" no "docker compose ps".
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# Inicia com "node" direto (não "npm start"). POR QUÊ: assim o processo recebe o
# aviso de desligar (SIGTERM) do "docker stop" e termina sem cortar pedidos.
# As migrações do banco rodam automaticamente dentro do server.js.
CMD ["node", "src/server.js"]
