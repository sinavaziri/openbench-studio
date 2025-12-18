"""
Progress parser - extracts progress information from benchmark stdout.

Parses common patterns like:
- "Processing sample 5/100..."
- "Progress: 50%"
- "[10/20] Evaluating..."
- "Completed 15 of 30 samples"
"""

import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class Progress:
    """Represents parsed progress information."""
    current: int
    total: int
    percentage: float
    message: Optional[str] = None
    
    def to_dict(self) -> dict:
        return {
            "current": self.current,
            "total": self.total,
            "percentage": self.percentage,
            "message": self.message,
        }


# Common progress patterns
PATTERNS = [
    # "Processing sample 5/100..."
    re.compile(r"(?:sample|item|example)\s+(\d+)\s*/\s*(\d+)", re.IGNORECASE),
    # "[10/20] Evaluating..."
    re.compile(r"\[\s*(\d+)\s*/\s*(\d+)\s*\]"),
    # "Progress: 50%" or "50% complete"
    re.compile(r"(?:progress:?\s*)?(\d+(?:\.\d+)?)\s*%", re.IGNORECASE),
    # "Completed 15 of 30 samples"
    re.compile(r"(?:completed|processed|finished)\s+(\d+)\s+of\s+(\d+)", re.IGNORECASE),
    # "Evaluating 5/10"
    re.compile(r"(?:evaluating|running|processing)\s+(\d+)\s*/\s*(\d+)", re.IGNORECASE),
]


def parse_progress(line: str) -> Optional[Progress]:
    """
    Parse a log line and extract progress information if present.
    
    Returns None if no progress pattern is found.
    """
    line = line.strip()
    if not line:
        return None
    
    for pattern in PATTERNS:
        match = pattern.search(line)
        if match:
            groups = match.groups()
            
            # Check if it's a percentage pattern (single group)
            if len(groups) == 1:
                percentage = float(groups[0])
                # Estimate current/total from percentage
                current = int(percentage)
                total = 100
            else:
                # It's a current/total pattern
                current = int(groups[0])
                total = int(groups[1])
                percentage = (current / total * 100) if total > 0 else 0
            
            return Progress(
                current=current,
                total=total,
                percentage=round(percentage, 1),
                message=line[:200],  # Truncate long messages
            )
    
    return None


def parse_progress_from_lines(lines: list[str]) -> Optional[Progress]:
    """
    Parse multiple lines and return the most recent progress.
    """
    for line in reversed(lines):
        progress = parse_progress(line)
        if progress:
            return progress
    return None



