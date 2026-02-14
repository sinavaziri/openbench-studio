# Model and Benchmark Discovery Research

**Research Date:** 2026-02-14  
**Purpose:** Best practices for model and benchmark discovery in LLM evaluation tools

---

## Table of Contents

1. [How Existing Tools Handle Discovery](#1-how-existing-tools-handle-discovery)
2. [Benchmark Metadata Standards](#2-benchmark-metadata-standards)
3. [Model Metadata Standards](#3-model-metadata-standards)
4. [Model-Benchmark Matching Strategies](#4-model-benchmark-matching-strategies)
5. [Recommendations for OpenBench Studio](#5-recommendations-for-openbench-studio)
6. [References](#6-references)

---

## 1. How Existing Tools Handle Discovery

### 1.1 Inspect AI (UK AISI)

**Repository:** https://github.com/UKGovernmentBEIS/inspect_ai  
**Documentation:** https://inspect.aisi.org.uk/

**Architecture:**
- **Task-based structure**: Evaluations are defined as `Task` objects combining datasets, solvers, and scorers
- **Registry pattern**: The `@task` decorator registers evaluations for CLI discovery
- **Modular components**: Datasets, solvers, and scorers can be mixed and matched

**Discovery Mechanism:**
```python
@task
def theory_of_mind():
    return Task(
        dataset=example_dataset("theory_of_mind"),
        solver=[chain_of_thought(), generate(), self_critique()],
        scorer=model_graded_fact()
    )
```

**Key Features:**
- 100+ pre-built evaluations in `inspect_evals` repository
- Evaluations categorized by domain (Coding, Assistants, Cybersecurity, Knowledge, Reasoning, etc.)
- VS Code extension for browsing and running evals
- Log viewer with detailed metadata for debugging

**Model Support:**
- Unified interface for multiple providers (OpenAI, Anthropic, Google, Mistral, HuggingFace, vLLM, Ollama)
- Model specified via CLI: `--model openai/gpt-4o` or `--model anthropic/claude-sonnet-4-0`
- No explicit capability filtering—assumes user selects appropriate model

**Limitations:**
- No built-in model capability registry
- No automatic filtering of incompatible model-benchmark pairs
- Relies on user knowledge for matching

---

### 1.2 HELM (Stanford CRFM)

**Repository:** https://github.com/stanford-crfm/helm  
**Documentation:** https://crfm-helm.readthedocs.io/

**Architecture:**
- **Scenario-based**: Benchmarks defined as "Scenarios" with associated adapters and metrics
- **RunSpec pattern**: Combines scenario_spec, adapter_spec, and metric_specs
- **Suite organization**: Groups of scenarios run together for leaderboards

**Discovery Mechanism:**
- Scenarios registered in `src/helm/benchmark/scenarios/`
- Run entries defined in configuration files (e.g., `run_entries_core_scenarios.conf`)
- Programmatic: `helm-run --run-entries mmlu:subject=philosophy,model=openai/gpt2`

**Key Features:**
- Separate leaderboards for different capability domains:
  - **HELM Capabilities**: General knowledge, reasoning, instruction following, dialogue, math
  - **HELM Safety**: Safety-focused evaluations
  - **VHELM**: Vision-language models (extends to multimodal)
  - **HEIM**: Text-to-image models
  - **MedHELM**: Medical domain
- Multi-metric evaluation (accuracy, efficiency, bias, toxicity)
- Full prompt-level transparency in leaderboard results

**Model Organization:**
- Models accessed via unified interface (OpenAI, Anthropic, Google, Together AI, etc.)
- **Model metadata** includes provider info but not explicit capability declarations
- Separate leaderboards (VHELM vs HELM) implicitly filter by modality

**Multimodal Handling:**
- VHELM specifically for vision-language models
- Audio evaluation (HELM Audio) for audio-language models
- Separate installation extras: `pip install crfm-helm[vlm]`, `pip install crfm-helm[audiolm]`

---

### 1.3 lm-evaluation-harness (EleutherAI)

**Repository:** https://github.com/EleutherAI/lm-evaluation-harness  
**Documentation:** https://github.com/EleutherAI/lm-evaluation-harness/tree/main/docs

**Architecture:**
- **YAML-based task configuration**: Tasks defined in YAML files with inheritance
- **Model types**: Different model classes for different backends (hf, vllm, sglang, openai, etc.)
- **Group aggregation**: Tasks can be grouped for aggregate metrics

**Task Configuration Example:**
```yaml
task: hellaswag
dataset_path: Rowan/hellaswag
output_type: multiple_choice
training_split: train
validation_split: validation
test_split: test
doc_to_text: "{{ctx}}"
doc_to_target: "{{label}}"
metric_list:
  - metric: acc
  - metric: acc_norm
metadata:
  version: 1.0
```

**Discovery Mechanism:**
- `lm-eval ls tasks` - List all available tasks
- `lm-eval validate --tasks hellaswag,arc_easy` - Validate task configs
- Tasks organized in `lm_eval/tasks/` directory with hierarchical structure

**Key Features:**
- 60+ standard academic benchmarks
- Support for custom tasks via YAML
- Config file support: `lm-eval run --config my_config.yaml`
- Task groups with aggregate metrics

**Multimodal Support:**
- `hf-multimodal` model type for vision-language models
- `vllm-vlm` for vLLM-based VLM inference
- Prototype feature—recommends lmms-eval for broader multimodal coverage

**Metadata Field:**
```yaml
metadata:
  version: 1.0
  # Arbitrary metadata can be passed here
```

**Limitations:**
- No explicit model capability requirements in task configs
- User must know which model types support which tasks
- Multimodal support is prototype-level

---

### 1.4 OpenAI Evals

**Repository:** https://github.com/openai/evals  
**Documentation:** https://cookbook.openai.com/examples/evaluation/getting_started_with_openai_evals

**Architecture:**
- **Registry-based**: Evals registered via YAML files in `evals/registry/evals/`
- **Eval templates**: Predefined patterns (Match, Includes, FuzzyMatch, ModelGraded)
- **Completion functions**: Abstraction for model interaction

**Eval Configuration Example:**
```yaml
basic-math:
  id: basic-math.basic-arithmetic.simple
  description: Tests basic arithmetic capabilities
  
  basic-arithmetic-simple:
    class: evals.elsuite.basic.match:Match
    args:
      samples_jsonl: basic_math/simple.jsonl
```

**Discovery Mechanism:**
- Registry files in `evals/registry/evals/`
- Eval sets in `evals/registry/eval_sets/`
- CLI: `oaieval gpt-4 basic-math`

**Key Features:**
- Hierarchical eval organization
- Model-graded evaluations for subjective tasks
- JSON/JSONL data format
- Web-based dashboard integration

**Limitations:**
- Primarily designed for OpenAI models
- No explicit multimodal support in core framework
- Limited model metadata

---

### 1.5 lmms-eval (Evolving LMMs Lab)

**Repository:** https://github.com/EvolvingLMMs-Lab/lmms-eval  
**Documentation:** https://github.com/EvolvingLMMs-Lab/lmms-eval/blob/main/docs/README.md

**Architecture:**
- Fork of lm-evaluation-harness optimized for multimodal
- **Chat models (recommended)**: Use structured ChatMessages with roles and content types
- **Simple models (legacy)**: Direct doc_to_visual/doc_to_text interface

**Key Innovation - Model Type System:**
```
lmms_eval/models/
├── chat/           # Recommended: Structured messages
│   ├── qwen2_5_vl.py
│   ├── qwen3_vl.py
│   └── ...
└── simple/         # Legacy: Direct interface
```

**Discovery Mechanism:**
- 100+ tasks across text, image, video, and audio
- 30+ supported models
- HTTP evaluation server for async workflows
- Web UI for interactive configuration

**Key Features:**
- Explicit separation of text-only vs multimodal tasks
- Model-specific implementations (not unified HF class)
- Server/client architecture for distributed evaluation
- Extensive task metadata in docs

**Content Type Support:**
- Text, Image, Video, Audio
- Interleaved multimodal content in ChatMessages
- `doc_to_messages` function for structured input

---

## 2. Benchmark Metadata Standards

Based on analysis of existing tools, benchmarks should include the following metadata:

### 2.1 Required Model Capabilities

| Capability | Description | Example Benchmarks |
|------------|-------------|-------------------|
| `text_input` | Can process text input | MMLU, HellaSwag |
| `text_output` | Can generate text output | All text benchmarks |
| `vision` | Can process image input | MMMU, VQA, COCO |
| `video` | Can process video input | Video-MME, EgoSchema |
| `audio` | Can process audio input | Clotho-AQA, LibriSpeech |
| `function_calling` | Can invoke tool/function calls | BFCL, ToolBench |
| `code_execution` | Can generate and execute code | HumanEval, APPS, SWE-bench |
| `long_context` | Requires context > 32K tokens | RULER, LongBench |
| `multi_turn` | Requires conversation history | MT-Bench, WildBench |
| `reasoning` | Requires chain-of-thought | GSM8K-CoT, GPQA |
| `agent` | Requires agentic behavior | WebArena, OSWorld |

### 2.2 Input/Output Modalities

```yaml
modalities:
  input:
    - text
    - image         # single or multiple images
    - video         # video frames or clips
    - audio         # audio waveform or transcript
    - interleaved   # mixed modality in conversation
  output:
    - text
    - code
    - json          # structured output
    - function_call # tool invocation
```

### 2.3 Difficulty/Complexity Levels

Observed patterns from existing benchmarks:

| Level | Description | Examples |
|-------|-------------|----------|
| `introductory` | Basic, entry-level | MMLU (easy subjects), ARC-Easy |
| `intermediate` | Moderate difficulty | MMLU (hard subjects), ARC-Challenge |
| `advanced` | Expert-level | GPQA, Omni-MATH |
| `olympiad` | Competition-level | USACO, IMO-level math |

### 2.4 Categories/Tags

Hierarchical categorization observed in inspect_evals:

```yaml
categories:
  primary: coding        # Main category
  secondary: python      # Sub-category
  tags:
    - generation
    - debugging
    - class-level
    - data-science
```

**Common Primary Categories:**
- `coding`: Programming and software engineering
- `reasoning`: Logical and mathematical reasoning
- `knowledge`: Factual knowledge and QA
- `safety`: Toxicity, bias, alignment
- `assistants`: Task completion, web browsing
- `cybersecurity`: Security-focused evaluations
- `multimodal`: Vision, audio, video understanding

### 2.5 Proposed Benchmark Metadata Schema

```yaml
benchmark:
  id: "humaneval"
  name: "HumanEval"
  version: "1.0.0"
  
  description: "Evaluates code generation from docstrings"
  
  # Required model capabilities
  requirements:
    capabilities:
      - text_input
      - text_output
      - code_execution
    min_context_length: 4096
    
  # Modalities
  modalities:
    input: [text]
    output: [code]
    
  # Categorization
  category:
    primary: coding
    secondary: python
    tags: [generation, function-level]
    
  # Difficulty
  difficulty: intermediate
  
  # Dataset info
  dataset:
    source: "openai/humaneval"
    size: 164
    split: test
    
  # Metrics
  metrics:
    primary: pass@1
    secondary: [pass@10, pass@100]
    
  # Resource requirements
  resources:
    sandbox: docker  # Requires code execution sandbox
    estimated_time: "30min"
    
  # Provenance
  citation: "arXiv:2107.03374"
  url: "https://github.com/openai/human-eval"
```

---

## 3. Model Metadata Standards

### 3.1 Observed Model Metadata in Tools

**HELM Model Registry Pattern:**
- Provider (openai, anthropic, google, together)
- Model ID (gpt-4o, claude-3-5-sonnet)
- API endpoint
- No explicit capability declarations

**lm-evaluation-harness Model Types:**
- `hf`: HuggingFace transformers
- `hf-multimodal`: HuggingFace VLMs
- `vllm`: vLLM inference
- `vllm-vlm`: vLLM vision models
- `openai`: OpenAI API
- `anthropic`: Anthropic API

### 3.2 Proposed Model Metadata Schema

```yaml
model:
  id: "gpt-4o"
  provider: "openai"
  family: "gpt-4"
  
  # Capabilities
  capabilities:
    text_input: true
    text_output: true
    vision: true
    video: false
    audio: true  # GPT-4o supports audio
    function_calling: true
    code_execution: false  # No native sandbox
    reasoning: true
    multi_turn: true
    
  # Context window
  context_window:
    max_tokens: 128000
    max_output_tokens: 16384
    
  # Pricing (for cost estimation)
  pricing:
    currency: "USD"
    input_per_1k: 0.0025
    output_per_1k: 0.01
    cached_input_per_1k: 0.00125
    
  # API configuration
  api:
    type: "openai"
    endpoint: "https://api.openai.com/v1"
    supports_streaming: true
    supports_batching: true
    
  # Model characteristics
  characteristics:
    knowledge_cutoff: "2024-04"
    supports_system_prompt: true
    supports_json_mode: true
    supports_tools: true
    
  # Performance hints
  performance:
    typical_latency_ms: 500
    throughput_tier: "high"
```

### 3.3 Capability Detection Strategies

1. **Static Registry**: Pre-defined capabilities per model (most common)
2. **API Probing**: Query model API for capabilities (e.g., `supports_tools`)
3. **Test Inference**: Run capability-detection prompts
4. **Provider Documentation**: Parse from official model cards

---

## 4. Model-Benchmark Matching Strategies

### 4.1 Current Approaches in Existing Tools

**HELM/VHELM Approach:**
- Separate leaderboards for different model types
- HELM for text-only, VHELM for vision-language
- No automatic filtering—leaderboard defines scope

**lm-evaluation-harness Approach:**
- Model type (hf vs hf-multimodal) determines compatible tasks
- User selects appropriate model type
- Errors occur if model lacks required capabilities

**lmms-eval Approach:**
- Task defines `doc_to_messages` for multimodal or `doc_to_text` for text
- Model implementation handles modality
- Per-model implementations allow capability-aware handling

### 4.2 Recommended Matching Algorithm

```python
def filter_compatible_benchmarks(model: ModelMetadata, benchmarks: List[Benchmark]) -> List[Benchmark]:
    """Filter benchmarks compatible with model capabilities."""
    compatible = []
    
    for benchmark in benchmarks:
        requirements = benchmark.requirements
        
        # Check required capabilities
        if not all(
            getattr(model.capabilities, cap, False) 
            for cap in requirements.capabilities
        ):
            continue
            
        # Check context length
        if requirements.min_context_length > model.context_window.max_tokens:
            continue
            
        # Check modality support
        for modality in benchmark.modalities.input:
            if modality == 'image' and not model.capabilities.vision:
                continue
            if modality == 'video' and not model.capabilities.video:
                continue
            if modality == 'audio' and not model.capabilities.audio:
                continue
                
        compatible.append(benchmark)
        
    return compatible
```

### 4.3 Warning on Mismatched Runs

When a user attempts to run an incompatible evaluation:

```
⚠️  Capability Mismatch Warning
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Benchmark: MMMU (vision)
Model: gpt-3.5-turbo (text-only)

Missing capabilities:
  • vision: Benchmark requires image input processing

Options:
  [1] Switch to compatible model (gpt-4o, claude-3-5-sonnet)
  [2] Force run (results may be invalid)
  [3] Cancel
```

### 4.4 Suggesting Compatible Benchmarks

```python
def suggest_benchmarks(model: ModelMetadata, all_benchmarks: List[Benchmark]) -> Dict[str, List[Benchmark]]:
    """Suggest benchmarks organized by capability utilization."""
    
    suggestions = {
        "full_capability": [],     # Uses all model capabilities
        "core_capability": [],     # Uses primary capabilities
        "baseline": [],            # Text-only baseline
    }
    
    model_caps = set(k for k, v in model.capabilities.items() if v)
    
    for benchmark in filter_compatible_benchmarks(model, all_benchmarks):
        required_caps = set(benchmark.requirements.capabilities)
        
        # How well does this benchmark exercise the model?
        capability_utilization = len(required_caps & model_caps) / len(model_caps)
        
        if capability_utilization > 0.7:
            suggestions["full_capability"].append(benchmark)
        elif capability_utilization > 0.3:
            suggestions["core_capability"].append(benchmark)
        else:
            suggestions["baseline"].append(benchmark)
            
    return suggestions
```

---

## 5. Recommendations for OpenBench Studio

### 5.1 Benchmark Registry Design

1. **Use YAML for benchmark definitions** (following lm-eval-harness pattern)
2. **Include explicit capability requirements** (not in current tools)
3. **Support hierarchical categorization** (following inspect_evals)
4. **Version benchmarks** for reproducibility

### 5.2 Model Registry Design

1. **Maintain capability registry per model**
2. **Support provider-specific model discovery** (API introspection)
3. **Include pricing information** for cost estimation
4. **Track model versions and knowledge cutoffs**

### 5.3 Matching Interface

1. **Default: Filter incompatible combinations**
2. **Show compatibility status in UI** (✓ compatible, ⚠️ partial, ✗ incompatible)
3. **Allow force-run with warning** for edge cases
4. **Suggest optimal benchmarks** based on model capabilities

### 5.4 Implementation Priorities

| Priority | Feature | Rationale |
|----------|---------|-----------|
| P0 | Basic capability matching | Prevents invalid evaluations |
| P0 | Modality filtering | Critical for multimodal |
| P1 | Context length validation | Prevents OOM/truncation issues |
| P1 | Benchmark categorization | Improves discoverability |
| P2 | Cost estimation | Useful for planning |
| P2 | Capability suggestions | Improves UX |
| P3 | Auto-detection | Reduces manual configuration |

---

## 6. References

### Documentation Links

- **Inspect AI**: https://inspect.aisi.org.uk/
- **Inspect Evals**: https://github.com/UKGovernmentBEIS/inspect_evals
- **HELM**: https://crfm-helm.readthedocs.io/
- **HELM Capabilities**: https://crfm.stanford.edu/2025/03/20/helm-capabilities.html
- **VHELM Paper**: https://arxiv.org/abs/2410.07112
- **lm-evaluation-harness**: https://github.com/EleutherAI/lm-evaluation-harness
- **lm-eval Task Guide**: https://github.com/EleutherAI/lm-evaluation-harness/blob/main/docs/task_guide.md
- **OpenAI Evals**: https://github.com/openai/evals
- **OpenAI Cookbook - Evals**: https://cookbook.openai.com/examples/evaluation/getting_started_with_openai_evals
- **lmms-eval**: https://github.com/EvolvingLMMs-Lab/lmms-eval
- **BFCL (Function Calling)**: https://gorilla.cs.berkeley.edu/leaderboard.html

### Academic Papers

- Holistic Evaluation of Language Models (HELM): https://arxiv.org/abs/2211.09110
- VHELM: https://arxiv.org/abs/2410.07112
- Berkeley Function Calling Leaderboard: https://openreview.net/forum?id=2GmDdhBdDk
- MME Survey: https://arxiv.org/abs/2411.15296

---

*Document generated from research conducted on 2026-02-14*
