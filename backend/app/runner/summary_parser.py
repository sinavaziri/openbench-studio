"""
Summary parser for extracting structured results from benchmark runs.

This module reads stdout/stderr/OpenBench log files and extracts a stable
summary schema including primary metric, additional metrics, and breakdowns.
"""

import json
import re
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field


class MetricValue(BaseModel):
    """A single metric with name, value, and optional unit."""
    name: str
    value: float
    unit: Optional[str] = None


class BreakdownItem(BaseModel):
    """A single item in a breakdown (e.g., a category score)."""
    key: str
    value: float
    unit: Optional[str] = None


class Breakdown(BaseModel):
    """A breakdown of metrics by some dimension (e.g., by category)."""
    name: str
    items: list[BreakdownItem] = Field(default_factory=list)


class TokenUsage(BaseModel):
    """Token usage statistics extracted from benchmark output."""
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class Summary(BaseModel):
    """
    Stable summary schema (v1) for benchmark results.
    
    This schema is designed to be forward-compatible and resilient.
    Missing data is represented as None/empty lists rather than errors.
    """
    schema_version: int = 1
    primary_metric: Optional[MetricValue] = None
    metrics: list[MetricValue] = Field(default_factory=list)
    breakdowns: list[Breakdown] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    token_usage: Optional[TokenUsage] = None
    raw: dict[str, Any] = Field(default_factory=lambda: {
        "source": "stdout.log",
        "hint": "best-effort extraction"
    })


def parse_mock_results(stdout_content: str) -> Optional[dict]:
    """
    Parse results from mock benchmark output.
    
    Looks for lines like: RESULTS: {"accuracy": 0.85, ...}
    """
    for line in stdout_content.splitlines():
        if line.startswith("RESULTS:"):
            try:
                json_str = line[len("RESULTS:"):].strip()
                return json.loads(json_str)
            except json.JSONDecodeError:
                pass
    return None


def parse_json_results(stdout_content: str) -> Optional[dict]:
    """
    Try to find and parse JSON results in stdout.
    
    Looks for common patterns:
    - JSON at end of output
    - "results:" or "Results:" followed by JSON
    - Standalone JSON object with metric-like keys
    """
    # Try to find JSON at the end of the output
    lines = stdout_content.strip().splitlines()
    
    # Look for RESULTS: prefix (mock format)
    for line in lines:
        if line.startswith("RESULTS:"):
            try:
                return json.loads(line[len("RESULTS:"):].strip())
            except json.JSONDecodeError:
                pass
    
    # Try to parse the last non-empty line as JSON
    for line in reversed(lines):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                pass
    
    # Look for a JSON block at the end
    try:
        # Find the last { and try to parse from there
        last_brace = stdout_content.rfind("{")
        if last_brace >= 0:
            potential_json = stdout_content[last_brace:]
            # Find matching closing brace
            depth = 0
            for i, char in enumerate(potential_json):
                if char == "{":
                    depth += 1
                elif char == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(potential_json[:i+1])
                        except json.JSONDecodeError:
                            break
    except Exception:
        pass
    
    return None


def extract_accuracy_from_text(content: str) -> Optional[float]:
    """
    Extract accuracy-like metrics from text output.
    
    Looks for patterns like:
    - "accuracy: 0.85" or "Accuracy = 85%"
    - "score: 0.9" or "Score: 90%"
    - "acc: 0.75"
    """
    patterns = [
        r"(?:accuracy|acc)[:\s=]+(\d+\.?\d*)%?",
        r"(?:score)[:\s=]+(\d+\.?\d*)%?",
        r"(?:f1)[:\s=]+(\d+\.?\d*)%?",
        r"(?:precision)[:\s=]+(\d+\.?\d*)%?",
        r"(?:recall)[:\s=]+(\d+\.?\d*)%?",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            value = float(match.group(1))
            # Convert percentage to decimal if > 1
            if value > 1:
                value = value / 100.0
            return value
    
    return None


def extract_metrics_from_dict(data: dict) -> tuple[Optional[MetricValue], list[MetricValue]]:
    """
    Extract primary metric and additional metrics from a dictionary.
    
    Prioritizes: accuracy > score > f1 > other numeric values
    """
    priority_keys = ["accuracy", "acc", "score", "f1", "f1_score", "precision", "recall"]
    metrics = []
    primary = None
    
    for key, value in data.items():
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            # Skip metadata fields
            if key in ("total_samples", "completed_samples", "limit", "schema_version"):
                continue
            
            metric = MetricValue(name=key, value=float(value))
            metrics.append(metric)
            
            # Set as primary if it's a priority key
            if primary is None and key.lower() in priority_keys:
                primary = metric
    
    # If no priority key found, use the first metric
    if primary is None and metrics:
        primary = metrics[0]
    
    return primary, metrics


def extract_breakdowns_from_dict(data: dict) -> list[Breakdown]:
    """
    Extract breakdowns from a dictionary.
    
    Looks for nested dicts that might represent category breakdowns.
    """
    breakdowns = []
    
    for key, value in data.items():
        if isinstance(value, dict):
            # Check if it's a breakdown (dict of numeric values)
            items = []
            for sub_key, sub_value in value.items():
                if isinstance(sub_value, (int, float)) and not isinstance(sub_value, bool):
                    items.append(BreakdownItem(key=sub_key, value=float(sub_value)))
            
            if items:
                breakdowns.append(Breakdown(name=key, items=items))
        
        elif isinstance(value, list):
            # Check if it's a list of dicts with category/value structure
            items = []
            for item in value:
                if isinstance(item, dict):
                    item_key = item.get("category") or item.get("name") or item.get("key")
                    item_value = item.get("value") or item.get("score") or item.get("accuracy")
                    if item_key and isinstance(item_value, (int, float)):
                        items.append(BreakdownItem(key=str(item_key), value=float(item_value)))
            
            if items:
                breakdowns.append(Breakdown(name=key, items=items))
    
    return breakdowns


def extract_token_usage_from_text(content: str) -> Optional[TokenUsage]:
    """
    Extract token usage from text output.
    
    Looks for patterns like:
    - "tokens: 15000" or "total_tokens: 15000"
    - "input_tokens: 10000" or "prompt_tokens: 10000"
    - "output_tokens: 5000" or "completion_tokens: 5000"
    """
    input_tokens = 0
    output_tokens = 0
    total_tokens = 0
    
    patterns = {
        "input": [
            r"(?:input_tokens|prompt_tokens|input tokens|prompt tokens)[:\s=]+(\d+)",
            r'"(?:input_tokens|prompt_tokens)"[:\s]+(\d+)',
        ],
        "output": [
            r"(?:output_tokens|completion_tokens|output tokens|completion tokens)[:\s=]+(\d+)",
            r'"(?:output_tokens|completion_tokens)"[:\s]+(\d+)',
        ],
        "total": [
            r"(?:total_tokens|total tokens)[:\s=]+(\d+)",
            r'"total_tokens"[:\s]+(\d+)',
        ],
    }
    
    for category, category_patterns in patterns.items():
        for pattern in category_patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                value = int(match.group(1))
                if category == "input":
                    input_tokens = max(input_tokens, value)
                elif category == "output":
                    output_tokens = max(output_tokens, value)
                elif category == "total":
                    total_tokens = max(total_tokens, value)
                break
    
    if total_tokens > 0 and input_tokens == 0 and output_tokens == 0:
        input_tokens = int(total_tokens * 0.3)
        output_tokens = int(total_tokens * 0.7)
    
    if input_tokens > 0 or output_tokens > 0:
        if total_tokens == 0:
            total_tokens = input_tokens + output_tokens
        return TokenUsage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
        )
    
    return None


def extract_token_usage_from_dict(data: dict) -> Optional[TokenUsage]:
    """Extract token usage from structured data."""
    input_tokens = 0
    output_tokens = 0
    total_tokens = 0
    
    usage_keys = ["usage", "token_usage", "tokens", "token_count"]
    input_keys = ["input_tokens", "prompt_tokens", "input"]
    output_keys = ["output_tokens", "completion_tokens", "output"]
    total_keys = ["total_tokens", "total"]
    
    for usage_key in usage_keys:
        if usage_key in data and isinstance(data[usage_key], dict):
            usage = data[usage_key]
            for key in input_keys:
                if key in usage and isinstance(usage[key], (int, float)):
                    input_tokens = int(usage[key])
                    break
            for key in output_keys:
                if key in usage and isinstance(usage[key], (int, float)):
                    output_tokens = int(usage[key])
                    break
            for key in total_keys:
                if key in usage and isinstance(usage[key], (int, float)):
                    total_tokens = int(usage[key])
                    break
            break
    
    for key in input_keys:
        if key in data and isinstance(data[key], (int, float)):
            input_tokens = max(input_tokens, int(data[key]))
            break
    for key in output_keys:
        if key in data and isinstance(data[key], (int, float)):
            output_tokens = max(output_tokens, int(data[key]))
            break
    for key in total_keys:
        if key in data and isinstance(data[key], (int, float)):
            total_tokens = max(total_tokens, int(data[key]))
            break
    
    if total_tokens > 0 and input_tokens == 0 and output_tokens == 0:
        input_tokens = int(total_tokens * 0.3)
        output_tokens = int(total_tokens * 0.7)
    
    if input_tokens > 0 or output_tokens > 0:
        if total_tokens == 0:
            total_tokens = input_tokens + output_tokens
        return TokenUsage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
        )
    
    return None


def parse_summary(artifact_dir: Path) -> Summary:
    """
    Parse benchmark output and produce a stable summary.
    
    Args:
        artifact_dir: Path to the run's artifact directory
        
    Returns:
        Summary object with extracted metrics, or empty summary with notes on failure
    """
    summary = Summary()
    notes = []
    
    # Read stdout.log
    stdout_path = artifact_dir / "stdout.log"
    stdout_content = ""
    if stdout_path.exists():
        try:
            with open(stdout_path, "r") as f:
                stdout_content = f.read()
        except Exception as e:
            notes.append(f"Failed to read stdout.log: {e}")
    else:
        notes.append("stdout.log not found")
    
    # Try to read openbench.log.json if it exists
    openbench_log_path = artifact_dir / "openbench.log.json"
    openbench_data = None
    if openbench_log_path.exists():
        try:
            with open(openbench_log_path, "r") as f:
                openbench_data = json.load(f)
                summary.raw["source"] = "openbench.log.json"
        except Exception as e:
            notes.append(f"Failed to parse openbench.log.json: {e}")
    
    # Extract structured results
    result_data = None
    
    # Priority 1: OpenBench log file
    if openbench_data:
        result_data = openbench_data
    
    # Priority 2: JSON in stdout
    if result_data is None and stdout_content:
        result_data = parse_json_results(stdout_content)
        if result_data:
            summary.raw["source"] = "stdout.log (JSON)"
    
    # Extract metrics from structured data
    if result_data:
        primary, metrics = extract_metrics_from_dict(result_data)
        summary.primary_metric = primary
        summary.metrics = metrics
        summary.breakdowns = extract_breakdowns_from_dict(result_data)
        # Extract token usage from structured data
        summary.token_usage = extract_token_usage_from_dict(result_data)
    else:
        # Fallback: try text extraction
        if stdout_content:
            accuracy = extract_accuracy_from_text(stdout_content)
            if accuracy is not None:
                summary.primary_metric = MetricValue(name="accuracy", value=accuracy)
                summary.metrics = [summary.primary_metric]
                summary.raw["hint"] = "extracted from text patterns"
            else:
                notes.append("Could not extract structured metrics from output")
    
    # Try to extract token usage from text if not already found
    if summary.token_usage is None and stdout_content:
        summary.token_usage = extract_token_usage_from_text(stdout_content)
    
    # Set notes
    if not summary.primary_metric:
        notes.append("No primary metric could be extracted")
    
    summary.notes = notes
    
    return summary


def write_summary(artifact_dir: Path, summary: Summary) -> None:
    """
    Write summary.json to the artifact directory.
    """
    summary_path = artifact_dir / "summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary.model_dump(), f, indent=2)


def parse_and_write_summary(artifact_dir: Path) -> Summary:
    """
    Parse the benchmark output and write summary.json.
    
    This is the main entry point for the summary parser.
    """
    summary = parse_summary(artifact_dir)
    write_summary(artifact_dir, summary)
    return summary



