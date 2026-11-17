# API de Cadastro de Clientes e Gerenciamento de Produtos Favoritos

API REST desenvolvida com **JavaScript (ES Modules)** e **Hono**, hospedada no **Cloudflare Workers**, com persistência no **Cloudflare D1** e integração com a **Fake Store API**.

## URL da API Publicada
`https://clientes-favoritos-api.handreimendonca5.workers.dev`

## Tecnologias Utilizadas
- JavaScript (ES Modules) & Hono
- Cloudflare Workers & Wrangler
- Cloudflare D1 (SQLite distribuído)
- Web Crypto API (PBKDF2 + Salt para hash e verificação segura de senhas)
- Fake Store API

## Endpoints

### Clientes & Autenticação
| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `POST` | `/clients` | Cadastra um novo cliente (`name`, `email`, `password`) |
| `POST` | `/clients/login` | Autentica um cliente existente via `email` e `password` |
| `GET` | `/clients` | Lista todos os clientes cadastrados |
| `GET` | `/clients/:id` | Consulta um cliente específico por ID |
| `PUT` | `/clients/:id` | Atualiza dados de um cliente |
| `DELETE` | `/clients/:id` | Remove um cliente e seus favoritos |

### Produtos (Fake Store API)
| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/products` | Lista todos os produtos da Fake Store API |
| `GET` | `/products/:id` | Consulta detalhes de um produto por ID |
| `GET` | `/categories` | Lista todas as categorias disponíveis |

### Favoritos
| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `POST` | `/clients/:id/favorites` | Adiciona um produto (`product_id`) aos favoritos do cliente |
| `GET` | `/clients/:id/favorites` | Lista os favoritos de um cliente com dados do produto |
| `DELETE` | `/clients/:id/favorites/:productId` | Remove um produto dos favoritos do cliente |

## Como Configurar e Executar

1. **Instale as dependências:**
   ```bash
   npm install