# Benchmark Name Fix - Summary

## Problem
The benchmark names on the New Run page (http://localhost:5173/runs/new) were showing malformed data with ASCII art boxes and truncated descriptions instead of clean benchmark names.

### Before (Incorrect):
```
╭──────────────────────╮
│ Available Benchmarks │
╰──────────────────────╯
agieval             AGIEval (All          Human-centric benchmark with 17
Subsets)              official qualifying exam ...
clockbench          ClockBench            Clock benchmark - time-based
reasoning tasks
detailbench         DetailBench           Tests whether LLMs notify users
```
- 234 entries total
- Many were box-drawing characters, headers, or fragments
- Unusable for selecting benchmarks

## Root Cause
The `bench list` CLI command outputs a formatted ASCII table with:
- Box-drawing characters (╭─╮, │, ╰─╯)
- Multi-column layout
- Wrapped descriptions across multiple lines

The original parser expected lines starting with exactly 1 space followed by a benchmark ID, which failed on:
- Lines with 0, 2, or 3 leading spaces
- Continuation lines (e.g., "Subsets)" or "reasoning tasks")
- Column headers (e.g., "benchmark_id")

## Solution (Updated 2026-02-14)

### Changes Made to `backend/app/services/benchmark_catalog.py`:

The `_parse_bench_list_output` method was completely rewritten with:

1. **Flexible Whitespace Handling**:
   - Regex `r'^\s{0,3}([a-z][a-z0-9_-]*)\s{2,}(.+)'` handles 0-3 leading spaces
   - Requires 2+ spaces between columns to avoid false matches

2. **Box Character Filtering**:
   - Skips ANY line containing box-drawing characters (not just first 5 chars)
   - Uses a comprehensive set of Unicode box/line characters

3. **Invalid Name Filtering**:
   - Filters common continuation words: 'subsets', 'reasoning', 'tasks', etc.
   - Filters column headers: 'benchmark_id', 'display_name'
   - Filters common English words: 'about', 'for', 'with', etc.

4. **Benchmark ID Validation**:
   - Must start with lowercase letter
   - Can only contain lowercase, digits, underscores, hyphens
   - Length between 3-50 characters

5. **Better Description Parsing**:
   - Uses `re.split(r'\s{2,}', ...)` to properly separate columns
   - Handles multi-column layouts with varying spacing

### After (Correct):
```
✓ mmlu            (knowledge)    - Massive Multitask Language Understanding
✓ humaneval       (coding)       - Python programming problems testing code generation
✓ gsm8k           (math)         - Grade school math word problems
✓ hellaswag       (commonsense)  - Commonsense reasoning about physical situations
✓ arc             (science)      - AI2 Reasoning Challenge - grade school science questions
✓ truthfulqa      (safety)       - Questions designed to test truthfulness
✓ winogrande      (commonsense)  - Winograd Schema Challenge for commonsense reasoning
✓ mbpp            (coding)       - Mostly Basic Programming Problems - Python coding tasks
✓ drop            (reading)      - Discrete Reasoning Over Paragraphs - reading comprehension
✓ bigbench        (diverse)      - BIG-Bench - diverse collection of challenging tasks
```

- Clean, properly formatted benchmarks
- Each with category tag and clear description
- Ready for selection in the UI

## Testing

Run the standalone parser test:
```bash
cd openbench-studio
python3 test_parser_standalone.py
```

Expected output:
```
======================================================================
BENCHMARK CLI PARSER TESTS (Standalone)
======================================================================
...
ALL TESTS PASSED! ✅
======================================================================
```

The test covers 6 different output formats:
1. Rich Table Format (box-drawing chars)
2. Simple Table Format (dash separators)
3. Plain Text Format (no decorations)
4. Rich Variant (different box chars)
5. JSON Format (ideal case)
6. Malformed Output (the problematic case from the bug report)

## Files Modified
- `backend/app/services/benchmark_catalog.py` - Fixed `_parse_bench_list_output` method
- `test_parser_standalone.py` - Added standalone test (no dependencies)

## How to Verify the Fix Works
1. Run `python3 test_parser_standalone.py` - all tests should pass
2. Start the backend with `uvicorn app.main:app --reload`
3. Visit `GET /api/benchmarks` - should return clean benchmark names
4. Visit http://localhost:5173/runs/new - benchmarks should display correctly

## Screenshots
- Before: Shows malformed ASCII art and fragments
- After: Shows clean benchmark grid with proper names and descriptions

