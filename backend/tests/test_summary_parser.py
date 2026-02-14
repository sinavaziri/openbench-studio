"""
Tests for the benchmark summary parser.

Tests cover:
- Parsing JSON results from stdout
- Parsing text-based results from stdout
- Extracting primary metrics
- Handling breakdowns
- Error handling for missing/malformed data
"""

import json
import os
from pathlib import Path

import pytest

# Set test environment before imports
os.environ["OPENBENCH_SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["OPENBENCH_ENCRYPTION_KEY"] = "test-encryption-key-32chars"

from app.runner.summary_parser import (
    Summary,
    MetricValue,
    Breakdown,
    BreakdownItem,
    parse_json_results,
    parse_mock_results,
    extract_accuracy_from_text,
    extract_metrics_from_dict,
    extract_breakdowns_from_dict,
    parse_summary,
    parse_and_write_summary,
)


class TestParseJsonResults:
    """Tests for JSON result parsing."""

    def test_parse_results_prefix(self):
        """Should parse RESULTS: prefixed JSON."""
        stdout = 'RESULTS: {"accuracy": 0.85}'
        
        result = parse_json_results(stdout)
        
        assert result is not None
        assert result["accuracy"] == 0.85

    def test_parse_json_at_end(self):
        """Should parse JSON at end of output."""
        stdout = """
        Running benchmark...
        Processing...
        {"accuracy": 0.92, "f1": 0.88}
        """
        
        result = parse_json_results(stdout)
        
        assert result is not None
        assert result["accuracy"] == 0.92
        assert result["f1"] == 0.88

    def test_parse_json_embedded(self):
        """Should find JSON embedded in output."""
        stdout = """
        Starting benchmark run
        Model initialized
        {"score": 0.75, "total": 100}
        Run complete.
        """
        
        result = parse_json_results(stdout)
        
        assert result is not None
        assert result["score"] == 0.75

    def test_parse_no_json(self):
        """Should return None when no JSON found."""
        stdout = """
        Running benchmark...
        Complete!
        """
        
        result = parse_json_results(stdout)
        
        assert result is None

    def test_parse_invalid_json(self):
        """Should return None for invalid JSON."""
        stdout = 'RESULTS: {not valid json}'
        
        result = parse_json_results(stdout)
        
        assert result is None


class TestParseMockResults:
    """Tests for mock result parsing."""

    def test_parse_mock_results_valid(self):
        """Should parse valid mock results."""
        stdout = 'RESULTS: {"accuracy": 0.85, "total_samples": 100}'
        
        result = parse_mock_results(stdout)
        
        assert result is not None
        assert result["accuracy"] == 0.85
        assert result["total_samples"] == 100

    def test_parse_mock_results_multiline(self):
        """Should find RESULTS: in multiline output."""
        # Note: parse_mock_results looks for lines starting with RESULTS:
        # Leading whitespace causes the line.startswith check to fail
        stdout = """Running mock benchmark...
Progress: 100%
RESULTS: {"score": 0.95}
Done."""
        
        result = parse_mock_results(stdout)
        
        assert result is not None
        assert result["score"] == 0.95


class TestExtractAccuracyFromText:
    """Tests for text-based accuracy extraction."""

    def test_extract_accuracy_percentage(self):
        """Should extract accuracy from percentage format."""
        content = "Final accuracy: 85%"
        
        result = extract_accuracy_from_text(content)
        
        assert result == 0.85

    def test_extract_accuracy_decimal(self):
        """Should extract accuracy from decimal format."""
        content = "accuracy: 0.92"
        
        result = extract_accuracy_from_text(content)
        
        assert result == 0.92

    def test_extract_accuracy_with_equals(self):
        """Should extract accuracy with = sign."""
        content = "Accuracy = 75.5%"
        
        result = extract_accuracy_from_text(content)
        
        assert result == 0.755

    def test_extract_score(self):
        """Should extract score metric."""
        content = "Final score: 0.88"
        
        result = extract_accuracy_from_text(content)
        
        assert result == 0.88

    def test_extract_f1(self):
        """Should extract F1 score."""
        content = "F1: 0.79"
        
        result = extract_accuracy_from_text(content)
        
        assert result == 0.79

    def test_extract_no_metric(self):
        """Should return None when no metric found."""
        content = "Benchmark complete, no metrics available."
        
        result = extract_accuracy_from_text(content)
        
        assert result is None

    def test_extract_case_insensitive(self):
        """Should be case insensitive."""
        content = "ACCURACY: 90%"
        
        result = extract_accuracy_from_text(content)
        
        assert result == 0.90


class TestExtractMetricsFromDict:
    """Tests for metric extraction from dictionaries."""

    def test_extract_accuracy_primary(self):
        """Accuracy should be primary metric when present."""
        data = {"accuracy": 0.85, "f1": 0.82, "precision": 0.88}
        
        primary, metrics = extract_metrics_from_dict(data)
        
        assert primary is not None
        assert primary.name == "accuracy"
        assert primary.value == 0.85
        assert len(metrics) == 3

    def test_extract_score_primary(self):
        """Score should be primary when accuracy not present."""
        data = {"score": 0.90, "total": 100}
        
        primary, metrics = extract_metrics_from_dict(data)
        
        assert primary is not None
        assert primary.name == "score"
        assert primary.value == 0.90

    def test_extract_skips_metadata(self):
        """Should skip metadata fields."""
        data = {"accuracy": 0.85, "total_samples": 1000, "limit": 100}
        
        primary, metrics = extract_metrics_from_dict(data)
        
        metric_names = [m.name for m in metrics]
        assert "total_samples" not in metric_names
        assert "limit" not in metric_names

    def test_extract_fallback_first(self):
        """Should use first metric as primary if no priority key."""
        data = {"custom_metric": 0.75}
        
        primary, metrics = extract_metrics_from_dict(data)
        
        assert primary is not None
        assert primary.name == "custom_metric"


class TestExtractBreakdowns:
    """Tests for breakdown extraction."""

    def test_extract_nested_dict_breakdown(self):
        """Should extract breakdown from nested dict."""
        data = {
            "accuracy": 0.85,
            "by_category": {
                "math": 0.90,
                "science": 0.80,
                "history": 0.85
            }
        }
        
        breakdowns = extract_breakdowns_from_dict(data)
        
        assert len(breakdowns) == 1
        assert breakdowns[0].name == "by_category"
        assert len(breakdowns[0].items) == 3

    def test_extract_list_breakdown(self):
        """Should extract breakdown from list of dicts."""
        data = {
            "results": [
                {"category": "easy", "value": 0.95},
                {"category": "medium", "value": 0.80},
                {"category": "hard", "value": 0.65}
            ]
        }
        
        breakdowns = extract_breakdowns_from_dict(data)
        
        assert len(breakdowns) == 1
        assert breakdowns[0].name == "results"
        assert len(breakdowns[0].items) == 3

    def test_extract_no_breakdowns(self):
        """Should return empty list when no breakdowns."""
        data = {"accuracy": 0.85}
        
        breakdowns = extract_breakdowns_from_dict(data)
        
        assert breakdowns == []


class TestParseSummary:
    """Tests for full summary parsing."""

    def test_parse_summary_with_json(self, artifact_dir_with_results):
        """Should parse summary from JSON results."""
        summary = parse_summary(artifact_dir_with_results)
        
        assert summary is not None
        assert summary.primary_metric is not None
        assert summary.primary_metric.value == 0.85
        assert len(summary.metrics) > 0

    def test_parse_summary_text_only(self, artifact_dir_text_only):
        """Should extract metrics from text output."""
        summary = parse_summary(artifact_dir_text_only)
        
        assert summary is not None
        assert summary.primary_metric is not None
        # Should find 72.5% accuracy
        assert summary.primary_metric.value == 0.725

    def test_parse_summary_missing_stdout(self, temp_dir):
        """Should handle missing stdout.log gracefully."""
        empty_dir = temp_dir / "empty_run"
        empty_dir.mkdir()
        
        summary = parse_summary(empty_dir)
        
        assert summary is not None
        assert "stdout.log not found" in summary.notes

    def test_parse_summary_empty_stdout(self, temp_dir):
        """Should handle empty stdout.log."""
        run_dir = temp_dir / "empty_stdout_run"
        run_dir.mkdir()
        (run_dir / "stdout.log").write_text("")
        
        summary = parse_summary(run_dir)
        
        assert summary is not None
        assert summary.primary_metric is None


class TestParseAndWriteSummary:
    """Tests for parsing and writing summary files."""

    def test_write_summary_file(self, artifact_dir_with_results):
        """Should write summary.json to artifact directory."""
        summary = parse_and_write_summary(artifact_dir_with_results)
        
        summary_path = artifact_dir_with_results / "summary.json"
        assert summary_path.exists()
        
        # Verify contents
        with open(summary_path) as f:
            written = json.load(f)
        
        assert written["schema_version"] == 1
        assert written["primary_metric"]["value"] == 0.85

    def test_summary_schema_version(self, artifact_dir_with_results):
        """Summary should have correct schema version."""
        summary = parse_and_write_summary(artifact_dir_with_results)
        
        assert summary.schema_version == 1


class TestSummaryModel:
    """Tests for the Summary Pydantic model."""

    def test_summary_defaults(self):
        """Summary should have sensible defaults."""
        summary = Summary()
        
        assert summary.schema_version == 1
        assert summary.primary_metric is None
        assert summary.metrics == []
        assert summary.breakdowns == []
        assert summary.notes == []

    def test_metric_value_model(self):
        """MetricValue should serialize correctly."""
        metric = MetricValue(name="accuracy", value=0.85, unit="percent")
        
        data = metric.model_dump()
        
        assert data["name"] == "accuracy"
        assert data["value"] == 0.85
        assert data["unit"] == "percent"

    def test_breakdown_model(self):
        """Breakdown should contain items."""
        breakdown = Breakdown(
            name="by_difficulty",
            items=[
                BreakdownItem(key="easy", value=0.95),
                BreakdownItem(key="hard", value=0.75),
            ]
        )
        
        assert len(breakdown.items) == 2
        assert breakdown.items[0].key == "easy"
