"""
Command builder for benchmark CLI integration.

Builds CLI commands for:
- Real `bench` CLI when available
- Mock commands for development/testing without bench CLI
"""

import logging
import shlex
from typing import Optional

from app.db.models import RunConfig

logger = logging.getLogger(__name__)


def build_command(config: RunConfig) -> list[str]:
    """
    Build the CLI command for running a benchmark.
    
    Expected CLI format (OpenBench/inspect_ai style):
        bench eval <benchmark> --model <model> [options]
    
    Args:
        config: Run configuration with benchmark, model, and options
        
    Returns:
        List of command arguments
    """
    cmd = ["bench", "eval", config.benchmark, "--model", config.model]
    
    if config.limit is not None:
        cmd.extend(["--limit", str(config.limit)])
    
    if config.temperature is not None:
        cmd.extend(["--temperature", str(config.temperature)])
    
    if config.top_p is not None:
        cmd.extend(["--top-p", str(config.top_p)])
    
    if config.max_tokens is not None:
        cmd.extend(["--max-tokens", str(config.max_tokens)])
    
    if config.timeout is not None:
        cmd.extend(["--timeout", str(config.timeout)])
    
    if config.epochs is not None:
        cmd.extend(["--epochs", str(config.epochs)])
    
    if config.max_connections is not None:
        cmd.extend(["--max-connections", str(config.max_connections)])
    
    logger.debug(f"Built command: {command_to_string(cmd)}")
    return cmd


def build_mock_command(config: RunConfig, duration: int = 5) -> list[str]:
    """
    Build a mock command that simulates a benchmark run.
    
    Used when 'bench' CLI is not available for development/testing.
    
    The mock produces realistic output including:
    - Progress updates (compatible with progress_parser.py patterns)
    - Timing information
    - Structured JSON results
    - Category breakdowns
    - Mock failures for testing error handling
    
    Args:
        config: Run configuration
        duration: Total duration in seconds for the mock run
        
    Returns:
        List of command arguments (python -c <script>)
    """
    limit = config.limit or 10
    benchmark = config.benchmark
    model = config.model
    
    logger.info(f"Building mock command for benchmark={benchmark}, model={model}, limit={limit}")
    
    # Python script that simulates a realistic benchmark run
    script = f'''
import time
import json
import sys
import random
import signal

# Handle SIGTERM for graceful cancellation
canceled = False
def handle_sigterm(signum, frame):
    global canceled
    canceled = True
    print("\\n[CANCELED] Benchmark run was canceled by user")
    sys.exit(130)

signal.signal(signal.SIGTERM, handle_sigterm)
signal.signal(signal.SIGINT, handle_sigterm)

benchmark = "{benchmark}"
model = "{model}"
limit = {limit}
duration = {duration}

# Use model name as seed for reproducible but model-specific results
seed = hash(model) % (2**31)
random.seed(seed)

# Simulate different behaviors based on model name (for testing)
# Models containing "fail" will fail, "slow" will be slower
simulate_failure = "fail" in model.lower()
simulate_slow = "slow" in model.lower()

print("=" * 60)
print("OpenBench Evaluation (Mock Mode)")
print("=" * 60)
print()
print(f"Benchmark: {{benchmark}}")
print(f"Model: {{model}}")
print(f"Limit: {{limit}} samples")
print(f"Started: {{time.strftime('%Y-%m-%d %H:%M:%S')}}")
print()
print("-" * 60)
print()

if simulate_failure:
    # Simulate a failure after some progress
    for i in range(min(3, limit)):
        if canceled:
            sys.exit(130)
        print(f"Processing sample {{i+1}}/{{limit}}...")
        time.sleep(0.5)
    print()
    print("Task interrupted (no samples completed)")
    print("Error code: 401")
    print("AuthenticationError: Invalid API key provided")
    sys.exit(1)

# Calculate timing per sample
samples_per_second = limit / max(duration, 1)
sleep_per_sample = duration / max(limit, 1)
if simulate_slow:
    sleep_per_sample *= 2

# Progress through samples
completed = 0
start_time = time.time()

for i in range(limit):
    if canceled:
        sys.exit(130)
    
    completed = i + 1
    elapsed = time.time() - start_time
    
    # Print progress in formats compatible with progress_parser.py
    # Using multiple patterns for testing
    if i % 3 == 0:
        print(f"Processing sample {{completed}}/{{limit}}...")
    elif i % 3 == 1:
        pct = (completed / limit) * 100
        print(f"[{{completed}}/{{limit}}] Evaluating... ({{pct:.1f}}%)")
    else:
        print(f"Completed {{completed}} of {{limit}} samples")
    
    # Simulate work
    actual_sleep = sleep_per_sample + random.uniform(-0.1, 0.1)
    time.sleep(max(0.1, actual_sleep))

elapsed_total = time.time() - start_time
print()
print("-" * 60)
print()
print(f"Completed: {{completed}}/{{limit}} samples")
print(f"Duration: {{elapsed_total:.1f}}s")
print()

# Generate category breakdowns based on benchmark type
categories = {{
    "mmlu": {{"math": 0.72, "physics": 0.68, "chemistry": 0.71, "biology": 0.75, "history": 0.82, "geography": 0.79}},
    "hellaswag": {{"physical": 0.81, "social": 0.78, "temporal": 0.76, "emotional": 0.80}},
    "arc": {{"easy": 0.88, "challenge": 0.72, "scientific": 0.75}},
    "gsm8k": {{"arithmetic": 0.85, "algebra": 0.71, "geometry": 0.65, "word_problems": 0.78}},
    "humaneval": {{"algorithms": 0.68, "data_structures": 0.72, "string_manipulation": 0.81, "math": 0.75}},
    "truthfulqa": {{"politics": 0.62, "health": 0.71, "law": 0.65, "finance": 0.68}},
    "winogrande": {{"spatial": 0.77, "temporal": 0.74, "social": 0.79}},
    "mbpp": {{"simple": 0.82, "medium": 0.71, "complex": 0.58}},
}}

# Get benchmark-specific categories or default
base_categories = categories.get(benchmark.lower(), {{"category_a": 0.75, "category_b": 0.72, "category_c": 0.78}})

# Add model-specific variance
breakdown_items = {{}}
for cat, base_val in base_categories.items():
    # Add randomness based on model seed
    variance = random.uniform(-0.08, 0.08)
    breakdown_items[cat] = round(max(0.0, min(1.0, base_val + variance)), 3)

# Calculate overall metrics
accuracy = round(sum(breakdown_items.values()) / len(breakdown_items), 3)
f1_score = round(accuracy * random.uniform(0.96, 1.02), 3)
precision = round(accuracy * random.uniform(0.98, 1.04), 3)
recall = round(accuracy * random.uniform(0.94, 1.01), 3)

# Print summary table
print("=" * 60)
print("Results Summary")
print("=" * 60)
print()
print(f"  Accuracy:  {{accuracy:.1%}}")
print(f"  F1 Score:  {{f1_score:.3f}}")
print(f"  Precision: {{precision:.3f}}")
print(f"  Recall:    {{recall:.3f}}")
print()
print("Category Breakdown:")
for cat, val in breakdown_items.items():
    print(f"  {{cat:<20}} {{val:.1%}}")
print()

# Output structured results (parsed by summary_parser.py)
result = {{
    "benchmark": benchmark,
    "model": model,
    "accuracy": accuracy,
    "f1_score": f1_score,
    "precision": precision,
    "recall": recall,
    "total_samples": limit,
    "completed_samples": completed,
    "duration_seconds": round(elapsed_total, 2),
    "category_breakdown": breakdown_items,
    "mock_run": True,
}}
print("RESULTS:", json.dumps(result))
print()
print("Run completed successfully!")
'''
    return ["python3", "-c", script]


def command_to_string(cmd: list[str]) -> str:
    """
    Convert command list to a shell-safe string for logging.
    
    Args:
        cmd: List of command arguments
        
    Returns:
        Shell-escaped command string
    """
    return " ".join(shlex.quote(arg) for arg in cmd)


def get_expected_cli_interface() -> dict:
    """
    Document the expected CLI interface for the bench command.
    
    This is used for documentation and validation purposes.
    
    Returns:
        Dictionary describing the expected CLI interface
    """
    return {
        "commands": {
            "bench eval": {
                "description": "Run a benchmark evaluation",
                "usage": "bench eval <benchmark> --model <model> [options]",
                "required_args": ["benchmark", "--model"],
                "optional_args": {
                    "--limit": "Number of samples to evaluate (int)",
                    "--temperature": "Sampling temperature (float, 0.0-2.0)",
                    "--top-p": "Top-p sampling parameter (float, 0.0-1.0)",
                    "--max-tokens": "Maximum tokens to generate (int)",
                    "--timeout": "Timeout per sample in seconds (int)",
                    "--epochs": "Number of evaluation epochs (int)",
                    "--max-connections": "Max concurrent API connections (int)",
                },
                "output_format": "Progress to stdout, JSON results line with 'RESULTS:' prefix",
            },
            "bench list": {
                "description": "List available benchmarks",
                "usage": "bench list [--all]",
                "optional_args": {
                    "--all": "Include all benchmarks (not just featured)",
                },
                "output_format": "Table or JSON listing benchmarks",
            },
            "bench describe": {
                "description": "Get details about a specific benchmark",
                "usage": "bench describe <benchmark>",
                "required_args": ["benchmark"],
                "output_format": "JSON with benchmark metadata",
            },
        },
        "environment_variables": {
            "OPENAI_API_KEY": "API key for OpenAI models",
            "ANTHROPIC_API_KEY": "API key for Anthropic models",
            "GOOGLE_API_KEY": "API key for Google models",
            "MISTRAL_API_KEY": "API key for Mistral models",
            "TOGETHER_API_KEY": "API key for Together AI models",
        },
        "exit_codes": {
            0: "Success",
            1: "Error (check stderr/stdout for details)",
            130: "Canceled by user (SIGINT/SIGTERM)",
        },
    }
