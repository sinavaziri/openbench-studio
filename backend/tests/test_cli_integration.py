#!/usr/bin/env python3
"""
CLI Integration Tests for OpenBench Studio.

Tests the full flow of:
1. Building commands (real and mock)
2. Executing mock runs
3. Parsing progress and results
4. Cancellation handling
5. Error detection
"""

import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Add parent directories to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.models import RunConfig, RunStatus
from app.runner.command_builder import (
    build_command,
    build_mock_command,
    command_to_string,
    get_expected_cli_interface,
)
from app.runner.progress_parser import parse_progress, parse_progress_from_lines
from app.runner.summary_parser import (
    parse_json_results,
    parse_mock_results,
    extract_accuracy_from_text,
    extract_metrics_from_dict,
    extract_breakdowns_from_dict,
)


class TestResult:
    """Container for test results."""
    def __init__(self, name: str):
        self.name = name
        self.passed = False
        self.message = ""
        self.details = None


def test_build_command():
    """Test building CLI commands."""
    result = TestResult("build_command")
    
    try:
        config = RunConfig(
            benchmark="mmlu",
            model="gpt-4",
            limit=10,
            temperature=0.5,
            max_tokens=100,
        )
        
        cmd = build_command(config)
        
        # Verify command structure
        assert cmd[0] == "bench", f"Expected 'bench', got '{cmd[0]}'"
        assert cmd[1] == "eval", f"Expected 'eval', got '{cmd[1]}'"
        assert cmd[2] == "mmlu", f"Expected 'mmlu', got '{cmd[2]}'"
        assert "--model" in cmd, "Missing --model flag"
        assert "gpt-4" in cmd, "Missing model value"
        assert "--limit" in cmd, "Missing --limit flag"
        assert "10" in cmd, "Missing limit value"
        assert "--temperature" in cmd, "Missing --temperature flag"
        assert "--max-tokens" in cmd, "Missing --max-tokens flag"
        
        # Test command string conversion
        cmd_str = command_to_string(cmd)
        assert "bench eval mmlu" in cmd_str, f"Unexpected command string: {cmd_str}"
        
        result.passed = True
        result.message = f"Built command: {cmd_str[:80]}..."
        
    except Exception as e:
        result.message = str(e)
    
    return result


def test_build_mock_command():
    """Test building mock commands."""
    result = TestResult("build_mock_command")
    
    try:
        config = RunConfig(
            benchmark="gsm8k",
            model="test-model",
            limit=5,
        )
        
        cmd = build_mock_command(config, duration=2)
        
        # Verify it's a Python command
        assert cmd[0] in ("python", "python3"), f"Expected python, got '{cmd[0]}'"
        assert cmd[1] == "-c", f"Expected '-c', got '{cmd[1]}'"
        
        # Verify the script contains expected content
        script = cmd[2]
        assert "benchmark" in script.lower(), "Script missing benchmark reference"
        assert "gsm8k" in script, "Script missing benchmark name"
        assert "test-model" in script, "Script missing model name"
        assert "RESULTS:" in script, "Script missing RESULTS output"
        
        result.passed = True
        result.message = f"Built mock command with {len(script)} char script"
        
    except Exception as e:
        result.message = str(e)
    
    return result


def test_mock_execution():
    """Test executing a mock command."""
    result = TestResult("mock_execution")
    
    try:
        config = RunConfig(
            benchmark="mmlu",
            model="test-model",
            limit=3,
        )
        
        cmd = build_mock_command(config, duration=2)
        
        # Execute the command
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )
        
        assert proc.returncode == 0, f"Mock command failed with code {proc.returncode}: {proc.stderr}"
        
        # Verify output contains expected elements
        output = proc.stdout
        assert "mmlu" in output.lower(), "Output missing benchmark name"
        assert "Processing" in output or "Evaluating" in output or "Completed" in output, \
            "Output missing progress messages"
        assert "RESULTS:" in output, "Output missing RESULTS line"
        
        # Parse the results
        results = parse_mock_results(output)
        assert results is not None, "Failed to parse mock results"
        assert "accuracy" in results, "Results missing accuracy"
        assert results["benchmark"] == "mmlu", f"Wrong benchmark: {results['benchmark']}"
        
        result.passed = True
        result.message = f"Mock run completed with accuracy={results.get('accuracy', 'N/A')}"
        result.details = results
        
    except Exception as e:
        result.message = str(e)
    
    return result


def test_mock_failure_simulation():
    """Test that mock mode can simulate failures."""
    result = TestResult("mock_failure_simulation")
    
    try:
        # Model containing "fail" should simulate failure
        config = RunConfig(
            benchmark="mmlu",
            model="fail-test-model",
            limit=5,
        )
        
        cmd = build_mock_command(config, duration=2)
        
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )
        
        assert proc.returncode != 0, "Expected non-zero exit code for failure simulation"
        assert "Error" in proc.stdout or "interrupted" in proc.stdout, \
            "Expected error message in output"
        
        result.passed = True
        result.message = f"Failure simulation worked (exit code {proc.returncode})"
        
    except Exception as e:
        result.message = str(e)
    
    return result


def test_progress_parsing():
    """Test progress line parsing."""
    result = TestResult("progress_parsing")
    
    try:
        test_cases = [
            ("Processing sample 5/10...", 5, 10),
            ("[8/20] Evaluating...", 8, 20),
            ("Progress: 75%", 75, 100),
            ("Completed 15 of 30 samples", 15, 30),
            ("Evaluating 3/5", 3, 5),
        ]
        
        all_passed = True
        details = []
        
        for line, expected_current, expected_total in test_cases:
            progress = parse_progress(line)
            if progress is None:
                details.append(f"FAIL: '{line}' - no match")
                all_passed = False
            elif progress.current != expected_current or progress.total != expected_total:
                details.append(f"FAIL: '{line}' - got {progress.current}/{progress.total}")
                all_passed = False
            else:
                details.append(f"OK: '{line}' -> {progress.current}/{progress.total}")
        
        result.passed = all_passed
        result.message = f"Tested {len(test_cases)} patterns"
        result.details = details
        
    except Exception as e:
        result.message = str(e)
    
    return result


def test_results_parsing():
    """Test result JSON parsing."""
    result = TestResult("results_parsing")
    
    try:
        # Test various output formats
        test_outputs = [
            # Mock format
            'Some output\nRESULTS: {"accuracy": 0.85, "f1_score": 0.83}\nDone',
            # JSON at end
            'Processing...\n{"accuracy": 0.9, "precision": 0.88}',
            # Multi-line JSON
            '''Progress...
            {"accuracy": 0.75, "category_breakdown": {"math": 0.8, "science": 0.7}}''',
        ]
        
        all_passed = True
        details = []
        
        for output in test_outputs:
            # Try mock parser first
            results = parse_mock_results(output)
            if results is None:
                results = parse_json_results(output)
            
            if results is None:
                details.append(f"FAIL: Could not parse output")
                all_passed = False
            elif "accuracy" not in results:
                details.append(f"FAIL: Missing accuracy in {results}")
                all_passed = False
            else:
                details.append(f"OK: accuracy={results['accuracy']}")
        
        result.passed = all_passed
        result.message = f"Tested {len(test_outputs)} output formats"
        result.details = details
        
    except Exception as e:
        result.message = str(e)
    
    return result


def test_metrics_extraction():
    """Test metric extraction from result dictionaries."""
    result = TestResult("metrics_extraction")
    
    try:
        data = {
            "accuracy": 0.85,
            "f1_score": 0.82,
            "precision": 0.88,
            "recall": 0.79,
            "total_samples": 100,  # Should be skipped
            "category_breakdown": {
                "math": 0.9,
                "science": 0.8,
            }
        }
        
        primary, metrics = extract_metrics_from_dict(data)
        
        assert primary is not None, "No primary metric extracted"
        assert primary.name == "accuracy", f"Expected 'accuracy' as primary, got '{primary.name}'"
        assert primary.value == 0.85, f"Expected 0.85, got {primary.value}"
        
        metric_names = {m.name for m in metrics}
        assert "accuracy" in metric_names, "Missing accuracy metric"
        assert "f1_score" in metric_names, "Missing f1_score metric"
        assert "total_samples" not in metric_names, "Should skip total_samples"
        
        breakdowns = extract_breakdowns_from_dict(data)
        assert len(breakdowns) > 0, "No breakdowns extracted"
        
        result.passed = True
        result.message = f"Extracted primary={primary.name}, {len(metrics)} metrics, {len(breakdowns)} breakdowns"
        
    except Exception as e:
        result.message = str(e)
    
    return result


def test_text_accuracy_extraction():
    """Test accuracy extraction from text output."""
    result = TestResult("text_accuracy_extraction")
    
    try:
        test_cases = [
            ("accuracy: 0.85", 0.85),
            ("Accuracy = 85%", 0.85),
            ("Score: 0.9", 0.9),
            ("F1: 75%", 0.75),
            ("precision: 0.88", 0.88),
        ]
        
        all_passed = True
        details = []
        
        for text, expected in test_cases:
            extracted = extract_accuracy_from_text(text)
            if extracted is None:
                details.append(f"FAIL: '{text}' - no match")
                all_passed = False
            elif abs(extracted - expected) > 0.01:
                details.append(f"FAIL: '{text}' - got {extracted}, expected {expected}")
                all_passed = False
            else:
                details.append(f"OK: '{text}' -> {extracted}")
        
        result.passed = all_passed
        result.message = f"Tested {len(test_cases)} text patterns"
        result.details = details
        
    except Exception as e:
        result.message = str(e)
    
    return result


def test_cancellation():
    """Test cancellation of running mock commands."""
    result = TestResult("cancellation")
    
    try:
        config = RunConfig(
            benchmark="mmlu",
            model="test-model",
            limit=100,  # Long run
        )
        
        cmd = build_mock_command(config, duration=60)
        
        # Start the process
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        
        # Wait a bit for it to start
        time.sleep(0.5)
        
        # Verify it's running
        assert proc.poll() is None, "Process should still be running"
        
        # Send SIGTERM
        proc.terminate()
        
        # Wait for it to exit
        try:
            exit_code = proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            exit_code = proc.wait()
        
        # Check exit code (should be non-zero, typically -15 or 130)
        assert exit_code != 0, f"Expected non-zero exit code after cancel, got {exit_code}"
        
        result.passed = True
        result.message = f"Cancellation worked (exit code {exit_code})"
        
    except Exception as e:
        result.message = str(e)
    
    return result


def test_cli_interface_docs():
    """Test that CLI interface documentation is available."""
    result = TestResult("cli_interface_docs")
    
    try:
        docs = get_expected_cli_interface()
        
        assert "commands" in docs, "Missing commands section"
        assert "bench eval" in docs["commands"], "Missing 'bench eval' command"
        assert "environment_variables" in docs, "Missing environment_variables section"
        assert "exit_codes" in docs, "Missing exit_codes section"
        
        eval_cmd = docs["commands"]["bench eval"]
        assert "required_args" in eval_cmd, "Missing required_args"
        assert "optional_args" in eval_cmd, "Missing optional_args"
        
        result.passed = True
        result.message = f"CLI docs available with {len(docs['commands'])} commands"
        result.details = docs
        
    except Exception as e:
        result.message = str(e)
    
    return result


def test_bench_cli_availability():
    """Check if bench CLI is available (informational)."""
    result = TestResult("bench_cli_availability")
    
    bench_path = shutil.which("bench")
    if bench_path:
        result.passed = True
        result.message = f"bench CLI found at: {bench_path}"
        
        # Try to get version
        try:
            proc = subprocess.run(
                ["bench", "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            result.details = {"path": bench_path, "version_output": proc.stdout.strip()}
        except Exception as e:
            result.details = {"path": bench_path, "version_error": str(e)}
    else:
        result.passed = True  # Not a failure, just informational
        result.message = "bench CLI not found (mock mode will be used)"
        result.details = {"mock_mode": True}
    
    return result


def run_all_tests():
    """Run all tests and print results."""
    print("=" * 70)
    print("OpenBench CLI Integration Tests")
    print("=" * 70)
    print()
    
    tests = [
        test_bench_cli_availability,
        test_build_command,
        test_build_mock_command,
        test_mock_execution,
        test_mock_failure_simulation,
        test_progress_parsing,
        test_results_parsing,
        test_metrics_extraction,
        test_text_accuracy_extraction,
        test_cancellation,
        test_cli_interface_docs,
    ]
    
    results = []
    passed = 0
    failed = 0
    
    for test_fn in tests:
        print(f"Running: {test_fn.__name__}...", end=" ")
        try:
            result = test_fn()
            results.append(result)
            
            if result.passed:
                print(f"✅ PASS - {result.message}")
                passed += 1
            else:
                print(f"❌ FAIL - {result.message}")
                failed += 1
                
            if result.details and isinstance(result.details, list):
                for detail in result.details[:5]:  # Limit to 5 details
                    print(f"    {detail}")
                    
        except Exception as e:
            print(f"❌ ERROR - {e}")
            failed += 1
    
    print()
    print("=" * 70)
    print(f"Results: {passed} passed, {failed} failed, {len(tests)} total")
    print("=" * 70)
    
    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
