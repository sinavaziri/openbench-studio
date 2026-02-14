# OpenBench CLI Interface Documentation

This document describes the expected CLI interface for the `bench` command that OpenBench Studio integrates with.

## Overview

OpenBench Studio can operate in two modes:

1. **Production Mode**: Uses the real `bench` CLI (from OpenBench/inspect_ai)
2. **Mock Mode**: Simulates benchmark runs when `bench` CLI is not available

The application automatically detects which mode to use based on CLI availability.

## CLI Commands

### `bench eval` - Run Benchmark Evaluation

```bash
bench eval <benchmark> --model <model> [options]
```

#### Required Arguments

| Argument | Description |
|----------|-------------|
| `<benchmark>` | Name of the benchmark to run (e.g., `mmlu`, `gsm8k`, `humaneval`) |
| `--model <model>` | Model identifier (e.g., `gpt-4`, `claude-3-opus`, `llama-70b`) |

#### Optional Arguments

| Argument | Type | Description |
|----------|------|-------------|
| `--limit <n>` | int | Number of samples to evaluate |
| `--temperature <t>` | float | Sampling temperature (0.0-2.0) |
| `--top-p <p>` | float | Top-p sampling parameter (0.0-1.0) |
| `--max-tokens <n>` | int | Maximum tokens to generate |
| `--timeout <s>` | int | Timeout per sample in seconds |
| `--epochs <n>` | int | Number of evaluation epochs |
| `--max-connections <n>` | int | Max concurrent API connections |

#### Output Format

The CLI should produce:

1. **Progress messages** to stdout (see Progress Patterns below)
2. **Structured results** as JSON with a `RESULTS:` prefix on a line

Example output:
```
Starting benchmark evaluation...
Benchmark: mmlu
Model: gpt-4
Limit: 10 samples

Processing sample 1/10...
Processing sample 2/10...
[3/10] Evaluating...
Completed 4 of 10 samples
...

Results Summary:
  Accuracy: 85.0%
  F1 Score: 0.830

RESULTS: {"accuracy": 0.85, "f1_score": 0.83, "category_breakdown": {"math": 0.9, "science": 0.8}}
```

### `bench list` - List Available Benchmarks

```bash
bench list [--all]
```

#### Options

| Option | Description |
|--------|-------------|
| `--all` | Include all benchmarks (not just featured) |

#### Output Format

Can be either:
- JSON array of benchmark objects
- ASCII table with benchmark ID, name, and description

Example (JSON):
```json
[
  {"name": "mmlu", "category": "knowledge", "description": "Massive Multitask Language Understanding"},
  {"name": "gsm8k", "category": "math", "description": "Grade school math word problems"}
]
```

Example (Table):
```
╭────────────────────────────────────────────────────────────╮
│                    Available Benchmarks                     │
╰────────────────────────────────────────────────────────────╯

 mmlu          MMLU          Massive Multitask Language Understanding
 gsm8k         GSM8K         Grade school math word problems
 humaneval     HumanEval     Python code generation benchmark
```

### `bench describe` - Get Benchmark Details

```bash
bench describe <benchmark>
```

#### Output Format

JSON object with benchmark metadata:
```json
{
  "name": "mmlu",
  "category": "knowledge",
  "description_short": "Tests knowledge across 57 subjects",
  "description": "Full description...",
  "tags": ["knowledge", "reasoning", "multi-subject"]
}
```

## Progress Patterns

The progress parser recognizes these patterns in stdout:

| Pattern | Example |
|---------|---------|
| `sample N/M` | `Processing sample 5/100...` |
| `[N/M]` | `[10/20] Evaluating...` |
| `N%` | `Progress: 50%` |
| `N of M` | `Completed 15 of 30 samples` |
| `evaluating N/M` | `Evaluating 5/10` |

## Environment Variables

The following API keys should be passed as environment variables:

| Variable | Provider |
|----------|----------|
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `GOOGLE_API_KEY` | Google |
| `MISTRAL_API_KEY` | Mistral |
| `TOGETHER_API_KEY` | Together AI |
| `GROQ_API_KEY` | Groq |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (check stdout/stderr for details) |
| `130` | Canceled by user (SIGINT/SIGTERM) |

## Error Patterns

The following error patterns in output indicate failure (even with exit code 0):

- `Task interrupted (no samples completed`
- `Error code: <N>`
- `NotFoundError:`
- `AuthenticationError:`
- `PermissionDeniedError:`
- `RateLimitError:`
- `InsufficientQuotaError:`
- `InvalidRequestError:`
- `model_not_found`
- `does not exist or you do not have access`

## Mock Mode

When the `bench` CLI is not available, OpenBench Studio runs in mock mode. Mock mode:

1. Simulates realistic benchmark progress
2. Generates reproducible but model-specific results
3. Supports failure simulation (use model names containing "fail")
4. Supports slow simulation (use model names containing "slow")
5. Handles cancellation (SIGTERM/SIGINT)

Mock runs are marked with a `.mock_run` file in the artifact directory.

### Testing with Mock Mode

To test different scenarios:

```python
# Normal run
config = RunConfig(benchmark="mmlu", model="gpt-4", limit=10)

# Simulated failure
config = RunConfig(benchmark="mmlu", model="fail-model", limit=10)

# Slow run (for testing cancellation)
config = RunConfig(benchmark="mmlu", model="slow-model", limit=100)
```

## Installing the Real CLI

To use the real `bench` CLI instead of mock mode:

### Option 1: Install OpenBench

```bash
pip install openbench
```

### Option 2: Install inspect_ai

```bash
pip install inspect_ai
```

### Verify Installation

```bash
which bench
bench --version
bench list
```

## Artifact Structure

Each run creates artifacts in `data/runs/<run_id>/`:

```
data/runs/<run_id>/
├── config.json      # Run configuration
├── command.txt      # Exact CLI command executed
├── meta.json        # Status, timestamps, exit code
├── stdout.log       # Standard output
├── stderr.log       # Standard error
├── summary.json     # Parsed results
└── .mock_run        # Present if mock mode (optional)
```

### config.json

```json
{
  "benchmark": "mmlu",
  "model": "gpt-4",
  "limit": 10,
  "temperature": 0.5,
  "max_tokens": null,
  "timeout": null,
  "epochs": null,
  "max_connections": null
}
```

### meta.json

```json
{
  "exit_code": 0,
  "finished_at": "2024-01-15T10:30:00.000000",
  "status": "completed",
  "mock_run": false
}
```

### summary.json

```json
{
  "schema_version": 1,
  "primary_metric": {
    "name": "accuracy",
    "value": 0.85,
    "unit": null
  },
  "metrics": [
    {"name": "accuracy", "value": 0.85, "unit": null},
    {"name": "f1_score", "value": 0.83, "unit": null}
  ],
  "breakdowns": [
    {
      "name": "category_breakdown",
      "items": [
        {"key": "math", "value": 0.9, "unit": null},
        {"key": "science", "value": 0.8, "unit": null}
      ]
    }
  ],
  "notes": [],
  "raw": {
    "source": "stdout.log (JSON)",
    "hint": "best-effort extraction"
  }
}
```

## Compatibility Notes

### Known Issues

1. **Box-drawing characters**: Some CLI versions use Unicode box-drawing characters in output. The parser handles these.

2. **Exit code 0 on failure**: The CLI sometimes returns 0 even when tasks fail. The executor detects failures from output patterns.

3. **Multi-line table output**: Benchmark descriptions may span multiple lines. The parser handles continuation lines.

### Tested Versions

- OpenBench: 0.1.x
- inspect_ai: 0.3.x

## Debugging

Enable debug logging to see CLI interaction details:

```python
import logging
logging.getLogger("app.runner").setLevel(logging.DEBUG)
```

Or set environment variable:
```bash
export LOG_LEVEL=DEBUG
```

Log messages include:
- Command being executed
- Process PID
- Exit codes
- Failure detection
- Metric parsing
