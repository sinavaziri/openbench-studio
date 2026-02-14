# Model & Benchmark Discovery Implementation Plan

**Document Version:** 1.0  
**Created:** 2026-02-14  
**Status:** PLANNING  
**Estimated Total Effort:** 15-20 hours

---

## Executive Summary

This plan addresses the lack of intelligent model-benchmark compatibility matching in OpenBench Studio. Currently, all models are shown for all benchmarks without regard to capability requirements (e.g., vision benchmarks shown for text-only models). The implementation adds capability metadata to models, requirement metadata to benchmarks, and filtering logic to surface only compatible combinations.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Data Model Changes](#2-data-model-changes)
3. [Backend Changes](#3-backend-changes)
4. [Frontend Changes](#4-frontend-changes)
5. [Implementation Tasks](#5-implementation-tasks)
6. [Migration Strategy](#6-migration-strategy)
7. [Testing Plan](#7-testing-plan)

---

## 1. Current State Analysis

### 1.1 Current Model Discovery

**File:** `backend/app/services/model_discovery.py`

The `ModelInfo` class (line 19-22) currently has:
```python
class ModelInfo(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
```

**Gap:** No capability fields (vision, code, context length, function calling).

### 1.2 Current Benchmark Metadata

**File:** `backend/app/db/models.py` (lines 361-377)

The `Benchmark` class currently has:
```python
class Benchmark(BaseModel):
    name: str
    category: str
    description_short: str
    description: Optional[str] = None
    tags: list[str] = []
    featured: bool = False
    source: Optional[str] = None
```

**Gap:** No requirement fields (requires_vision, requires_code, min_context_length).

### 1.3 Current Frontend Behavior

**File:** `frontend/src/pages/NewRun.tsx` (lines 233-275)

All models from all providers are shown in a flat `<select>` with `<optgroup>` per provider. No filtering based on selected benchmark.

**File:** `frontend/src/components/BenchmarkCatalog.tsx` (lines 30-45)

Filtering only by category and text search. No filtering based on available model capabilities.

---

## 2. Data Model Changes

### 2.1 Extended ModelInfo (Backend)

**File to modify:** `backend/app/services/model_discovery.py`

```python
class ModelCapabilities(BaseModel):
    """Model capability flags for compatibility matching."""
    vision: bool = False              # Can process images
    code_execution: bool = False      # Has code interpreter
    function_calling: bool = False    # Supports function/tool calling
    json_mode: bool = False           # Supports structured JSON output
    streaming: bool = True            # Supports streaming responses
    
class ModelInfo(BaseModel):
    """Information about a single model."""
    id: str
    name: str
    description: Optional[str] = None
    context_length: Optional[int] = None  # Max tokens (input + output)
    capabilities: ModelCapabilities = ModelCapabilities()
    pricing: Optional[ModelPricing] = None  # Future: cost estimation
    
class ModelPricing(BaseModel):
    """Pricing information for cost estimation."""
    input_per_1m: Optional[float] = None   # $ per 1M input tokens
    output_per_1m: Optional[float] = None  # $ per 1M output tokens
    currency: str = "USD"
```

### 2.2 Extended Benchmark Model (Backend)

**File to modify:** `backend/app/db/models.py`

```python
class BenchmarkRequirements(BaseModel):
    """Required model capabilities to run this benchmark."""
    vision: bool = False               # Requires image processing
    code_execution: bool = False       # Requires code interpreter
    function_calling: bool = False     # Requires function/tool use
    min_context_length: Optional[int] = None  # Minimum context window
    
class Benchmark(BaseModel):
    """A benchmark definition."""
    name: str
    category: str
    description_short: str
    description: Optional[str] = None
    tags: list[str] = []
    featured: bool = False
    source: Optional[str] = None
    # NEW FIELDS
    requirements: BenchmarkRequirements = BenchmarkRequirements()
    estimated_tokens: Optional[int] = None  # Avg tokens per sample
    sample_count: Optional[int] = None      # Total samples in benchmark
```

### 2.3 Frontend Types

**File to modify:** `frontend/src/api/client.ts`

```typescript
// New interfaces (add after line 102)
export interface ModelCapabilities {
  vision: boolean;
  code_execution: boolean;
  function_calling: boolean;
  json_mode: boolean;
  streaming: boolean;
}

export interface ModelPricing {
  input_per_1m?: number;
  output_per_1m?: number;
  currency: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  capabilities: ModelCapabilities;
  pricing?: ModelPricing;
}

export interface BenchmarkRequirements {
  vision: boolean;
  code_execution: boolean;
  function_calling: boolean;
  min_context_length?: number;
}

export interface Benchmark {
  name: string;
  category: string;
  description_short: string;
  description?: string;
  tags: string[];
  featured?: boolean;
  source?: string;
  requirements: BenchmarkRequirements;
  estimated_tokens?: number;
  sample_count?: number;
}
```

---

## 3. Backend Changes

### 3.1 Model Capability Detection

**New file:** `backend/app/services/model_capabilities.py`

This service maps known models to their capabilities. Three sources:

1. **Static mapping** for well-known models (OpenAI, Anthropic, Google, etc.)
2. **Heuristic detection** from model names (e.g., "vision" in name → vision=true)
3. **Provider API metadata** when available (OpenAI returns some capability info)

```python
"""
Model capability detection and mapping.
"""
from typing import Dict, Optional
from app.services.model_discovery import ModelCapabilities

# Known model capabilities (provider/model-id → capabilities)
KNOWN_CAPABILITIES: Dict[str, ModelCapabilities] = {
    # OpenAI
    "openai/gpt-4o": ModelCapabilities(
        vision=True, function_calling=True, json_mode=True, context_length=128000
    ),
    "openai/gpt-4o-mini": ModelCapabilities(
        vision=True, function_calling=True, json_mode=True, context_length=128000
    ),
    "openai/gpt-4-turbo": ModelCapabilities(
        vision=True, function_calling=True, json_mode=True, context_length=128000
    ),
    "openai/gpt-4": ModelCapabilities(
        vision=False, function_calling=True, json_mode=True, context_length=8192
    ),
    "openai/o1": ModelCapabilities(
        vision=True, function_calling=False, json_mode=False, context_length=200000
    ),
    "openai/o1-mini": ModelCapabilities(
        vision=False, function_calling=False, json_mode=False, context_length=128000
    ),
    
    # Anthropic
    "anthropic/claude-3-5-sonnet-20241022": ModelCapabilities(
        vision=True, function_calling=True, json_mode=True, context_length=200000
    ),
    "anthropic/claude-3-opus-20240229": ModelCapabilities(
        vision=True, function_calling=True, json_mode=True, context_length=200000
    ),
    "anthropic/claude-3-sonnet-20240229": ModelCapabilities(
        vision=True, function_calling=True, json_mode=True, context_length=200000
    ),
    "anthropic/claude-3-haiku-20240307": ModelCapabilities(
        vision=True, function_calling=True, json_mode=True, context_length=200000
    ),
    
    # Google
    "google/gemini-1.5-pro": ModelCapabilities(
        vision=True, function_calling=True, json_mode=True, context_length=2000000
    ),
    "google/gemini-1.5-flash": ModelCapabilities(
        vision=True, function_calling=True, json_mode=True, context_length=1000000
    ),
    "google/gemini-2.0-flash-exp": ModelCapabilities(
        vision=True, function_calling=True, json_mode=True, context_length=1000000
    ),
    
    # ... additional models
}

def get_model_capabilities(model_id: str) -> ModelCapabilities:
    """
    Get capabilities for a model.
    
    Checks static mapping first, then applies heuristics.
    """
    # Normalize model ID
    model_id_lower = model_id.lower()
    
    # Check known models
    if model_id in KNOWN_CAPABILITIES:
        return KNOWN_CAPABILITIES[model_id]
    
    # Apply heuristics based on model name patterns
    caps = ModelCapabilities()
    
    # Vision detection
    if any(x in model_id_lower for x in ["vision", "4o", "gemini", "claude-3", "gpt-4-turbo"]):
        caps.vision = True
    
    # Function calling detection
    if any(x in model_id_lower for x in ["gpt-4", "gpt-3.5", "claude", "gemini"]):
        caps.function_calling = True
    
    # Context length heuristics
    if "32k" in model_id_lower:
        caps.context_length = 32000
    elif "128k" in model_id_lower:
        caps.context_length = 128000
    elif "200k" in model_id_lower:
        caps.context_length = 200000
    
    return caps

def enrich_model_with_capabilities(model: "ModelInfo") -> "ModelInfo":
    """Add capability information to a model."""
    caps = get_model_capabilities(model.id)
    model.capabilities = caps
    if caps.context_length:
        model.context_length = caps.context_length
    return model
```

### 3.2 Benchmark Requirements Data

**File to modify:** `backend/app/services/benchmark_catalog.py`

Add requirements to `_get_featured_benchmarks()` (line 181+):

```python
BENCHMARK_REQUIREMENTS: Dict[str, BenchmarkRequirements] = {
    # Vision benchmarks
    "mmmu": BenchmarkRequirements(vision=True),
    "mathvista": BenchmarkRequirements(vision=True),
    "docvqa": BenchmarkRequirements(vision=True),
    "chartqa": BenchmarkRequirements(vision=True),
    "ai2d": BenchmarkRequirements(vision=True),
    "realworldqa": BenchmarkRequirements(vision=True),
    "ocrbench": BenchmarkRequirements(vision=True),
    
    # Coding benchmarks (might need code execution for full eval)
    "humaneval": BenchmarkRequirements(code_execution=False),  # Just generation
    "mbpp": BenchmarkRequirements(code_execution=False),
    "swe-bench": BenchmarkRequirements(code_execution=True),
    
    # Function calling benchmarks
    "bfcl": BenchmarkRequirements(function_calling=True),
    "nexus": BenchmarkRequirements(function_calling=True),
    "tau-bench": BenchmarkRequirements(function_calling=True),
    
    # Long context benchmarks
    "ruler": BenchmarkRequirements(min_context_length=128000),
    "needle": BenchmarkRequirements(min_context_length=128000),
    "longbench": BenchmarkRequirements(min_context_length=32000),
    
    # Standard benchmarks (no special requirements)
    "mmlu": BenchmarkRequirements(),
    "gsm8k": BenchmarkRequirements(),
    "hellaswag": BenchmarkRequirements(),
    "arc": BenchmarkRequirements(),
    "truthfulqa": BenchmarkRequirements(),
    "winogrande": BenchmarkRequirements(),
    "drop": BenchmarkRequirements(),
    "bigbench": BenchmarkRequirements(),
}

def get_benchmark_requirements(benchmark_name: str) -> BenchmarkRequirements:
    """Get requirements for a benchmark, with defaults."""
    return BENCHMARK_REQUIREMENTS.get(
        benchmark_name.lower(), 
        BenchmarkRequirements()  # Default: no special requirements
    )
```

### 3.3 Compatibility Filtering Endpoint

**File to modify:** `backend/app/api/routes/api_keys.py`

Add new endpoint after `get_available_models()` (line 178+):

```python
@router.get(
    "/compatible-models",
    summary="Get compatible models for a benchmark",
    description="Get models that are compatible with a specific benchmark based on capability requirements.",
)
async def get_compatible_models(
    benchmark: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get models compatible with a specific benchmark.
    
    Filters the user's available models to only those that meet
    the benchmark's capability requirements.
    
    **Parameters:**
    - **benchmark**: The benchmark name to check compatibility for
    
    **Returns:**
    - List of compatible models grouped by provider
    - Incompatibility reasons for filtered-out models
    """
    from app.services.benchmark_catalog import get_benchmark_requirements
    from app.services.model_capabilities import enrich_model_with_capabilities
    
    # Get all available models
    all_providers = await model_discovery_service.get_available_models(
        current_user.user_id
    )
    
    # Get benchmark requirements
    requirements = get_benchmark_requirements(benchmark)
    
    compatible_providers = []
    incompatible_models = []
    
    for provider in all_providers:
        compatible_models = []
        
        for model in provider.models:
            # Enrich with capabilities
            enriched = enrich_model_with_capabilities(model)
            
            # Check compatibility
            is_compatible, reason = check_compatibility(enriched, requirements)
            
            if is_compatible:
                compatible_models.append(enriched)
            else:
                incompatible_models.append({
                    "model_id": model.id,
                    "reason": reason
                })
        
        if compatible_models:
            compatible_providers.append(ModelProvider(
                name=provider.name,
                provider_key=provider.provider_key,
                models=compatible_models
            ))
    
    return {
        "providers": [p.dict() for p in compatible_providers],
        "incompatible": incompatible_models,
        "requirements": requirements.dict()
    }


def check_compatibility(
    model: ModelInfo, 
    requirements: BenchmarkRequirements
) -> tuple[bool, Optional[str]]:
    """
    Check if a model meets benchmark requirements.
    
    Returns (is_compatible, reason_if_not).
    """
    caps = model.capabilities
    
    if requirements.vision and not caps.vision:
        return False, "Requires vision capability"
    
    if requirements.code_execution and not caps.code_execution:
        return False, "Requires code execution"
    
    if requirements.function_calling and not caps.function_calling:
        return False, "Requires function calling"
    
    if requirements.min_context_length:
        model_ctx = model.context_length or 4096  # Conservative default
        if model_ctx < requirements.min_context_length:
            return False, f"Requires {requirements.min_context_length:,} context (model has {model_ctx:,})"
    
    return True, None
```

### 3.4 Enriched Models Endpoint

**File to modify:** `backend/app/api/routes/api_keys.py`

Modify existing `get_available_models()` to optionally include capabilities:

```python
@router.get("/available-models")
async def get_available_models(
    force_refresh: bool = False,
    include_capabilities: bool = False,  # NEW PARAM
    current_user: User = Depends(get_current_user)
):
    """
    Get all available models for the current user.
    
    **Parameters:**
    - **force_refresh**: Bypass cache and fetch fresh data
    - **include_capabilities**: Include capability metadata (vision, etc.)
    """
    providers = await model_discovery_service.get_available_models(
        current_user.user_id,
        force_refresh=force_refresh
    )
    
    if include_capabilities:
        from app.services.model_capabilities import enrich_model_with_capabilities
        for provider in providers:
            provider.models = [
                enrich_model_with_capabilities(m) for m in provider.models
            ]
    
    return {"providers": [p.dict() for p in providers]}
```

---

## 4. Frontend Changes

### 4.1 Model Selector with Compatibility Filtering

**File to modify:** `frontend/src/pages/NewRun.tsx`

Add compatibility-aware model fetching:

```typescript
// Add new state (after line 45)
const [compatibleProviders, setCompatibleProviders] = useState<ModelProvider[]>([]);
const [incompatibleModels, setIncompatibleModels] = useState<{model_id: string; reason: string}[]>([]);
const [showIncompatible, setShowIncompatible] = useState(false);

// Fetch compatible models when benchmark changes (new useEffect)
useEffect(() => {
  if (selectedBenchmark && isAuthenticated) {
    fetchCompatibleModels(selectedBenchmark.name);
  } else {
    // No benchmark selected - show all models
    setCompatibleProviders(modelProviders);
    setIncompatibleModels([]);
  }
}, [selectedBenchmark, modelProviders, isAuthenticated]);

const fetchCompatibleModels = async (benchmarkName: string) => {
  try {
    const response = await api.getCompatibleModels(benchmarkName);
    setCompatibleProviders(response.providers);
    setIncompatibleModels(response.incompatible);
  } catch (err) {
    console.error('Failed to fetch compatible models:', err);
    // Fallback to all models on error
    setCompatibleProviders(modelProviders);
    setIncompatibleModels([]);
  }
};
```

Update model selector UI (around line 250):

```typescript
{/* Model Selection */}
<div>
  <div className="flex items-center justify-between mb-4">
    <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
      Model
    </p>
    {selectedBenchmark && incompatibleModels.length > 0 && (
      <button
        type="button"
        onClick={() => setShowIncompatible(!showIncompatible)}
        className="text-[11px] text-muted-foreground hover:text-foreground"
      >
        {showIncompatible ? 'Hide' : 'Show'} {incompatibleModels.length} incompatible
      </button>
    )}
  </div>
  
  {selectedBenchmark?.requirements && (
    <div className="mb-3 flex flex-wrap gap-2">
      {selectedBenchmark.requirements.vision && (
        <span className="px-2 py-1 text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
          📷 Requires Vision
        </span>
      )}
      {selectedBenchmark.requirements.function_calling && (
        <span className="px-2 py-1 text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded">
          🔧 Requires Function Calling
        </span>
      )}
      {selectedBenchmark.requirements.min_context_length && (
        <span className="px-2 py-1 text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 rounded">
          📏 {(selectedBenchmark.requirements.min_context_length / 1000).toFixed(0)}K+ Context
        </span>
      )}
    </div>
  )}

  <select
    value={model}
    onChange={(e) => setModel(e.target.value)}
    disabled={modelsLoading}
    className="w-full px-4 py-3 bg-background border border-border-secondary ..."
  >
    <option value="" disabled>
      {selectedBenchmark 
        ? `Select a compatible model (${compatibleProviders.reduce((a, p) => a + p.models.length, 0)} available)...`
        : 'Select a model...'
      }
    </option>
    
    {compatibleProviders.map((provider) => (
      <optgroup key={provider.provider_key} label={provider.name}>
        {provider.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.capabilities?.vision && ' 📷'}
            {m.capabilities?.function_calling && ' 🔧'}
            {m.context_length && ` (${(m.context_length/1000).toFixed(0)}K)`}
          </option>
        ))}
      </optgroup>
    ))}
    
    <option value="custom">Custom model...</option>
  </select>
  
  {/* Incompatible models warning */}
  {showIncompatible && incompatibleModels.length > 0 && (
    <div className="mt-3 p-3 bg-warning-bg/50 border border-warning-border rounded">
      <p className="text-[12px] text-warning mb-2">
        Incompatible models for {selectedBenchmark?.name}:
      </p>
      <ul className="text-[11px] text-muted-foreground space-y-1">
        {incompatibleModels.slice(0, 5).map((m) => (
          <li key={m.model_id}>
            <span className="text-muted">{m.model_id}</span>
            <span className="text-warning-foreground ml-2">— {m.reason}</span>
          </li>
        ))}
        {incompatibleModels.length > 5 && (
          <li className="text-muted">... and {incompatibleModels.length - 5} more</li>
        )}
      </ul>
    </div>
  )}
</div>
```

### 4.2 API Client Updates

**File to modify:** `frontend/src/api/client.ts`

Add new API method (after `getAvailableModels()`):

```typescript
async getCompatibleModels(benchmark: string): Promise<{
  providers: ModelProvider[];
  incompatible: { model_id: string; reason: string }[];
  requirements: BenchmarkRequirements;
}> {
  return this.request(`/compatible-models?benchmark=${encodeURIComponent(benchmark)}`, {}, true);
}

async getAvailableModels(
  forceRefresh: boolean = false, 
  includeCapabilities: boolean = false
): Promise<AvailableModelsResponse> {
  const params = new URLSearchParams();
  if (forceRefresh) params.set('force_refresh', 'true');
  if (includeCapabilities) params.set('include_capabilities', 'true');
  const query = params.toString();
  return this.request<AvailableModelsResponse>(`/available-models${query ? `?${query}` : ''}`, {}, true);
}
```

### 4.3 Benchmark Card Capability Badges

**File to modify:** `frontend/src/components/BenchmarkCard.tsx`

Add requirement indicators:

```typescript
// After the category badge (around line 35)
{benchmark.requirements && (
  <div className="flex gap-1 mt-2">
    {benchmark.requirements.vision && (
      <span 
        className="w-5 h-5 flex items-center justify-center bg-blue-500/10 rounded"
        title="Requires vision-capable model"
      >
        📷
      </span>
    )}
    {benchmark.requirements.function_calling && (
      <span 
        className="w-5 h-5 flex items-center justify-center bg-purple-500/10 rounded"
        title="Requires function calling"
      >
        🔧
      </span>
    )}
    {benchmark.requirements.code_execution && (
      <span 
        className="w-5 h-5 flex items-center justify-center bg-green-500/10 rounded"
        title="Requires code execution"
      >
        💻
      </span>
    )}
    {benchmark.requirements.min_context_length && (
      <span 
        className="w-5 h-5 flex items-center justify-center bg-yellow-500/10 rounded text-[8px]"
        title={`Requires ${benchmark.requirements.min_context_length.toLocaleString()}+ context length`}
      >
        {Math.round(benchmark.requirements.min_context_length / 1000)}K
      </span>
    )}
  </div>
)}
```

### 4.4 BenchmarkCatalog Filtering by Model Capabilities

**File to modify:** `frontend/src/components/BenchmarkCatalog.tsx`

Add capability filtering:

```typescript
// Add new props
interface BenchmarkCatalogProps {
  benchmarks: Benchmark[];
  onBenchmarkSelect: (benchmark: Benchmark) => void;
  selectedBenchmark?: Benchmark;
  availableCapabilities?: ModelCapabilities;  // NEW: from user's models
}

// Add capability filter state (after line 22)
const [capabilityFilter, setCapabilityFilter] = useState<'all' | 'compatible'>('all');

// Modify filtering logic (line 30)
const filteredBenchmarks = useMemo(() => {
  let filtered = benchmarks;

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

  // NEW: Apply capability filter
  if (capabilityFilter === 'compatible' && availableCapabilities) {
    filtered = filtered.filter(b => {
      const reqs = b.requirements;
      if (!reqs) return true;
      
      if (reqs.vision && !availableCapabilities.vision) return false;
      if (reqs.function_calling && !availableCapabilities.function_calling) return false;
      if (reqs.code_execution && !availableCapabilities.code_execution) return false;
      // Context length check would need aggregated max from all models
      
      return true;
    });
  }

  return filtered;
}, [benchmarks, selectedCategory, searchQuery, capabilityFilter, availableCapabilities]);
```

---

## 5. Implementation Tasks

### Task 1: Backend Data Models & Capability Service
**Complexity:** Medium  
**Estimated Time:** 4-5 hours  
**Dependencies:** None

**Files to create/modify:**
- [ ] Create `backend/app/services/model_capabilities.py`
  - `ModelCapabilities` Pydantic model
  - `KNOWN_CAPABILITIES` dictionary (50+ models)
  - `get_model_capabilities()` function
  - `enrich_model_with_capabilities()` function

- [ ] Modify `backend/app/services/model_discovery.py`
  - Update `ModelInfo` with `capabilities` and `context_length` fields
  - Add `ModelPricing` model (for future)

- [ ] Modify `backend/app/db/models.py`
  - Add `BenchmarkRequirements` model
  - Update `Benchmark` model with `requirements` field

- [ ] Modify `backend/app/services/benchmark_catalog.py`
  - Add `BENCHMARK_REQUIREMENTS` dictionary
  - Update `_get_featured_benchmarks()` to include requirements
  - Add `get_benchmark_requirements()` function

### Task 2: Backend API Endpoints
**Complexity:** Small  
**Estimated Time:** 2-3 hours  
**Dependencies:** Task 1

**Files to modify:**
- [ ] `backend/app/api/routes/api_keys.py`
  - Add `include_capabilities` param to `get_available_models()`
  - Add new `/compatible-models` endpoint
  - Add `check_compatibility()` helper

- [ ] `backend/app/api/routes/benchmarks.py`
  - Ensure requirements are included in benchmark responses

### Task 3: Frontend Type Updates & API Client
**Complexity:** Small  
**Estimated Time:** 1-2 hours  
**Dependencies:** Task 2

**Files to modify:**
- [ ] `frontend/src/api/client.ts`
  - Add `ModelCapabilities` interface
  - Add `BenchmarkRequirements` interface
  - Update `ModelInfo` interface
  - Update `Benchmark` interface
  - Add `getCompatibleModels()` method

### Task 4: Frontend UI - Model Selector
**Complexity:** Medium  
**Estimated Time:** 3-4 hours  
**Dependencies:** Task 3

**Files to modify:**
- [ ] `frontend/src/pages/NewRun.tsx`
  - Add compatibility state (`compatibleProviders`, `incompatibleModels`)
  - Add `fetchCompatibleModels()` function
  - Update model selector to use compatible models
  - Add requirement badges above selector
  - Add incompatible models toggle/list

### Task 5: Frontend UI - Benchmark Cards & Catalog
**Complexity:** Small-Medium  
**Estimated Time:** 2-3 hours  
**Dependencies:** Task 3

**Files to modify:**
- [ ] `frontend/src/components/BenchmarkCard.tsx`
  - Add requirement indicator badges (📷 🔧 💻)

- [ ] `frontend/src/components/BenchmarkCatalog.tsx`
  - Add optional capability filtering
  - Add "Show compatible only" toggle

---

## 6. Migration Strategy

### 6.1 Backward Compatibility

All changes are **additive** and **backward compatible**:

- New fields have defaults (`capabilities = ModelCapabilities()`)
- Existing API responses remain valid
- Frontend gracefully handles missing fields

### 6.2 Rollout Phases

**Phase 1: Backend (Tasks 1-2)**
- Deploy backend with new fields
- Existing frontend continues to work
- New fields returned but ignored

**Phase 2: Frontend (Tasks 3-5)**
- Deploy frontend updates
- Users see capability badges and filtering
- Fallback to "all models" if API errors

### 6.3 Data Population

Model capabilities are populated via:
1. Static `KNOWN_CAPABILITIES` dictionary (immediate)
2. Heuristic detection from model names (immediate)
3. Future: Provider API metadata parsing (enhancement)

Benchmark requirements are populated via:
1. Static `BENCHMARK_REQUIREMENTS` dictionary (immediate)
2. Future: Parse from benchmark YAML/metadata files

---

## 7. Testing Plan

### 7.1 Unit Tests

**File:** `backend/tests/test_model_capabilities.py`
```python
def test_known_model_capabilities():
    """Test capabilities for known models."""
    caps = get_model_capabilities("openai/gpt-4o")
    assert caps.vision == True
    assert caps.function_calling == True
    
def test_heuristic_vision_detection():
    """Test vision detection from model name."""
    caps = get_model_capabilities("some-provider/model-vision-large")
    assert caps.vision == True
    
def test_compatibility_check():
    """Test model-benchmark compatibility."""
    model = ModelInfo(
        id="test/no-vision",
        name="No Vision Model",
        capabilities=ModelCapabilities(vision=False)
    )
    reqs = BenchmarkRequirements(vision=True)
    
    is_compat, reason = check_compatibility(model, reqs)
    assert is_compat == False
    assert "vision" in reason.lower()
```

### 7.2 Integration Tests

**File:** `backend/tests/test_compatible_models_api.py`
```python
async def test_get_compatible_models_filters_correctly():
    """Test /compatible-models endpoint."""
    # Setup: user has vision and non-vision models
    # Request: compatible models for mmmu (vision benchmark)
    # Assert: only vision models returned
    
async def test_get_available_models_with_capabilities():
    """Test include_capabilities parameter."""
    response = await client.get(
        "/available-models?include_capabilities=true",
        headers=auth_headers
    )
    model = response["providers"][0]["models"][0]
    assert "capabilities" in model
```

### 7.3 Frontend Tests

**File:** `frontend/src/pages/NewRun.test.tsx`
```typescript
test('filters models when benchmark selected', async () => {
  // Mock: benchmark with vision requirement
  // Mock: API returns filtered models
  // Assert: only compatible models shown in selector
});

test('shows incompatible models count', async () => {
  // Mock: 3 incompatible models
  // Assert: "Show 3 incompatible" button visible
});
```

---

## Appendix A: Known Model Capabilities Reference

| Model | Vision | Function Calling | Context |
|-------|--------|-----------------|---------|
| openai/gpt-4o | ✅ | ✅ | 128K |
| openai/gpt-4o-mini | ✅ | ✅ | 128K |
| openai/gpt-4-turbo | ✅ | ✅ | 128K |
| openai/gpt-4 | ❌ | ✅ | 8K |
| openai/gpt-3.5-turbo | ❌ | ✅ | 16K |
| openai/o1 | ✅ | ❌ | 200K |
| openai/o1-mini | ❌ | ❌ | 128K |
| anthropic/claude-3.5-sonnet | ✅ | ✅ | 200K |
| anthropic/claude-3-opus | ✅ | ✅ | 200K |
| anthropic/claude-3-sonnet | ✅ | ✅ | 200K |
| anthropic/claude-3-haiku | ✅ | ✅ | 200K |
| google/gemini-1.5-pro | ✅ | ✅ | 2M |
| google/gemini-1.5-flash | ✅ | ✅ | 1M |
| mistral/mistral-large | ❌ | ✅ | 128K |
| mistral/pixtral-12b | ✅ | ✅ | 128K |

## Appendix B: Benchmark Requirements Reference

| Benchmark | Vision | Function Calling | Min Context |
|-----------|--------|-----------------|-------------|
| mmmu | ✅ | ❌ | - |
| mathvista | ✅ | ❌ | - |
| docvqa | ✅ | ❌ | - |
| chartqa | ✅ | ❌ | - |
| bfcl | ❌ | ✅ | - |
| tau-bench | ❌ | ✅ | - |
| ruler | ❌ | ❌ | 128K |
| needle | ❌ | ❌ | 128K |
| longbench | ❌ | ❌ | 32K |
| mmlu | ❌ | ❌ | - |
| gsm8k | ❌ | ❌ | - |
| humaneval | ❌ | ❌ | - |

---

*End of Implementation Plan*
