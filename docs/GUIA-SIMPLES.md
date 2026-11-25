# 📘 Guia simples do EstuLanches

Este guia explica o projeto **sem termos difíceis**, para você entender e conseguir falar dele no vídeo.

---

## 1. A ideia em uma frase

> Um site onde o aluno faz o pedido do lanche pelo celular e a cantina vê a fila na tela, sem papel e sem erro de conta.

---

## 2. As peças do sistema (pense num restaurante)

| Peça | No restaurante seria... | No projeto |
|---|---|---|
| **Site** (frontend) | o cardápio na mesa | `public/` (HTML, CSS, JavaScript) |
| **API** (backend) | o garçom: recebe o pedido, confere, leva para a cozinha | `src/` (Node.js + Express) |
| **Banco de dados** | o caderno onde tudo é anotado | PostgreSQL |
| **Docker** | uma marmita fechada: leva tudo junto e funciona igual em qualquer lugar | `Dockerfile` + `docker-compose.yml` |

---

## 3. Docker em 6 palavras

| Palavra | Explicação simples |
|---|---|
| **Imagem** | A "marmita congelada": o sistema pronto, com Node, código e bibliotecas. Não roda sozinha. |
| **Container** | A marmita **esquentada e servida**: a imagem rodando. |
| **Dockerfile** | A **receita** que monta a imagem, passo a passo. |
| **docker-compose.yml** | O **cardápio do dia**: diz quais containers sobem juntos (app + banco) e como se conectam. |
| **Volume** | Uma **gaveta** fora do container. Os dados do banco ficam ali e não somem quando o container é apagado. |
| **Porta `8080:3000`** | "Porta do meu PC : porta dentro do container". Você acessa `localhost:8080` e o Docker entrega na 3000 do container. |

---

## 4. O que acontece quando você roda `docker compose up -d --build`

1. O Docker lê o **Dockerfile** e monta a imagem `estulanches:1.0.0`.
2. Sobe o container do **banco** (`db`).
3. Espera o banco responder ("healthy").
4. Sobe o container da **aplicação** (`app`), que:
   - conecta no banco;
   - roda as **migrações** (cria as tabelas);
   - coloca o cardápio inicial;
   - cria a conta da cantina;
   - liga o site na porta 3000.
5. A cada 15 segundos o Docker pergunta para a app "está viva?" (`/health`).

Em `docker compose ps`, o status **Up (healthy)** quer dizer que está tudo certo.

---

## 5. Por que o Dockerfile tem várias etapas?

Ele tem **4 etapas**: `base`, `deps`, `test` e `production`. A imagem que vai para produção é só a última, **sem ferramentas de teste**. Ela fica menor, mais rápida e com menos coisa para alguém atacar.

---

## 6. Login: como funciona

1. O aluno cria a conta com **nome, matrícula e senha**.
2. A senha é transformada num "embaralhado" (**hash scrypt**). O banco nunca guarda a senha de verdade.
3. Quando entra, o aluno recebe um **código de sessão**, como um crachá. O navegador mostra esse crachá a cada pedido.
4. O banco guarda só o "embaralhado" do crachá. Quando o aluno clica em **Sair**, o crachá é rasgado e não funciona mais.
5. Existem dois perfis:
   - **aluno:** pede e acompanha os próprios pedidos;
   - **cantina:** vê a fila e muda o cardápio.

---

## 7. Testes: qual a diferença?

| Tipo | O que testa | Exemplo |
|---|---|---|
| **Unitário** | Uma peça **sozinha**, sem banco | "2 X-Salada de R$ 12 + 1 suco de R$ 6 = R$ 30?" |
| **Integração** | As peças **juntas**: site → API → banco de verdade | "O aluno consegue fazer pedido e a cantina consegue mudar para *pronto*?" |

O projeto tem **102 testes** (70 unitários + 32 de integração), todos passando. Para rodar:

```bash
docker compose --profile test run --rm test
```

---

## 8. Perguntas que o professor pode fazer (e respostas curtas)

**Por que Docker?**
Para o sistema rodar igual em qualquer computador, sem instalar Node ou PostgreSQL na mão, e para subir tudo com um comando.

**Por que o banco não tem porta aberta?**
Por segurança. Só a aplicação conversa com o banco, por uma rede interna do Docker. Ninguém de fora consegue nem tentar acessar.

**Onde ficam as senhas?**
No arquivo `.env`, que **não vai para o GitHub**. No código só existe o modelo `.env.example`.

**E se o container cair?**
Tem `restart: unless-stopped`: o Docker sobe de novo sozinho. E os dados não se perdem, porque estão no volume.

**Como impede SQL injection?**
Todas as consultas usam parâmetros (`$1`, `$2`). O que o usuário digita nunca vira comando SQL.

**Por que o preço é calculado no servidor?**
Porque o navegador pode ser manipulado. Se o total viesse do navegador, alguém poderia mandar "total = R$ 0,01".

**Por que dinheiro em centavos?**
Computador erra conta com decimal (`0,1 + 0,2` dá `0,30000000000000004`). Com inteiros (1250 = R$ 12,50) não tem erro.

**O que é migração?**
Um arquivo SQL numerado com uma mudança no banco. O sistema anota quais já rodou e só aplica as novas. É como o histórico de versões do banco.

**O que é a Ficha RDM?**
O registro oficial da implantação: qual versão subiu, quando, o que foi configurado, o resultado dos testes e se deu certo.

**Como escalaria para o Brasil todo?**
Veja o [documento de escalabilidade](escalabilidade.md). O resumo de 30 segundos está no fim dele.

---

## 9. Comandos que você vai usar

| Para quê | Comando |
|---|---|
| Ligar tudo | `docker compose up -d --build` |
| Ver se está rodando | `docker compose ps` |
| Ver os logs | `docker compose logs app db` |
| Rodar os testes | `docker compose --profile test run --rm test` |
| Desligar | `docker compose down` |
| Desligar e **apagar** os dados | `docker compose down -v` |
