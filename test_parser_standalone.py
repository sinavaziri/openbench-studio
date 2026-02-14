#!/usr/bin/env python3
"""
Standalone test script for bench list output parsing.
Extracts just the parsing logic for isolated testing.
"""

import json
import re
from dataclasses import dataclass
from typing import Optional, List


@dataclass
class Benchmark:
    name: str
    category: str = "general"
    description_short: str = ""
    tags: list = None
    source: str = "cli"
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []


def parse_bench_list_output(output: str) -> List[Benchmark]:
    """
    Parse the output of `bench list`.
    
    Handles multiple output formats:
    1. JSON array (ideal)
    2. ASCII table with box-drawing characters
    3. Plain text table
    
    Expected table format:
      benchmark_id        Display Name          Description...
                                                (continuation lines...)
    """
    benchmarks = []
    
    # Try JSON parsing first (most reliable)
    try:
        data = json.loads(output)
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    benchmarks.append(Benchmark(
                        name=item.get("name", ""),
                        category=item.get("category", "general"),
                        description_short=item.get("description", item.get("description_short", "")),
                        tags=item.get("tags", []),
                    ))
                elif isinstance(item, str):
                    benchmarks.append(Benchmark(
                        name=item,
                        category="general",
                        description_short="",
                        tags=[],
                    ))
            return benchmarks
    except json.JSONDecodeError:
        pass
    
    # Box drawing characters to skip
    box_chars = set('─│┌┐└┘├┤┬┴┼╭╮╯╰═║╔╗╚╝━┃┏┓┗┛╒╓╕╖╘╙╛╜╞╟╡╢╤╥╧╨╪╫╬▀▄█▌▐░▒▓')
    
    # Words that are commonly misidentified as benchmark IDs
    # (e.g., continuation lines, section headers, common words)
    invalid_names = {
        'about', 'for', 'with', 'and', 'the', 'from', 'this', 'that',
        'subsets', 'available', 'benchmarks', 'total', 'commands',
        'reasoning', 'tasks', 'official', 'qualifying', 'exam',
        'benchmark', 'description', 'name', 'category',
        'benchmark_id', 'display_name',  # Column headers
    }
    
    for line in output.split("\n"):
        stripped = line.strip()
        
        # Skip empty lines
        if not stripped:
            continue
        
        # Skip lines containing box drawing characters anywhere
        if any(c in box_chars for c in line):
            continue
        
        # Skip header/section lines
        if re.match(r'^[A-Z][a-z]+.*[Bb]enchmark', stripped):
            continue
        if stripped.startswith('Total:') or stripped.startswith('Commands:'):
            break
        
        # Match benchmark lines with flexible leading whitespace (0-3 spaces)
        # Benchmark ID must:
        # - Start with lowercase letter
        # - Contain only lowercase, digits, underscores, hyphens
        # - Be followed by whitespace and more content
        # Pattern: optional leading spaces, then benchmark_id, then spaces, then rest
        match = re.match(r'^\s{0,3}([a-z][a-z0-9_-]*)\s{2,}(.+)', line)
        
        if match:
            benchmark_id = match.group(1).rstrip('…')
            rest_of_line = match.group(2).strip()
            
            # Skip if this looks like a continuation line (starts with uppercase 
            # continuation of a parenthetical, or common word)
            if benchmark_id.lower() in invalid_names:
                continue
            
            # Validate benchmark ID length
            if len(benchmark_id) < 3 or len(benchmark_id) > 50:
                continue
            
            # Parse the rest: typically "Display Name          Description"
            # Use multiple spaces (2+) as delimiter
            parts = re.split(r'\s{2,}', rest_of_line, maxsplit=1)
            display_name = parts[0] if parts else ""
            description = parts[1] if len(parts) > 1 else display_name
            
            benchmarks.append(Benchmark(
                name=benchmark_id,
                category="general",
                description_short=description[:200] if description else display_name,
                tags=[],
                source="cli",
            ))
    
    return benchmarks


# ============================================================================
# TEST DATA
# ============================================================================

# Sample 1: Rich table format with box-drawing characters
SAMPLE_RICH_TABLE = """
╭──────────────────────────────────────────────────────────────────────────────╮
│                            Available Benchmarks                               │
╰──────────────────────────────────────────────────────────────────────────────╯

 agieval              AGIEval (All          Human-centric benchmark with 17
                      Subsets)              official qualifying exam questions
 clockbench           ClockBench            Clock benchmark - time-based
                                            reasoning tasks
 detailbench          DetailBench           Tests whether LLMs notify users
                                            of missing information
 gsm8k                GSM8K                 Grade school math word problems
 hellaswag            HellaSwag             Commonsense NLI benchmark
 humaneval            HumanEval             Python code generation benchmark
 math                 MATH                  Competition mathematics problems
 mmlu                 MMLU                  Massive Multitask Language Understanding
 truthfulqa           TruthfulQA            Tests truthfulness in QA

Total: 9 benchmarks available
Commands: bench run <benchmark> | bench describe <benchmark>
"""

# Sample 2: Simpler table format
SAMPLE_SIMPLE_TABLE = """
Available Benchmarks
────────────────────

  benchmark_id        Display Name          Description
  ──────────────────  ────────────────────  ────────────────────────────────────
  agieval             AGIEval               Human-centric benchmark
  arc                 ARC Challenge         Grade school science questions
  bbh                 BIG-Bench Hard        Challenging subset of BIG-Bench
  gsm8k               GSM8K                 Grade school math word problems

Total: 4 benchmarks
"""

# Sample 3: Plain text format
SAMPLE_PLAIN = """
 agieval             AGIEval               Human-centric benchmark
 arc                 ARC Challenge         Grade school science
 bbh                 BIG-Bench Hard        Challenging subset
 gsm8k               GSM8K                 Math word problems
 humaneval           HumanEval             Code generation
 mmlu                MMLU                  Language understanding
"""

# Sample 4: Another rich format variant
SAMPLE_RICH_VARIANT = """
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                              Core Benchmarks (57)                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

 agieval             AGIEval (All Subsets) Human-centric benchmark with 17 official
                                           qualifying exam questions from different
                                           countries and age groups
 arc-challenge       ARC-Challenge         AI2 Reasoning Challenge - grade school
                                           science (challenge set)
 arc-easy            ARC-Easy              AI2 Reasoning Challenge - grade school
                                           science (easy set)
 bigbench-hard       BIG-Bench Hard        A curated subset of 23 challenging tasks
                                           from the BIG-Bench benchmark
 boolq               BoolQ                 Boolean yes/no questions derived from
                                           naturally occurring contexts
"""

# Sample 5: JSON format (ideal case)
SAMPLE_JSON = """[
  {"name": "agieval", "category": "reasoning", "description": "Human-centric benchmark"},
  {"name": "arc", "category": "science", "description": "Grade school science questions"},
  {"name": "gsm8k", "category": "math", "description": "Grade school math"}
]"""

# Sample 6: Malformed/edge cases from actual output (the problematic case)
SAMPLE_MALFORMED = """
╭──────────────────────╮
│ Available Benchmarks │
╰──────────────────────╯
agieval             AGIEval (All          Human-centric benchmark with 17
Subsets)              official qualifying exam ...
clockbench          ClockBench            Clock benchmark - time-based
reasoning tasks
detailbench         DetailBench           Tests whether LLMs notify users
mmlu                MMLU                  Tests LLMs across 57 subjects
gsm8k               GSM8K                 Grade school math word problems
"""


def test_parser():
    test_cases = [
        ("Rich Table Format", SAMPLE_RICH_TABLE),
        ("Simple Table Format", SAMPLE_SIMPLE_TABLE),
        ("Plain Text Format", SAMPLE_PLAIN),
        ("Rich Variant", SAMPLE_RICH_VARIANT),
        ("JSON Format", SAMPLE_JSON),
        ("Malformed Output", SAMPLE_MALFORMED),
    ]
    
    print("=" * 70)
    print("BENCHMARK CLI PARSER TESTS (Standalone)")
    print("=" * 70)
    
    all_passed = True
    
    for name, sample in test_cases:
        print(f"\n{'─' * 70}")
        print(f"TEST: {name}")
        print(f"{'─' * 70}")
        
        benchmarks = parse_bench_list_output(sample)
        
        print(f"Parsed {len(benchmarks)} benchmarks:")
        for b in benchmarks:
            print(f"  ✓ {b.name:<20} ({b.category}) - {b.description_short[:40]}...")
        
        # Validation: check for garbage entries
        garbage_entries = []
        for b in benchmarks:
            # Check for box-drawing chars in name
            if any(c in b.name for c in '│─╭╮╯╰┃━┏┓┗┛━═║'):
                garbage_entries.append(f"box char in name: {b.name}")
            # Check for very short names
            elif len(b.name) < 3:
                garbage_entries.append(f"too short: {b.name}")
            # Check for common non-benchmark words
            elif b.name.lower() in ['subsets', 'available', 'benchmarks', 'total', 'commands', 'reasoning', 'tasks']:
                garbage_entries.append(f"common word: {b.name}")
        
        if garbage_entries:
            print(f"\n  ⚠️ GARBAGE DETECTED:")
            for g in garbage_entries:
                print(f"    - {g}")
            all_passed = False
        else:
            print(f"\n  ✅ No garbage entries detected")
        
        # Expected benchmarks for some tests
        expected_names = {'agieval', 'gsm8k', 'mmlu', 'humaneval'}
        parsed_names = {b.name for b in benchmarks}
        found_expected = expected_names & parsed_names
        
        if found_expected:
            print(f"  ✅ Found expected benchmarks: {found_expected}")
    
    print(f"\n{'=' * 70}")
    if all_passed:
        print("ALL TESTS PASSED! ✅")
    else:
        print("SOME TESTS FAILED! ❌ - Parser needs fixing")
    print(f"{'=' * 70}")
    
    return all_passed


if __name__ == "__main__":
    success = test_parser()
    exit(0 if success else 1)
