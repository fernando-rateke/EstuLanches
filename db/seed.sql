-- Cardápio inicial (só é inserido se a tabela estiver vazia)
INSERT INTO produtos (nome, descricao, categoria, preco_centavos)
SELECT * FROM (VALUES
  ('X-Salada',            'Pão, hambúrguer, queijo, alface e tomate', 'lanche',   1200),
  ('Misto Quente',        'Pão de forma, presunto e queijo',          'lanche',    700),
  ('Coxinha',             'Coxinha de frango com catupiry',           'salgado',   600),
  ('Pão de Queijo (3un)', 'Porção com três pães de queijo',           'salgado',   500),
  ('Prato Feito',         'Arroz, feijão, bife e salada',             'refeicao', 1800),
  ('Suco Natural 300ml',  'Laranja, limão ou maracujá',               'bebida',    600),
  ('Água Mineral 500ml',  'Sem gás',                                  'bebida',    300),
  ('Brigadeiro',          'Brigadeiro tradicional',                   'doce',      250)
) AS v(nome, descricao, categoria, preco_centavos)
WHERE NOT EXISTS (SELECT 1 FROM produtos);
