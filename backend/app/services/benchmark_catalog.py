"""
Benchmark catalog service - discovers benchmarks dynamically.

Discovery methods (in order of preference):
1. OpenBench Python API (direct import)
2. GitHub metadata (REST API)
3. CLI subprocess (`bench list`)
4. Static fallback list
"""

import asyncio
import json
import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Optional

import httpx

from app.db.models import Benchmark

# Try to import OpenBench library for direct API access
try:
    from inspect_ai._cli.list import list_benchmarks as inspect_list_benchmarks
    OPENBENCH_AVAILABLE = True
except ImportError:
    OPENBENCH_AVAILABLE = False
    inspect_list_benchmarks = None


@dataclass
class CacheEntry:
    """Cached data with expiration."""
    data: list[Benchmark]
    expires_at: float


class BenchmarkCatalog:
    """
    Service for retrieving benchmark metadata.
    
    Attempts to discover benchmarks dynamically via:
    1. GitHub metadata (primary source)
    2. `bench list` CLI (secondary source)
    3. Static list (fallback)
    
    Caches results with a configurable TTL.
    """
    
    # Cache TTL in seconds (10 minutes for CLI, 24 hours for GitHub)
    CACHE_TTL = 600
    GITHUB_CACHE_TTL = 86400  # 24 hours
    
    # GitHub URLs for benchmark metadata
    GITHUB_RAW_BASE = "https://raw.githubusercontent.com/groq/openbench/main"
    GITHUB_API_BASE = "https://api.github.com/repos/groq/openbench"
    
    def __init__(self):
        self._cache: Optional[CacheEntry] = None
        self._details_cache: dict[str, Benchmark] = {}
        self._github_cache: Optional[CacheEntry] = None
        
    def _is_bench_available(self) -> bool:
        """Check if the 'bench' CLI is available."""
        return shutil.which("bench") is not None
    
    async def _discover_via_python_api(self) -> Optional[list[Benchmark]]:
        """
        Discover benchmarks using OpenBench's Python API directly.
        
        This is the preferred method as it avoids subprocess overhead
        and text parsing fragility.
        """
        if not OPENBENCH_AVAILABLE:
            return None
        
        try:
            # Run in executor to avoid blocking
            loop = asyncio.get_event_loop()
            benchmarks_data = await loop.run_in_executor(None, self._list_benchmarks_sync)
            return benchmarks_data
        except Exception as e:
            print(f"Python API discovery failed: {e}")
            return None
    
    def _list_benchmarks_sync(self) -> Optional[list[Benchmark]]:
        """
        Synchronously list benchmarks using OpenBench's Python API.
        
        Note: The actual API structure may vary. We'll try multiple approaches.
        This method also detects plugin-provided benchmarks.
        """
        try:
            # Attempt 1: Try using inspect_ai's list function
            if inspect_list_benchmarks:
                result = inspect_list_benchmarks()
                if result:
                    benchmarks = []
                    # Parse the result - structure depends on inspect_ai version
                    if isinstance(result, list):
                        for item in result:
                            if isinstance(item, dict):
                                # Check if this is a plugin benchmark
                                is_plugin = item.get("is_plugin", False) or item.get("source") == "plugin"
                                benchmarks.append(Benchmark(
                                    name=item.get("name", ""),
                                    category=item.get("category", "general"),
                                    description_short=item.get("description", ""),
                                    tags=item.get("tags", []),
                                    source="plugin" if is_plugin else "builtin",
                                ))
                            elif hasattr(item, "name"):
                                # It's an object with attributes
                                is_plugin = getattr(item, "is_plugin", False)
                                benchmarks.append(Benchmark(
                                    name=getattr(item, "name", ""),
                                    category=getattr(item, "category", "general"),
                                    description_short=getattr(item, "description", ""),
                                    tags=getattr(item, "tags", []),
                                    source="plugin" if is_plugin else "builtin",
                                ))
                    return benchmarks if benchmarks else None
            
            # Attempt 2: Try importing benchmark registry directly
            try:
                from openbench import list_benchmarks
                result = list_benchmarks()
                if result:
                    benchmarks = []
                    for name in result:
                        benchmarks.append(Benchmark(
                            name=name,
                            category="general",
                            description_short=f"{name} benchmark",
                            tags=[],
                            source="builtin",
                        ))
                    return benchmarks if benchmarks else None
            except (ImportError, AttributeError):
                pass
            
        except Exception as e:
            print(f"Error in Python API benchmark listing: {e}")
        
        return None
    
    async def _fetch_github_metadata(self) -> Optional[list[Benchmark]]:
        """
        Fetch benchmark metadata from GitHub repository.
        
        Attempts to fetch from multiple sources:
        1. Try to get benchmark list from GitHub API (contents of src/openbench directory)
        2. Parse available benchmark names and create metadata
        
        Returns None if fetch fails.
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Try to list benchmark files from the src/openbench directory
                url = f"{self.GITHUB_API_BASE}/contents/src/openbench"
                response = await client.get(url)
                
                if response.status_code != 200:
                    return None
                
                contents = response.json()
                benchmarks = []
                
                # Look for Python files that might be benchmarks
                for item in contents:
                    if isinstance(item, dict) and item.get("type") == "file":
                        name = item.get("name", "")
                        # Skip __init__.py and other utility files
                        if name.endswith(".py") and not name.startswith("_"):
                            benchmark_name = name.replace(".py", "").replace("_", "-")
                            
                            # Try to fetch the file to get docstring/description
                            description = await self._fetch_benchmark_description(benchmark_name)
                            
                            benchmarks.append(Benchmark(
                                name=benchmark_name,
                                category="general",
                                description_short=description or f"{benchmark_name} benchmark",
                                tags=[],
                                source="github",
                            ))
                
                return benchmarks if benchmarks else None
                
        except (httpx.TimeoutException, httpx.HTTPError, Exception) as e:
            # Log error but don't fail - we have fallbacks
            print(f"GitHub metadata fetch failed: {e}")
            return None
    
    async def _fetch_benchmark_description(self, benchmark_name: str) -> Optional[str]:
        """
        Fetch description for a specific benchmark from GitHub.
        
        Tries to find documentation in docs/benchmarks/ directory.
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Try to fetch markdown documentation
                url = f"{self.GITHUB_RAW_BASE}/docs/benchmarks/{benchmark_name}.md"
                response = await client.get(url)
                
                if response.status_code == 200:
                    content = response.text
                    # Extract first paragraph or first 200 chars
                    lines = content.split("\n")
                    for line in lines:
                        line = line.strip()
                        if line and not line.startswith("#"):
                            return line[:200]
                
        except Exception:
            pass
        
        return None
    
    def _parse_bench_list_output(self, output: str) -> list[Benchmark]:
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
        
        import re
        
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
    
    def _discover_benchmarks_sync(self) -> Optional[list[Benchmark]]:
        """
        Synchronously discover benchmarks via CLI.
        Returns None if discovery fails.
        """
        if not self._is_bench_available():
            return None
        
        try:
            result = subprocess.run(
                ["bench", "list", "--all"],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0 and result.stdout.strip():
                parsed = self._parse_bench_list_output(result.stdout)
                # Only return if we got valid benchmarks (more than just noise)
                if parsed and len(parsed) >= 5:
                    # Filter out invalid entries
                    valid_benchmarks = [
                        b for b in parsed 
                        if len(b.name) >= 3 and len(b.name) <= 40 
                        and not b.name in ['about', 'for', 'with', 'and', 'the', 'from', 'this', 'that']
                    ]
                    if len(valid_benchmarks) >= 5:
                        return valid_benchmarks
        except (subprocess.TimeoutExpired, subprocess.SubprocessError):
            pass
        
        return None
    
    async def _discover_benchmarks(self) -> Optional[list[Benchmark]]:
        """
        Asynchronously discover benchmarks via CLI.
        Returns None if discovery fails.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._discover_benchmarks_sync)
    
    def _get_featured_benchmarks(self) -> list[Benchmark]:
        """Return the featured/popular benchmark list (always shown as cards)."""
        return [
            Benchmark(
                name="mmlu",
                category="knowledge",
                description_short="Massive Multitask Language Understanding - tests knowledge across 57 subjects",
                description="MMLU (Massive Multitask Language Understanding) is a benchmark that tests "
                           "language models on 57 subjects ranging from STEM to humanities. It evaluates "
                           "both world knowledge and problem solving ability.",
                tags=["knowledge", "reasoning", "multi-subject"],
                featured=True,
                source="builtin",
            ),
            Benchmark(
                name="humaneval",
                category="coding",
                description_short="Python programming problems testing code generation",
                description="HumanEval consists of 164 hand-written Python programming problems. "
                           "Each problem includes a function signature, docstring, body, and unit tests. "
                           "Models are evaluated on functional correctness.",
                tags=["coding", "python", "generation"],
                featured=True,
                source="builtin",
            ),
            Benchmark(
                name="gsm8k",
                category="math",
                description_short="Grade school math word problems",
                description="GSM8K is a dataset of 8.5K high-quality grade school math word problems. "
                           "These problems require multi-step reasoning to solve. Models are evaluated "
                           "on their ability to produce correct final answers.",
                tags=["math", "reasoning", "word-problems"],
                featured=True,
                source="builtin",
            ),
            Benchmark(
                name="hellaswag",
                category="commonsense",
                description_short="Commonsense reasoning about physical situations",
                description="HellaSwag is a challenge dataset for evaluating commonsense NLI. "
                           "Models must select the most plausible continuation for scenarios involving "
                           "physical activities and common situations.",
                tags=["commonsense", "reasoning"],
                featured=True,
                source="builtin",
            ),
            Benchmark(
                name="arc",
                category="science",
                description_short="AI2 Reasoning Challenge - grade school science questions",
                description="The AI2 Reasoning Challenge (ARC) consists of 7,787 science exam questions. "
                           "The Challenge Set contains only questions that were answered incorrectly by "
                           "both a retrieval-based algorithm and a word co-occurrence algorithm.",
                tags=["science", "reasoning", "multiple-choice"],
                featured=True,
                source="builtin",
            ),
            Benchmark(
                name="truthfulqa",
                category="safety",
                description_short="Questions designed to test truthfulness and avoid common misconceptions",
                description="TruthfulQA measures whether a language model is truthful in generating "
                           "answers to questions. It contains 817 questions spanning 38 categories, "
                           "including health, law, finance and politics.",
                tags=["truthfulness", "safety", "qa"],
                featured=True,
                source="builtin",
            ),
            Benchmark(
                name="winogrande",
                category="commonsense",
                description_short="Winograd Schema Challenge for commonsense reasoning",
                description="WinoGrande is a large-scale dataset of 44k problems inspired by Winograd "
                           "Schema Challenge. It tests commonsense reasoning by requiring models to "
                           "resolve pronoun references correctly.",
                tags=["commonsense", "reasoning", "coreference"],
                featured=True,
                source="builtin",
            ),
            Benchmark(
                name="mbpp",
                category="coding",
                description_short="Mostly Basic Programming Problems - Python coding tasks",
                description="MBPP (Mostly Basic Programming Problems) consists of around 1,000 crowd-sourced "
                           "Python programming problems. Each problem includes a task description, code solution, "
                           "and 3 automated test cases.",
                tags=["coding", "python", "generation"],
                featured=True,
                source="builtin",
            ),
            Benchmark(
                name="drop",
                category="reading",
                description_short="Discrete Reasoning Over Paragraphs - reading comprehension",
                description="DROP is a reading comprehension benchmark requiring discrete reasoning over "
                           "paragraphs. Questions require counting, sorting, addition, or other discrete operations.",
                tags=["reading", "reasoning", "math"],
                featured=True,
                source="builtin",
            ),
            Benchmark(
                name="bigbench",
                category="diverse",
                description_short="BIG-Bench - diverse collection of challenging tasks",
                description="BIG-Bench is a collaborative benchmark with 204 diverse tasks covering "
                           "linguistics, childhood development, math, common-sense reasoning, biology, "
                           "physics, social bias, and software development.",
                tags=["diverse", "reasoning", "comprehensive"],
                featured=True,
                source="builtin",
            ),
            # Additional benchmarks for pagination demo
            Benchmark(name="boolq", category="reading", description_short="Boolean questions from natural queries", tags=["qa", "reading"], featured=False, source="builtin"),
            Benchmark(name="piqa", category="commonsense", description_short="Physical commonsense reasoning", tags=["commonsense"], featured=False, source="builtin"),
            Benchmark(name="siqa", category="commonsense", description_short="Social interaction QA", tags=["commonsense", "social"], featured=False, source="builtin"),
            Benchmark(name="openbookqa", category="science", description_short="Elementary science questions", tags=["science", "qa"], featured=False, source="builtin"),
            Benchmark(name="squad", category="reading", description_short="Stanford Question Answering Dataset", tags=["reading", "qa"], featured=False, source="builtin"),
            Benchmark(name="race", category="reading", description_short="Reading comprehension from exams", tags=["reading"], featured=False, source="builtin"),
            Benchmark(name="math", category="math", description_short="Competition mathematics problems", tags=["math", "reasoning"], featured=False, source="builtin"),
            Benchmark(name="gpqa", category="science", description_short="Graduate-level science questions", tags=["science", "expert"], featured=False, source="builtin"),
            Benchmark(name="mmmu", category="diverse", description_short="Multimodal understanding benchmark", tags=["multimodal", "diverse"], featured=False, source="builtin"),
            Benchmark(name="mathvista", category="math", description_short="Mathematical reasoning in visual contexts", tags=["math", "multimodal"], featured=False, source="builtin"),
            Benchmark(name="medqa", category="science", description_short="Medical exam questions", tags=["medical", "science"], featured=False, source="builtin"),
            Benchmark(name="pubmedqa", category="science", description_short="Biomedical question answering", tags=["medical", "science"], featured=False, source="builtin"),
            Benchmark(name="triviaqa", category="knowledge", description_short="Trivia questions with evidence", tags=["knowledge", "qa"], featured=False, source="builtin"),
            Benchmark(name="naturalqa", category="knowledge", description_short="Questions from Google searches", tags=["knowledge", "qa"], featured=False, source="builtin"),
            Benchmark(name="coqa", category="reading", description_short="Conversational question answering", tags=["reading", "conversation"], featured=False, source="builtin"),
            Benchmark(name="quac", category="reading", description_short="Question answering in context", tags=["reading", "conversation"], featured=False, source="builtin"),
            Benchmark(name="hotpotqa", category="reading", description_short="Multi-hop question answering", tags=["reading", "reasoning"], featured=False, source="builtin"),
            Benchmark(name="commonsenseqa", category="commonsense", description_short="Commonsense question answering", tags=["commonsense", "qa"], featured=False, source="builtin"),
            Benchmark(name="socialiqa", category="commonsense", description_short="Social situations reasoning", tags=["commonsense", "social"], featured=False, source="builtin"),
            Benchmark(name="cosmosqa", category="commonsense", description_short="Commonsense reading comprehension", tags=["commonsense", "reading"], featured=False, source="builtin"),
            Benchmark(name="anli", category="reading", description_short="Adversarial NLI", tags=["reading", "nli"], featured=False, source="builtin"),
            Benchmark(name="mnli", category="reading", description_short="Multi-genre NLI", tags=["reading", "nli"], featured=False, source="builtin"),
            Benchmark(name="snli", category="reading", description_short="Stanford NLI", tags=["reading", "nli"], featured=False, source="builtin"),
            Benchmark(name="wnli", category="reading", description_short="Winograd NLI", tags=["reading", "nli"], featured=False, source="builtin"),
            Benchmark(name="rte", category="reading", description_short="Recognizing textual entailment", tags=["reading", "nli"], featured=False, source="builtin"),
        ]
    
    async def get_benchmarks(self, force_refresh: bool = False) -> list[Benchmark]:
        """
        Get all available benchmarks.
        
        Discovery order (tries each until successful):
        1. Python API (direct import - fastest, most reliable)
        2. GitHub metadata (cached for 24h)
        3. CLI discovery via `bench list`
        4. Static featured list (fallback)
        
        Merges all sources, with featured benchmarks always appearing first.
        """
        now = time.time()
        
        # Check cache
        if not force_refresh and self._cache and self._cache.expires_at > now:
            return self._cache.data
        
        # Always start with featured benchmarks
        featured = self._get_featured_benchmarks()
        featured_names = {b.name for b in featured}
        
        all_discovered = []
        discovered_names = set()
        
        # 1. Try Python API first (fastest and most reliable)
        python_api_benchmarks = await self._discover_via_python_api()
        if python_api_benchmarks:
            all_discovered.extend(python_api_benchmarks)
            discovered_names.update(b.name for b in python_api_benchmarks)
        
        # 2. Try GitHub metadata (with longer cache)
        github_benchmarks = None
        if not force_refresh and self._github_cache and self._github_cache.expires_at > now:
            github_benchmarks = self._github_cache.data
        else:
            github_benchmarks = await self._fetch_github_metadata()
            if github_benchmarks:
                self._github_cache = CacheEntry(
                    data=github_benchmarks,
                    expires_at=now + self.GITHUB_CACHE_TTL,
                )
        
        if github_benchmarks:
            # Add GitHub discoveries that aren't already found
            for b in github_benchmarks:
                if b.name not in discovered_names:
                    all_discovered.append(b)
                    discovered_names.add(b.name)
        
        # 3. Try CLI discovery (supplements other sources)
        cli_discovered = await self._discover_benchmarks()
        if cli_discovered:
            # Add CLI discoveries that aren't already found
            for b in cli_discovered:
                if b.name not in discovered_names:
                    all_discovered.append(b)
                    discovered_names.add(b.name)
        
        # Filter out any discovered benchmarks that are already in featured
        additional = [b for b in all_discovered if b.name not in featured_names]
        
        # Combine: featured first, then additional (sorted by name)
        all_benchmarks = featured + sorted(additional, key=lambda b: b.name)
        
        # Update cache
        self._cache = CacheEntry(
            data=all_benchmarks,
            expires_at=now + self.CACHE_TTL,
        )
        
        # Also populate details cache
        for b in all_benchmarks:
            self._details_cache[b.name] = b
        
        return all_benchmarks
    
    async def get_benchmark(self, name: str) -> Optional[Benchmark]:
        """
        Get a specific benchmark by name.
        
        Attempts to use cache, then discovery, then static lookup.
        """
        # Check details cache
        if name in self._details_cache:
            return self._details_cache[name]
        
        # Ensure main cache is populated
        benchmarks = await self.get_benchmarks()
        
        # Look up in cache
        if name in self._details_cache:
            return self._details_cache[name]
        
        # Try to get more details via bench describe (if available)
        if self._is_bench_available():
            details = await self._describe_benchmark(name)
            if details:
                self._details_cache[name] = details
                return details
        
        return None
    
    async def _describe_benchmark(self, name: str) -> Optional[Benchmark]:
        """
        Get detailed information about a benchmark via `bench describe`.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._describe_benchmark_sync, name)
    
    def _describe_benchmark_sync(self, name: str) -> Optional[Benchmark]:
        """Synchronously get benchmark details."""
        if not self._is_bench_available():
            return None
        
        try:
            result = subprocess.run(
                ["bench", "describe", name],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                # Try to parse JSON output
                try:
                    data = json.loads(result.stdout)
                    return Benchmark(
                        name=data.get("name", name),
                        category=data.get("category", "general"),
                        description_short=data.get("description_short", ""),
                        description=data.get("description", ""),
                        tags=data.get("tags", []),
                    )
                except json.JSONDecodeError:
                    # Return basic benchmark with output as description
                    return Benchmark(
                        name=name,
                        category="general",
                        description_short=result.stdout.strip()[:200],
                        description=result.stdout.strip(),
                        tags=[],
                    )
        except (subprocess.TimeoutExpired, subprocess.SubprocessError):
            pass
        
        return None
    
    def clear_cache(self) -> None:
        """Clear all cached data."""
        self._cache = None
        self._github_cache = None
        self._details_cache.clear()


# Global instance
benchmark_catalog = BenchmarkCatalog()


# Convenience functions for backward compatibility
async def get_benchmarks() -> list[Benchmark]:
    """Get all available benchmarks."""
    return await benchmark_catalog.get_benchmarks()


async def get_benchmark(name: str) -> Optional[Benchmark]:
    """Get a benchmark by name."""
    return await benchmark_catalog.get_benchmark(name)
