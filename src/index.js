import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { hashPassword, verifyPassword } from './crypto.js';
import {
  ExternalApiError,
  getAllProducts,
  getCategories,
  getProductById,
} from './fakestore.js';

const app = new Hono();

// Habilita CORS para permitir consumo pelo front-end (Cloudflare Pages / localhost)
app.use('*', cors());

function parsePositiveInt(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Rota raiz informativa
app.get('/', (c) => {
  return c.json({
    api: 'API de Cadastro de Clientes e Gerenciamento de Produtos Favoritos',
    status: 'online',
    endpoints: {
      clients: ['/clients', '/clients/login', '/clients/:id'],
      products: ['/products', '/products/:id', '/categories'],
      favorites: ['/clients/:id/favorites', '/clients/:id/favorites/:productId'],
    },
  });
});

// ============================================================================
// 3.1 CADASTRO E AUTENTICAÇÃO DE CLIENTES
// ============================================================================

// POST /clients - Cadastrar cliente
app.post('/clients', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Corpo da requisição JSON inválido.' }, 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (name.length < 2) {
    return c.json({ error: 'O nome deve ter pelo menos 2 caracteres.' }, 400);
  }
  if (!isValidEmail(email)) {
    return c.json({ error: 'E-mail inválido.' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: 'A senha deve ter pelo menos 6 caracteres.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM clients WHERE email = ?')
    .bind(email)
    .first();

  if (existing) {
    return c.json({ error: 'Já existe um cliente cadastrado com este e-mail.' }, 409);
  }

  const passwordHash = await hashPassword(password);

  const inserted = await c.env.DB.prepare(
    'INSERT INTO clients (name, email, password_hash) VALUES (?, ?, ?) RETURNING id, name, email, created_at'
  )
    .bind(name, email, passwordHash)
    .first();

  return c.json(inserted, 201);
});

// POST /clients/login (e alias POST /login) - Autenticar cliente com e-mail e senha
async function handleClientLogin(c) {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Corpo da requisição JSON inválido.' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!isValidEmail(email) || password.length === 0) {
    return c.json({ error: 'Informe e-mail e senha válidos.' }, 400);
  }

  const client = await c.env.DB.prepare(
    'SELECT id, name, email, password_hash, created_at FROM clients WHERE email = ?'
  )
    .bind(email)
    .first();

  if (!client) {
    return c.json({ error: 'E-mail ou senha inválidos.' }, 401);
  }

  const isPasswordValid = await verifyPassword(password, client.password_hash);
  if (!isPasswordValid) {
    return c.json({ error: 'E-mail ou senha inválidos.' }, 401);
  }

  return c.json(
    {
      id: client.id,
      name: client.name,
      email: client.email,
      created_at: client.created_at,
    },
    200
  );
}

app.post('/clients/login', handleClientLogin);
app.post('/login', handleClientLogin);

// GET /clients - Listar clientes
app.get('/clients', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, email, created_at FROM clients ORDER BY id ASC'
  ).all();

  return c.json(results, 200);
});

// GET /clients/:id - Consultar cliente por ID
app.get('/clients/:id', async (c) => {
  const id = parsePositiveInt(c.req.param('id'));
  if (!id) {
    return c.json({ error: 'ID do cliente inválido.' }, 400);
  }

  const client = await c.env.DB.prepare(
    'SELECT id, name, email, created_at FROM clients WHERE id = ?'
  )
    .bind(id)
    .first();

  if (!client) {
    return c.json({ error: 'Cliente não encontrado.' }, 404);
  }

  return c.json(client, 200);
});

// PUT /clients/:id - Atualizar cadastro
app.put('/clients/:id', async (c) => {
  const id = parsePositiveInt(c.req.param('id'));
  if (!id) {
    return c.json({ error: 'ID do cliente inválido.' }, 400);
  }

  const existingClient = await c.env.DB.prepare(
    'SELECT id, name, email, password_hash, created_at FROM clients WHERE id = ?'
  )
    .bind(id)
    .first();

  if (!existingClient) {
    return c.json({ error: 'Cliente não encontrado.' }, 404);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Corpo da requisição JSON inválido.' }, 400);
  }

  const name =
    body.name !== undefined
      ? typeof body.name === 'string'
        ? body.name.trim()
        : ''
      : existingClient.name;

  const email =
    body.email !== undefined
      ? typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : ''
      : existingClient.email;

  if (name.length < 2) {
    return c.json({ error: 'O nome deve ter pelo menos 2 caracteres.' }, 400);
  }
  if (!isValidEmail(email)) {
    return c.json({ error: 'E-mail inválido.' }, 400);
  }

  if (email !== existingClient.email) {
    const emailInUse = await c.env.DB.prepare(
      'SELECT id FROM clients WHERE email = ? AND id != ?'
    )
      .bind(email, id)
      .first();

    if (emailInUse) {
      return c.json({ error: 'Este e-mail já está em uso por outro cliente.' }, 409);
    }
  }

  let passwordHash = existingClient.password_hash;
  if (body.password !== undefined && body.password !== '') {
    if (typeof body.password !== 'string' || body.password.length < 6) {
      return c.json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' }, 400);
    }
    passwordHash = await hashPassword(body.password);
  }

  const updated = await c.env.DB.prepare(
    'UPDATE clients SET name = ?, email = ?, password_hash = ? WHERE id = ? RETURNING id, name, email, created_at'
  )
    .bind(name, email, passwordHash, id)
    .first();

  return c.json(updated, 200);
});

// DELETE /clients/:id - Excluir cliente
app.delete('/clients/:id', async (c) => {
  const id = parsePositiveInt(c.req.param('id'));
  if (!id) {
    return c.json({ error: 'ID do cliente inválido.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM clients WHERE id = ?')
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: 'Cliente não encontrado.' }, 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM favorites WHERE client_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(id),
  ]);

  return c.json({ message: 'Cliente excluído com sucesso.' }, 200);
});

// ============================================================================
// 3.2 INTEGRAÇÃO COM FAKE STORE API (3 endpoints)
// ============================================================================

// GET /products - Listar produtos externos
app.get('/products', async (c) => {
  const products = await getAllProducts();
  return c.json(products, 200);
});

// GET /products/:id - Consultar produto específico
app.get('/products/:id', async (c) => {
  const id = parsePositiveInt(c.req.param('id'));
  if (!id) {
    return c.json({ error: 'ID do produto inválido.' }, 400);
  }

  const product = await getProductById(id);
  if (!product) {
    return c.json({ error: 'Produto não encontrado na Fake Store API.' }, 404);
  }

  return c.json(product, 200);
});

// GET /categories - Listar categorias
app.get('/categories', async (c) => {
  const categories = await getCategories();
  return c.json(categories, 200);
});

// ============================================================================
// 3.3 GERENCIAMENTO DE FAVORITOS (3 endpoints)
// ============================================================================

// POST /clients/:id/favorites - Adicionar produto aos favoritos
app.post('/clients/:id/favorites', async (c) => {
  const clientId = parsePositiveInt(c.req.param('id'));
  if (!clientId) {
    return c.json({ error: 'ID do cliente inválido.' }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const rawProductId = body?.product_id ?? body?.productId;
  const productId = parsePositiveInt(String(rawProductId));

  if (!productId) {
    return c.json({ error: 'Informe um product_id numérico válido.' }, 400);
  }

  // 1. Verifica se o cliente existe
  const client = await c.env.DB.prepare('SELECT id FROM clients WHERE id = ?')
    .bind(clientId)
    .first();

  if (!client) {
    return c.json({ error: 'Cliente não encontrado.' }, 404);
  }

  // 2. Verifica se o produto já está nos favoritos deste cliente
  const alreadyFavorited = await c.env.DB.prepare(
    'SELECT id FROM favorites WHERE client_id = ? AND product_id = ?'
  )
    .bind(clientId, productId)
    .first();

  if (alreadyFavorited) {
    return c.json(
      { error: 'Este produto já está na lista de favoritos do cliente.' },
      409
    );
  }

  // 3. Valida se o produto existe na Fake Store API
  const product = await getProductById(productId);
  if (!product) {
    return c.json({ error: 'Produto não encontrado na Fake Store API.' }, 404);
  }

  // 4. Persiste o relacionamento no D1
  const favorite = await c.env.DB.prepare(
    'INSERT INTO favorites (client_id, product_id) VALUES (?, ?) RETURNING id, client_id, product_id, created_at'
  )
    .bind(clientId, productId)
    .first();

  return c.json(
    {
      ...favorite,
      product,
    },
    201
  );
});

// GET /clients/:id/favorites - Listar favoritos do cliente
app.get('/clients/:id/favorites', async (c) => {
  const clientId = parsePositiveInt(c.req.param('id'));
  if (!clientId) {
    return c.json({ error: 'ID do cliente inválido.' }, 400);
  }

  const client = await c.env.DB.prepare(
    'SELECT id, name, email FROM clients WHERE id = ?'
  )
    .bind(clientId)
    .first();

  if (!client) {
    return c.json({ error: 'Cliente não encontrado.' }, 404);
  }

  const { results: favorites } = await c.env.DB.prepare(
    'SELECT id, client_id, product_id, created_at FROM favorites WHERE client_id = ? ORDER BY created_at DESC'
  )
    .bind(clientId)
    .all();

  if (favorites.length === 0) {
    return c.json({ client, favorites: [] }, 200);
  }

  const allProducts = await getAllProducts();
  const productMap = new Map(allProducts.map((p) => [p.id, p]));

  const enrichedFavorites = favorites.map((fav) => ({
    favorite_id: fav.id,
    client_id: fav.client_id,
    product_id: fav.product_id,
    favorited_at: fav.created_at,
    product: productMap.get(fav.product_id) ?? null,
  }));

  return c.json(
    {
      client,
      favorites: enrichedFavorites,
    },
    200
  );
});

// DELETE /clients/:id/favorites/:productId - Remover produto dos favoritos
app.delete('/clients/:id/favorites/:productId', async (c) => {
  const clientId = parsePositiveInt(c.req.param('id'));
  const productId = parsePositiveInt(c.req.param('productId'));

  if (!clientId || !productId) {
    return c.json({ error: 'IDs de cliente ou produto inválidos.' }, 400);
  }

  const client = await c.env.DB.prepare('SELECT id FROM clients WHERE id = ?')
    .bind(clientId)
    .first();

  if (!client) {
    return c.json({ error: 'Cliente não encontrado.' }, 404);
  }

  const result = await c.env.DB.prepare(
    'DELETE FROM favorites WHERE client_id = ? AND product_id = ?'
  )
    .bind(clientId, productId)
    .run();

  if (!result.meta.changes || result.meta.changes === 0) {
    return c.json(
      { error: 'Este produto não está nos favoritos deste cliente.' },
      404
    );
  }

  return c.json({ message: 'Produto removido dos favoritos com sucesso.' }, 200);
});

// ============================================================================
// TRATAMENTO GLOBAL DE ERROS E 404
// ============================================================================

app.notFound((c) => {
  return c.json({ error: 'Rota não encontrada.' }, 404);
});

app.onError((err, c) => {
  console.error(err);

  if (err instanceof ExternalApiError) {
    return c.json({ error: err.message }, 502);
  }

  if (err.message?.includes('UNIQUE constraint failed')) {
    return c.json({ error: 'Registro duplicado violando restrição única.' }, 409);
  }

  return c.json({ error: 'Erro interno no servidor.' }, 500);
});

export default app;