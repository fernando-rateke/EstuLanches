# syntax=docker/dockerfile:1
# =============================================================================
# EstuLanches - imagem da aplicação (multi-stage build)
#   deps        -> instala só as dependências de produção
#   test        -> imagem com dependências de desenvolvimento para rodar os testes
#   production  -> imagem final, enxuta, sem ferramentas de teste, usuário não-root
# =============================================================================
ARG NODE_VERSION=22-alpine

# ---------- Base comum ----------
FROM node:${NODE_VERSION} AS base
WORKDIR /app
COPY package.json package-lock.json ./

# ---------- Dependências de produção ----------
FROM base AS deps
# O "secret" opcional permite build atrás de proxy com certificado próprio
# (rede da escola/empresa) sem gravar o certificado em nenhuma camada da imagem.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---------- Testes (unitários + integração) ----------
FROM base AS test
ENV NODE_ENV=test
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --ignore-scripts
COPY . .
RUN chown -R node:node /app
USER node
CMD ["npm", "test"]

# ---------- Produção ----------
FROM node:${NODE_VERSION} AS production
ARG APP_VERSION=1.0.0
LABEL org.opencontainers.image.title="EstuLanches" \
      org.opencontainers.image.description="Gestão de cardápio e pedidos da cantina escolar" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.authors="Fernando Rateke Neto"

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=3000

WORKDIR /app
# Arquivos pertencem ao root e são só leitura para o usuário "node":
# mesmo que a aplicação seja comprometida, o código não pode ser alterado.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY db ./db
COPY public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# "node" direto (não "npm start") para receber o SIGTERM do "docker stop".
CMD ["node", "src/server.js"]
