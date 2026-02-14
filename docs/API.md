# OpenBench Studio API Documentation

## Overview

OpenBench Studio provides a REST API for running and managing LLM benchmarks. The API is built with FastAPI and includes auto-generated interactive documentation.

### Interactive Documentation

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **OpenAPI JSON**: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)

When running via Docker (nginx proxy), use port 3000 instead.

## API Version

**Current Version:** 1.0.0

All endpoints are prefixed with `/api` (e.g., `/api/runs`, `/api/auth/login`).

## Authentication

OpenBench Studio uses JWT (JSON Web Token) bearer authentication.

### Getting a Token

1. **Register** a new account:
   ```bash
   curl -X POST http://localhost:8000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email": "user@example.com", "password": "securepassword"}'
   ```

2. Or **login** to an existing account:
   ```bash
   curl -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "user@example.com", "password": "securepassword"}'
   ```

Both return a JWT token:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### Using the Token

Include the token in the `Authorization` header:
```bash
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <your_access_token>"
```

### Token Expiration

Tokens are valid for **7 days**. After expiration, you'll need to login again.

## Endpoints

### Health & Status

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/health` | Health check | No |
| GET | `/api/version` | Version info | No |

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Create account | No |
| POST | `/api/auth/login` | Login | No |
| GET | `/api/auth/me` | Get profile | Yes |

### API Keys

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/api-keys` | List your API keys | Yes |
| POST | `/api/api-keys` | Add/update API key | Yes |
| DELETE | `/api/api-keys/{provider}` | Delete API key | Yes |
| GET | `/api/api-keys/providers` | List supported providers | No |
| GET | `/api/available-models` | Get available models | Yes |

### Benchmarks

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/benchmarks` | List all benchmarks | No |
| GET | `/api/benchmarks/{name}` | Get benchmark details | No |

### Runs

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/runs` | Create new run | Yes |
| GET | `/api/runs` | List runs | Optional |
| GET | `/api/runs/tags` | List all tags | Optional |
| GET | `/api/runs/{run_id}` | Get run details | Optional |
| POST | `/api/runs/{run_id}/cancel` | Cancel run | Yes |
| DELETE | `/api/runs/{run_id}` | Delete run | Yes |
| POST | `/api/runs/bulk-delete` | Bulk delete | Yes |
| PATCH | `/api/runs/{run_id}/tags` | Update tags | Yes |
| GET | `/api/runs/{run_id}/events` | SSE stream | No |
| GET | `/api/runs/{run_id}/artifacts/{path}` | Download artifact | Optional |
| GET | `/api/runs/{run_id}/eval-data/{path}` | Get parsed eval | Optional |

## Common Workflows

### Running a Benchmark

1. **Configure an API key** for your provider:
   ```bash
   curl -X POST http://localhost:8000/api/api-keys \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"provider": "openai", "key": "sk-..."}'
   ```

2. **Create a run**:
   ```bash
   curl -X POST http://localhost:8000/api/runs \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "benchmark": "mmlu",
       "model": "openai/gpt-4o",
       "limit": 10
     }'
   ```

3. **Monitor progress** (JavaScript):
   ```javascript
   const events = new EventSource('/api/runs/{run_id}/events');
   
   events.addEventListener('progress', (e) => {
     const data = JSON.parse(e.data);
     console.log(`Progress: ${data.percentage}%`);
   });
   
   events.addEventListener('completed', (e) => {
     console.log('Run completed!');
     events.close();
   });
   ```

4. **Get results**:
   ```bash
   curl http://localhost:8000/api/runs/{run_id}
   ```

### Server-Sent Events (SSE)

The `/api/runs/{run_id}/events` endpoint streams real-time updates:

| Event | Description | Data Fields |
|-------|-------------|-------------|
| `status` | Status changed | `status`, `timestamp` |
| `log_line` | New log output | `stream`, `line` |
| `progress` | Progress update | `percentage`, `current`, `total` |
| `completed` | Run finished | `exit_code`, `finished_at` |
| `failed` | Run failed | `exit_code`, `error`, `finished_at` |
| `canceled` | Run canceled | `finished_at` |
| `heartbeat` | Keep-alive | `timestamp` |

## Error Responses

All errors return a structured response:

```json
{
  "detail": "Human-readable error message"
}
```

### Error Codes

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `RUN_STILL_RUNNING` | Cannot modify running benchmark |
| 400 | `RUN_NOT_RUNNING` | Run is not currently running |
| 400 | `AUTH_EMAIL_EXISTS` | Email already registered |
| 401 | `AUTH_REQUIRED` | Authentication required |
| 401 | `AUTH_INVALID_CREDENTIALS` | Wrong email/password |
| 403 | `AUTHZ_FORBIDDEN` | Access denied |
| 404 | `RESOURCE_NOT_FOUND` | Resource not found |
| 404 | `RUN_NOT_FOUND` | Run not found |
| 404 | `APIKEY_NOT_FOUND` | API key not found |
| 422 | `VALIDATION_ERROR` | Invalid request data |
| 500 | `SERVER_ERROR` | Internal server error |
| 502 | `EXTERNAL_SERVICE_ERROR` | External service error |

## Supported Providers

OpenBench Studio supports 30+ LLM providers:

| Provider | Environment Variable |
|----------|---------------------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google AI | `GOOGLE_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Together | `TOGETHER_API_KEY` |
| Fireworks | `FIREWORKS_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Cohere | `COHERE_API_KEY` |
| ... | ... |

See `/api/api-keys/providers` for the full list.

## Rate Limits

Currently no rate limits are enforced. Please be respectful of shared resources.

## CORS

CORS is configured for local development (Vite dev server on ports 5173-5178) and Docker deployments (port 3000). For production deployments, configure appropriate origins.

## Security Notes

- API keys are encrypted at rest using AES-256
- JWTs are signed with HS256
- Path traversal is prevented on artifact downloads
- All authentication uses secure password hashing (bcrypt)

## Client Libraries

While there's no official client library yet, you can generate one from the OpenAPI spec:

```bash
# Download the spec
curl http://localhost:8000/openapi.json > openapi.json

# Generate TypeScript client
npx openapi-typescript-codegen --input openapi.json --output ./client
```

## Examples

### cURL

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  | jq -r '.access_token')

# Create a run
RUN_ID=$(curl -s -X POST http://localhost:8000/api/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"benchmark":"mmlu","model":"openai/gpt-4o","limit":5}' \
  | jq -r '.run_id')

# Check status
curl http://localhost:8000/api/runs/$RUN_ID
```

### Python

```python
import requests

BASE_URL = "http://localhost:8000/api"

# Login
response = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "user@example.com",
    "password": "password"
})
token = response.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Create run
response = requests.post(f"{BASE_URL}/runs", headers=headers, json={
    "benchmark": "mmlu",
    "model": "openai/gpt-4o",
    "limit": 10
})
run_id = response.json()["run_id"]

# Monitor with SSE
import sseclient
response = requests.get(f"{BASE_URL}/runs/{run_id}/events", stream=True)
client = sseclient.SSEClient(response)
for event in client.events():
    print(f"{event.event}: {event.data}")
```

### JavaScript/TypeScript

```typescript
const BASE_URL = 'http://localhost:8000/api';

// Login
const loginRes = await fetch(`${BASE_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'password' })
});
const { access_token } = await loginRes.json();

// Create run
const runRes = await fetch(`${BASE_URL}/runs`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    benchmark: 'mmlu',
    model: 'openai/gpt-4o',
    limit: 10
  })
});
const { run_id } = await runRes.json();

// Monitor with SSE
const events = new EventSource(`${BASE_URL}/runs/${run_id}/events`);
events.addEventListener('completed', () => {
  console.log('Done!');
  events.close();
});
```
