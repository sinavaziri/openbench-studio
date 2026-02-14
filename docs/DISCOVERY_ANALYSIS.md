# Model and Benchmark Discovery Analysis

**Analyzed:** 2026-02-14  
**Scope:** OpenBench Studio discovery system architecture

---

## Table of Contents
1. [Backend Model Discovery](#1-backend-model-discovery)
2. [Backend Benchmark Discovery](#2-backend-benchmark-discovery)
3. [Frontend Display](#3-frontend-display)
4. [Model-Benchmark Compatibility](#4-model-benchmark-compatibility)
5. [Architectural Observations](#5-architectural-observations)

---

## 1. Backend Model Discovery

### 1.1 Core Implementation

**Primary File:** `backend/app/services/model_discovery.py`

The `ModelDiscoveryService` class (lines 51-253) handles dynamic model discovery from provider APIs.

### 1.2 Supported Providers

**Provider Configurations** (lines 63-107):

| Provider | API Base URL | Endpoint | Auth Method |
|----------|-------------|----------|-------------|
| `openai` | `https://api.openai.com` | `/v1/models` | Bearer token |
| `google` | `https://generativelanguage.googleapis.com` | `/v1/models` | `x-goog-api-key` header |
| `mistral` | `https://api.mistral.ai` | `/v1/models` | Bearer token |
| `groq` | `https://api.groq.com/openai` | `/v1/models` | Bearer token |
| `together` | `https://api.together.xyz` | `/v1/models` | Bearer token |
| `cohere` | `https://api.cohere.ai` | `/v1/models` | Bearer token |
| `fireworks` | `https://api.fireworks.ai/inference` | `/v1/models` | Bearer token |
| `openrouter` | `https://openrouter.ai/api` | `/v1/models` | Bearer token |
| `anthropic` | N/A | N/A | **Static list only** |

### 1.3 Discovery Flow

```
User Request → get_available_models()
                    │
                    ├── Check cache (1 hour TTL)
                    │
                    ├── Fetch user's API keys from DB
                    │
                    ├── For each key, parallel fetch from provider API
                    │       └── _fetch_provider_models()
                    │               ├── Static list (if use_static_list=True)
                    │               └── HTTP GET to provider's /models endpoint
                    │
                    └── Parse responses → Cache → Return
```

**Key Method:** `get_available_models()` (lines 131-178)

### 1.4 Model Discovery Per Provider

#### Dynamic Discovery (API-based)
Most providers support the `/v1/models` endpoint (OpenAI-compatible). The service:
1. Decrypts stored API key (`backend/app/services/api_keys.py`, lines 26-29)
2. Makes authenticated HTTP GET request
3. Parses response with `_parse_models_response()` (lines 215-265)

**Response Parsing Logic** (lines 220-265):
- Handles `{"data": [...]}` format (OpenAI, Mistral, Groq)
- Handles `{"models": [...]}` format (Google)
- Handles flat array `[...]` format
- Extracts `id`, `name`, `displayName`, `description` fields
- Prefixes model IDs with provider name (e.g., `openai/gpt-4o`)

**Google-specific filtering** (lines 237-240):
```python
if provider == "google":
    supported_methods = item.get("supportedGenerationMethods", [])
    if supported_methods and "generateContent" not in supported_methods:
        continue  # Skip embedding models
```

#### Static Discovery (Anthropic)
Anthropic uses a hardcoded list (lines 110-119):
```python
STATIC_MODELS: Dict[str, List[ModelInfo]] = {
    "anthropic": [
        ModelInfo(id="anthropic/claude-3-5-sonnet-20241022", ...),
        ModelInfo(id="anthropic/claude-3-opus-20240229", ...),
        # ... 8 models total
    ],
}
```

### 1.5 API Key Management

**File:** `backend/app/services/api_keys.py`  
**File:** `backend/app/api/routes/api_keys.py`

- Keys encrypted with AES-256 via Fernet (PBKDF2 derivation)
- 34 predefined providers in `PREDEFINED_PROVIDERS` (`backend/app/db/models.py`, lines 89-125)
- Custom providers supported with user-defined `custom_env_var`

**API Endpoint:** `GET /api/available-models` (routes/api_keys.py, lines 136-178)
- Requires authentication
- Optional `force_refresh=true` query param bypasses cache

### 1.6 Caching Strategy

- **Cache TTL:** 1 hour (3600 seconds) per user
- **Cache Key:** `models:{user_id}`
- **Invalidation:** `clear_cache()` method, or automatic on API key change

---

## 2. Backend Benchmark Discovery

### 2.1 Core Implementation

**Primary File:** `backend/app/services/benchmark_catalog.py`

The `BenchmarkCatalog` class (lines 51-381) implements multi-source benchmark discovery.

### 2.2 Discovery Sources (Priority Order)

1. **Python API** – Direct import from OpenBench/Inspect AI library
2. **GitHub Metadata** – REST API queries to `groq/openbench` repo
3. **CLI Discovery** – `bench list --all` subprocess
4. **Static Fallback** – Hardcoded featured benchmark list

### 2.3 Discovery Flow

```
get_benchmarks()
       │
       ├── Check cache (10 min TTL)
       │
       ├── Load featured benchmarks (always shown)
       │
       ├── Try Python API discovery
       │       └── inspect_ai._cli.list.list_benchmarks()
       │
       ├── Try GitHub metadata
       │       ├── GET github.com/repos/groq/openbench/contents/src/openbench
       │       └── Cache for 24 hours
       │
       ├── Try CLI discovery
       │       └── subprocess: bench list --all
       │
       └── Merge & dedupe → Cache → Return
```

### 2.4 Benchmark Metadata Structure

**Model:** `Benchmark` (backend/app/db/models.py, lines 361-377)

```python
class Benchmark(BaseModel):
    name: str                          # Unique identifier (e.g., "mmlu")
    category: str                      # Category (e.g., "knowledge", "coding")
    description_short: str             # One-line description
    description: Optional[str]         # Full description
    tags: list[str]                    # Categorization tags
    featured: bool                     # Show as featured card
    source: Optional[str]              # "builtin", "plugin", "github", "cli"
```

### 2.5 Featured Benchmarks (Static List)

**Method:** `_get_featured_benchmarks()` (lines 181-281)

10 featured benchmarks with rich metadata:
| Name | Category | Tags |
|------|----------|------|
| `mmlu` | knowledge | knowledge, reasoning, multi-subject |
| `humaneval` | coding | coding, python, generation |
| `gsm8k` | math | math, reasoning, word-problems |
| `hellaswag` | commonsense | commonsense, reasoning |
| `arc` | science | science, reasoning, multiple-choice |
| `truthfulqa` | safety | truthfulness, safety, qa |
| `winogrande` | commonsense | commonsense, reasoning, coreference |
| `mbpp` | coding | coding, python, generation |
| `drop` | reading | reading, reasoning, math |
| `bigbench` | diverse | diverse, reasoning, comprehensive |

Plus 25 additional non-featured benchmarks (lines 267-281).

### 2.6 Dynamic Discovery Details

#### Python API Discovery (lines 63-115)
```python
try:
    from inspect_ai._cli.list import list_benchmarks as inspect_list_benchmarks
    OPENBENCH_AVAILABLE = True
except ImportError:
    OPENBENCH_AVAILABLE = False
```
- Detects plugin-provided benchmarks via `is_plugin` or `source == "plugin"` fields

#### GitHub Discovery (lines 116-162)
- Scans `/src/openbench` directory for `.py` files
- Excludes `__init__.py` and underscore-prefixed files
- Attempts to fetch description from `/docs/benchmarks/{name}.md`
- Cache TTL: 24 hours

#### CLI Discovery (lines 164-220)
- Runs `bench list --all` with 30s timeout
- Parses multiple output formats:
  - JSON array (preferred)
  - ASCII table with box-drawing characters
  - Plain text table
- Validates benchmark IDs (3-50 chars, starts with lowercase)

### 2.7 Caching Strategy

- **Main Cache TTL:** 10 minutes (600 seconds)
- **GitHub Cache TTL:** 24 hours (86400 seconds)
- **Details Cache:** In-memory dict per benchmark name

---

## 3. Frontend Display

### 3.1 Model Display in NewRun.tsx

**File:** `frontend/src/pages/NewRun.tsx`

#### Model Loading (lines 91-107)
```typescript
const fetchModels = async () => {
  const response = await api.getAvailableModels();
  setModelProviders(response.providers);
};
```

#### Model Selector UI (lines 233-275)
- Grouped `<select>` with `<optgroup>` per provider
- Shows model name and description
- "Custom model..." option always available
- Displays loading state and error messages

**Key State:**
```typescript
const [modelProviders, setModelProviders] = useState<ModelProvider[]>([]);
const [model, setModel] = useState(prefillConfig?.model || '');
const [customModel, setCustomModel] = useState('');
```

#### No Filtering by Model Capability
The frontend displays **all models** from all providers without filtering. No capability-based matching exists.

### 3.2 Benchmark Display

**File:** `frontend/src/components/BenchmarkCatalog.tsx`

#### Features (lines 1-156)
- Search filter (name + description)
- Category dropdown filter
- Pagination (9 items per page)
- Selected state highlighting

**Filtering Logic (lines 30-45):**
```typescript
// Apply category filter
if (selectedCategory !== 'all') {
  filtered = filtered.filter(b => b.category === selectedCategory);
}

// Apply search filter
if (searchQuery.trim()) {
  const query = searchQuery.toLowerCase();
  filtered = filtered.filter(b =>
    b.name.toLowerCase().includes(query) ||
    b.description?.toLowerCase().includes(query)
  );
}
```

### 3.3 BenchmarkCard Component

**File:** `frontend/src/components/BenchmarkCard.tsx`

Displays:
- Category icon (from `utils/categoryIcons.tsx`)
- Benchmark name
- Source badge (for plugins)
- Category + first 2 tags
- Description (3 lines, truncated)
- Link to GitHub documentation

### 3.4 Category Icons

**File:** `frontend/src/utils/categoryIcons.tsx`

Maps categories to Lucide icons:
| Category | Icon |
|----------|------|
| knowledge | BookOpen |
| coding | Code |
| math | Calculator |
| science | Beaker |
| commonsense | Brain |
| safety | Shield |
| reading | FileText |
| diverse | Sparkles |
| (default) | Layers |

### 3.5 Provider Definitions (Frontend)

**File:** `frontend/src/data/providers.ts`

34 provider definitions with:
- `id`: Provider key (e.g., `"openai"`)
- `displayName`: Human-readable name
- `envVar`: Environment variable name
- `color`: Brand color (hex)

Used for consistent UI display across the application.

---

## 4. Model-Benchmark Compatibility

### 4.1 Current State: **No Compatibility Logic Exists**

After thorough analysis:

1. **No capability metadata** on models (vision, code, context length, etc.)
2. **No requirements metadata** on benchmarks (needs vision, code execution, etc.)
3. **No filtering** in UI or backend that matches models to benchmarks
4. **All models** are shown for **all benchmarks**

### 4.2 Benchmarks That Would Benefit From Filtering

Based on benchmark names and descriptions:

| Benchmark | Likely Requirement | Models Needed |
|-----------|-------------------|---------------|
| `mmmu` | Multimodal understanding | Vision models |
| `mathvista` | Mathematical visual reasoning | Vision models |
| `humaneval` | Code generation | Code-capable models |
| `mbpp` | Python programming | Code-capable models |

### 4.3 Missing Model Capability Data

The `ModelInfo` type only contains:
```typescript
interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}
```

No fields for:
- `supports_vision`
- `supports_code`
- `context_length`
- `supports_function_calling`

### 4.4 Missing Benchmark Requirement Data

The `Benchmark` type only contains:
```python
class Benchmark(BaseModel):
    name: str
    category: str
    description_short: str
    tags: list[str]  # Not used for capability matching
```

No fields for:
- `requires_vision`
- `requires_code_execution`
- `min_context_length`

---

## 5. Architectural Observations

### 5.1 Strengths

1. **Multi-source discovery** - Graceful fallback from Python API → GitHub → CLI → Static
2. **Caching** - Appropriate TTLs reduce API calls
3. **Parallel fetching** - `asyncio.gather()` for provider model fetching
4. **Encrypted key storage** - AES-256 for API keys at rest
5. **Plugin detection** - Can identify plugin-provided benchmarks

### 5.2 Gaps

1. **No model capability metadata** - Cannot determine which models support vision/code
2. **No benchmark requirements** - Cannot specify what capabilities a benchmark needs
3. **No compatibility filtering** - UI shows all models for all benchmarks
4. **Static Anthropic models** - Will become stale; no auto-discovery
5. **No model pricing data** - Cannot estimate costs before running

### 5.3 Potential Improvements

1. **Add model capabilities** to `ModelInfo`:
   ```python
   class ModelInfo(BaseModel):
       id: str
       name: str
       description: Optional[str]
       capabilities: List[str] = []  # ["vision", "code", "function_calling"]
       context_length: Optional[int] = None
   ```

2. **Add benchmark requirements** to `Benchmark`:
   ```python
   class Benchmark(BaseModel):
       name: str
       requires_capabilities: List[str] = []  # ["vision"]
       min_context_length: Optional[int] = None
   ```

3. **Compatibility filtering** in frontend:
   ```typescript
   const compatibleModels = allModels.filter(m => 
     benchmark.requires_capabilities.every(cap => 
       m.capabilities.includes(cap)
     )
   );
   ```

4. **Provider model refresh** - Endpoint to manually refresh Anthropic list

---

## Summary

| Component | Location | Key Logic Lines |
|-----------|----------|-----------------|
| Model Discovery Service | `backend/app/services/model_discovery.py` | 131-178 (main), 180-212 (fetch), 215-265 (parse) |
| API Key Service | `backend/app/services/api_keys.py` | 26-29 (encrypt), 33-36 (decrypt) |
| Model API Route | `backend/app/api/routes/api_keys.py` | 136-178 |
| Benchmark Catalog | `backend/app/services/benchmark_catalog.py` | 283-349 (main), 181-281 (featured) |
| Benchmark API Route | `backend/app/api/routes/benchmarks.py` | 21-58 (list), 61-90 (detail) |
| NewRun Page | `frontend/src/pages/NewRun.tsx` | 91-107 (fetch), 233-275 (selector) |
| Benchmark Catalog UI | `frontend/src/components/BenchmarkCatalog.tsx` | 30-45 (filter) |
| Provider Definitions | `frontend/src/data/providers.ts` | Full file |
| Benchmark Model | `backend/app/db/models.py` | 361-377 |
| Model Types | `frontend/src/api/client.ts` | 102-117 |

**Bottom Line:** The discovery system is well-architected for fetching models and benchmarks, but lacks the capability/requirement metadata needed for intelligent model-benchmark compatibility filtering.
