-- 003: pedidos e itens de cada pedido

CREATE TABLE pedidos (
  id              SERIAL PRIMARY KEY,
  usuario_id      INTEGER      NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  observacao      VARCHAR(255) NOT NULL DEFAULT '',
  status          VARCHAR(20)  NOT NULL DEFAULT 'recebido'
                  CHECK (status IN ('recebido', 'preparando', 'pronto', 'entregue', 'cancelado')),
  total_centavos  INTEGER      NOT NULL CHECK (total_centavos >= 0),
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE itens_pedido (
  id                       SERIAL PRIMARY KEY,
  pedido_id                INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id               INTEGER NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  quantidade               INTEGER NOT NULL CHECK (quantidade BETWEEN 1 AND 20),
  -- preço "congelado" na hora do pedido: mudar o cardápio não altera pedidos antigos
  preco_unitario_centavos  INTEGER NOT NULL CHECK (preco_unitario_centavos > 0)
);

CREATE INDEX idx_pedidos_status  ON pedidos (status);
CREATE INDEX idx_pedidos_usuario ON pedidos (usuario_id);
CREATE INDEX idx_itens_pedido    ON itens_pedido (pedido_id);
