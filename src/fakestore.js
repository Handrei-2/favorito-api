const BASE_URL = 'https://fakestoreapi.com';

export class ExternalApiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExternalApiError';
  }
}

export async function getAllProducts() {
  const res = await fetch(`${BASE_URL}/products`);
  if (!res.ok) {
    throw new ExternalApiError('Falha ao consultar produtos na Fake Store API.');
  }
  return await res.json();
}

export async function getProductById(id) {
  const res = await fetch(`${BASE_URL}/products/${id}`);
  if (!res.ok) {
    throw new ExternalApiError('Falha ao consultar produto na Fake Store API.');
  }

  // A Fake Store API retorna 200 OK com corpo vazio quando o produto nao existe
  const rawBody = await res.text();
  if (!rawBody.trim()) {
    return null;
  }

  return JSON.parse(rawBody);
}

export async function getCategories() {
  const res = await fetch(`${BASE_URL}/products/categories`);
  if (!res.ok) {
    throw new ExternalApiError('Falha ao consultar categorias na Fake Store API.');
  }
  return await res.json();
}
