# Escalabilidade conceitual: EstuLanches para o Brasil todo

**Cenário:** 1 milhão de usuários cadastrados, **100 mil simultâneos**. O pico é muito concentrado: todo mundo pede no intervalo, em janelas de 15 a 20 minutos, e quase no mesmo horário nos mesmos fusos.

## Estimativa de carga

- 100 mil usuários ativos, cada um fazendo ~1 requisição a cada 10 s (cardápio, pedido, acompanhar status) ≈ **10 mil req/s** no pico.
- Leituras (cardápio, status) ≈ 90%. Escritas (novos pedidos, mudança de status) ≈ 10%, ou seja, ~1 mil/s.
- Uma réplica Node.js aguenta algo como 500 a 1.000 req/s. Então precisamos de **~20 a 40 réplicas no pico**, com folga.

## Arquitetura proposta

```
 Usuários ─► DNS geográfico / CDN (arquivos estáticos + cache do cardápio)
              │
              ▼
        WAF + Load Balancer (HTTPS, anti-DDoS, rate limit na borda)
              │
              ▼
   ┌──── Kubernetes (ou serviço de containers gerenciado) ────┐
   │  N réplicas da imagem estulanches:x.y.z (stateless)       │
   │  HPA: autoescala por CPU/req/s (ex.: 4 → 60 pods)         │
   └───────┬───────────────┬──────────────────┬───────────────┘
           │               │                  │
       Redis (cache:   Fila (RabbitMQ/SQS)  PgBouncer (pool de conexões)
       cardápio,       pedidos e                  │
       sessões, rate   notificações        PostgreSQL primário (escrita)
       limit global)                       + réplicas de leitura
                                           + backup/PITR, multi-AZ
```

## Decisões principais

1. **Aplicação stateless (já está assim).** A app não guarda estado em memória nem em disco (`read_only`). Toda a configuração vem de variáveis de ambiente, então dá para rodar quantas cópias forem necessárias atrás de um balanceador. O próprio Docker Compose já permite testar isso: `docker compose up --scale app=3`, com um proxy na frente.
2. **Orquestração e autoescala.** Kubernetes com *Horizontal Pod Autoscaler*. O `HEALTHCHECK`/`/health` vira *readiness/liveness probe*. Deploy *rolling* ou *blue-green*, usando a mesma imagem versionada da RDM.
3. **Cache.** O cardápio muda pouco e é lido muito. Ele fica em Redis e na CDN com TTL curto (30 a 60 s), o que tira mais de 80% das leituras do banco.
4. **Banco de dados.**
   - **PgBouncer**: 40 pods × 10 conexões já estouraria o PostgreSQL sem um pooler.
   - **Réplicas de leitura** para consultas e status; o primário fica só com as escritas.
   - **Particionamento** da tabela `pedidos` por data (pedidos antigos viram histórico).
   - Em escala nacional, **sharding por escola/região**: cada escola só enxerga os próprios pedidos, então os dados se dividem bem por `escola_id`.
5. **Fila para picos.** No intervalo, o pedido entra numa fila e é confirmado de forma assíncrona, o que absorve rajadas sem derrubar o banco. Notificação de "pedido pronto" por WebSocket/push em vez de o aluno ficar consultando.
6. **Multi-tenant.** Adicionar `escola_id` às tabelas. Cada escola tem cardápio e fila próprios, o que facilita o sharding e o isolamento.
7. **Regiões.** Nuvem com região em São Paulo (sa-east-1 ou equivalente) e mais de uma zona de disponibilidade. Os fusos do Brasil distribuem um pouco o pico.
8. **Segurança em escala.** WAF, rate limit distribuído (Redis), login por aluno (OAuth/SSO da escola) em vez de token único, segredos em *Secret Manager*, TLS em toda a comunicação, LGPD (dados de menores: mínimo necessário, criptografia, retenção definida).
9. **Observabilidade.** Os logs já saem em JSON no stdout, então vão direto para um coletor (Loki/ELK). Métricas com Prometheus + Grafana, alertas de latência e erro, e *tracing*.
10. **CI/CD.** Pipeline que roda `docker compose --profile test run --rm test`, constrói a imagem, faz scan de vulnerabilidades (Trivy) e publica num registry. Cada deploy gera uma RDM.

## Resumo para o vídeo (30 segundos)

> "A aplicação já foi feita *stateless* e configurada por variáveis de ambiente. Para 100 mil usuários simultâneos (~10 mil requisições por segundo), eu rodaria dezenas de réplicas da mesma imagem Docker num Kubernetes com autoescala, atrás de um load balancer com WAF. O cardápio ficaria em cache no Redis e na CDN. O PostgreSQL teria PgBouncer, réplicas de leitura e particionamento por escola. Os pedidos do horário de pico passariam por uma fila. Tudo monitorado com métricas e logs centralizados, e implantado por pipeline de CI/CD."
