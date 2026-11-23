# Roteiro do vídeo (alvo: 4 a 4,5 minutos; mínimo 2, máximo 5)

Antes de gravar, deixe abertos: VS Code com o projeto, um terminal na pasta do projeto, o navegador em `http://localhost:8080` e o PDF da RDM.

Rode antes, para os containers já estarem no ar:

```bash
docker compose up -d --build
```

| # | Tempo | O que mostrar | O que falar (sugestão) |
|---|---|---|---|
| 1 | 0:00–0:20 | Rosto/tela inicial, README | "Sou o Fernando Rateke Neto e este é o EstuLanches, sistema de cardápio e pedidos da cantina escolar. O problema: fila no intervalo, pedido no papel, erro de valor e aluno sem saber se o lanche ficou pronto. O sistema resolve isso: o aluno pede pelo cardápio online e acompanha o status, e a cantina gerencia a fila e o cardápio." |
| 2 | 0:20–0:35 | README, tabela de tecnologias | "Usei Node.js com Express 5 na API, PostgreSQL 16 no banco, frontend em HTML/JS puro, Jest e Supertest nos testes, e Docker e Docker Compose na implantação." |
| 3 | 0:35–1:15 | `Dockerfile` | "O Dockerfile é multi-stage. O estágio `deps` instala só as dependências de produção. O `test` tem as de desenvolvimento para rodar os testes. O `production` é a imagem final, alpine e enxuta. Os arquivos são do root e o processo roda como usuário `node`, sem privilégios. Tem HEALTHCHECK no `/health`, e o CMD é `node` direto, para receber o SIGTERM e desligar com segurança." |
| 4 | 1:15–1:55 | `docker-compose.yml` | "O compose tem dois serviços. O `db` é o Postgres com volume persistente e healthcheck. O `app` só sobe quando o banco está *healthy*. A senha e o token vêm do `.env`, que não vai pro Git. São duas redes: a `backend` é interna, então o banco não tem porta publicada. Só a app aparece, na 8080. No app ainda tem `read_only`, `cap_drop ALL`, `no-new-privileges`, limite de CPU e memória e rotação de log. Os serviços de teste ficam num *profile* separado." |
| 5 | 1:55–2:15 | Terminal: `docker compose ps` e `docker compose logs app db` | "Os dois serviços estão Up e healthy, com a porta 8080 mapeada para a 3000. Nos logs: conectou no banco, aplicou as migrações e subiu o servidor, sem erros críticos." |
| 6 | 2:15–2:50 | `tests/unit/pedido.test.js`, `tests/integration/api.test.js`, terminal rodando `docker compose --profile test run --rm test` | "Os testes unitários validam as regras puras: total em centavos, validação, fluxo de status e autenticação. Os de integração sobem a API com um Postgres real e descartável e testam o fluxo completo do pedido, o total calculado no servidor, SQL injection, 401 sem token e rate limit. São 62 testes, todos passando, com 93% de cobertura." |
| 7 | 2:50–3:15 | Código: `src/domain/pedido.js` (calcularTotal, TRANSICOES) e `src/routes/pedidos.js` (transação) | "As regras de negócio ficam separadas das rotas. O preço é guardado em centavos para evitar erro de ponto flutuante. O pedido é gravado numa transação, então ou grava tudo ou nada. E o status só pode seguir o fluxo permitido." |
| 8 | 3:15–3:50 | Navegador: adicionar itens, fazer pedido, "Meu pedido", aba Cantina (token), avançar status, desmarcar um produto | Mostre o fluxo completo. "O aluno monta o pedido e recebe o número. Na cantina, com o token, eu vejo a fila e avanço para preparando e pronto. Se acabar um item, desmarco e ele some do cardápio." |
| 9 | 3:50–4:05 | PDF `docs/RDM-EstuLanches.pdf` | "Esta é a Ficha RDM: versão 1.0.0, data e horário, parâmetros configurados, resultado dos testes e da validação, plano de rollback e status final: concluída com sucesso." |
| 10 | 4:05–4:20 | README, seção Segurança | "Na segurança: SQL parametrizado, validação de entrada, helmet com CSP, rate limit, token comparado em tempo constante, sem stack trace no erro, container não-root e somente leitura, e banco sem porta exposta." |
| 11 | 4:20–4:50 | `docs/escalabilidade.md` (diagrama) | Use o resumo de 30 s que está no fim do `escalabilidade.md`. |
| 12 | 4:50–5:00 | Repositório no GitHub | "O link do repositório está nos comentários. Obrigado!" |

**Dica:** se passar do tempo, encurte os itens 7 e 10. O vídeo precisa ficar abaixo de 5:00.
