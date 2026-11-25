# Roteiro do vídeo (alvo: cerca de 4 min 30 s · mínimo 2, máximo 5)

Antes de gravar, deixe abertos: VS Code com o projeto, um terminal na pasta do projeto, o navegador em `http://localhost:8080` e o PDF da RDM.

Antes de começar a gravação, ligue o sistema:

```bash
docker compose up -d --build
```

**Dica:** crie antes uma conta de aluno de teste e faça 1 ou 2 pedidos, para a fila da cantina não aparecer vazia.

| # | Tempo | O que mostrar | O que falar (sugestão; use suas palavras) |
|---|---|---|---|
| 1 | 0:00–0:20 | README | "Sou o Fernando Rateke Neto e este é o EstuLanches, o sistema de cardápio e pedidos da cantina da escola. O problema era fila no intervalo, pedido no papel, erro de conta e o aluno sem saber se o lanche ficou pronto. Agora o aluno pede pelo site com a matrícula e acompanha o status, e a cantina vê a fila e controla o cardápio." |
| 2 | 0:20–0:35 | README, tabela "Tecnologias e decisões" | "Usei Node.js com Express na API e PostgreSQL com SQL puro e migrações versionadas. O login usa sessões guardadas no banco e as senhas usam scrypt. Os testes são com Jest e Supertest, e a implantação é com Docker e Docker Compose." |
| 3 | 0:35–1:10 | `Dockerfile` | "O Dockerfile tem quatro etapas. A `deps` instala só o que roda em produção, a `test` tem as ferramentas de teste e a `production` é a imagem final, pequena, em alpine. Ela roda como usuário comum, não root, e o código fica só leitura. Tem HEALTHCHECK no `/health`, e o `node` roda direto para desligar com segurança." |
| 4 | 1:10–1:50 | `docker-compose.yml` | "São dois serviços. O banco tem volume para os dados não sumirem e healthcheck. A aplicação só sobe quando o banco está healthy. As senhas vêm do `.env`, que não vai pro GitHub. São duas redes, e a do banco é interna, sem porta aberta. Só a aplicação aparece, na 8080. Ainda tem sistema de arquivos só leitura, remoção de privilégios, limite de CPU e memória e rotação de log. Os testes ficam num perfil separado." |
| 5 | 1:50–2:10 | Terminal: `docker compose ps` e `docker compose logs app db` | "Os dois estão Up e healthy. No log, a aplicação conectou no banco, aplicou as três migrações, criou a conta da cantina e ligou o servidor, sem nenhum erro crítico." |
| 6 | 2:10–2:45 | `tests/unit/seguranca.test.js` e `tests/integration/api.test.js`, terminal com `docker compose --profile test run --rm test` | "Os unitários testam peças sozinhas: o cálculo do total, as validações, o hash da senha e os porteiros de login com requisições simuladas. Os de integração usam a API com um Postgres real e descartável: cadastro, login, aluno barrado na área da cantina, um aluno não vê o pedido do outro, logout que invalida a sessão e limite contra força bruta. São 102 testes, todos passando." |
| 7 | 2:45–3:10 | Código: `db/migrations/`, `src/domain/pedido.js`, `src/middleware/auth.js` | "Cada mudança no banco é um arquivo numerado, e o sistema só aplica os novos. As regras de negócio ficam separadas: dinheiro em centavos, fluxo de status. E esse middleware é o porteiro que confere a sessão no banco antes de liberar a rota." |
| 8 | 3:10–3:50 | Navegador: criar conta de aluno → adicionar itens → fazer pedido → "Meus pedidos" → Sair → entrar como `cantina` → avançar status → desmarcar um produto | Mostre o fluxo completo. "O aluno cria a conta, monta o pedido e acompanha aqui. Enquanto está como 'recebido', ele pode cancelar. Na cantina eu vejo a fila e avanço o status. Se acabar um item, eu desmarco e ele some do cardápio na hora." |
| 9 | 3:50–4:05 | `docs/RDM-EstuLanches.pdf` | "Esta é a Ficha RDM: versão 1.0.0, data e horário da implantação, parâmetros configurados, resultado dos testes e da validação, plano de rollback e o status: concluída com sucesso." |
| 10 | 4:05–4:20 | README, seção Segurança | "Na segurança: senha com scrypt, sessão que o logout derruba, perfis de aluno e cantina, limite de tentativas de login, SQL parametrizado, Helmet e container trancado sem root. E o banco não fica exposto." |
| 11 | 4:20–4:50 | `docs/escalabilidade.md` (diagrama) | Leia o resumo de 30 segundos que está no fim do arquivo. |
| 12 | 4:50–5:00 | Página do GitHub | "O link do repositório está nos comentários. Obrigado!" |

**Se passar de 5 minutos:** encurte os itens 7 e 10.
