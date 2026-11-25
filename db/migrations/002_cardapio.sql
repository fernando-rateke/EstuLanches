-- 002: produtos do cardápio

CREATE TABLE produtos (
  id              SERIAL PRIMARY KEY,
  nome            VARCHAR(100) NOT NULL,
  descricao       VARCHAR(255) NOT NULL DEFAULT '',
  categoria       VARCHAR(20)  NOT NULL CHECK (categoria IN ('lanche', 'bebida', 'doce', 'salgado', 'refeicao')),
  -- dinheiro em CENTAVOS (inteiro): R$ 12,50 = 1250. Evita erro de arredondamento.
  preco_centavos  INTEGER      NOT NULL CHECK (preco_centavos > 0),
  disponivel      BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
