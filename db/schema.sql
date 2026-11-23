-- EstuLanches - esquema do banco (idempotente: pode rodar várias vezes)

CREATE TABLE IF NOT EXISTS produtos (
  id              SERIAL PRIMARY KEY,
  nome            VARCHAR(100) NOT NULL,
  descricao       VARCHAR(255) NOT NULL DEFAULT '',
  categoria       VARCHAR(20)  NOT NULL CHECK (categoria IN ('lanche', 'bebida', 'doce', 'salgado', 'refeicao')),
  preco_centavos  INTEGER      NOT NULL CHECK (preco_centavos > 0),
  disponivel      BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pedidos (
  id              SERIAL PRIMARY KEY,
  cliente_nome    VARCHAR(100) NOT NULL,
  observacao      VARCHAR(255) NOT NULL DEFAULT '',
  status          VARCHAR(20)  NOT NULL DEFAULT 'recebido'
                  CHECK (status IN ('recebido', 'preparando', 'pronto', 'entregue', 'cancelado')),
  total_centavos  INTEGER      NOT NULL CHECK (total_centavos >= 0),
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id                       SERIAL PRIMARY KEY,
  pedido_id                INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id               INTEGER NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  quantidade               INTEGER NOT NULL CHECK (quantidade BETWEEN 1 AND 20),
  -- preço "congelado" no momento do pedido: mudar o cardápio não altera pedidos antigos
  preco_unitario_centavos  INTEGER NOT NULL CHECK (preco_unitario_centavos > 0)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos (status);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido ON itens_pedido (pedido_id);
