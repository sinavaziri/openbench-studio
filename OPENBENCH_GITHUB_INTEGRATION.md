# OpenBench GitHub Integration - Implementation Summary

This document summarizes the changes made to integrate the official OpenBench GitHub repository for improved reliability and automatic updates.

## Changes Implemented

### 1. GitHub Documentation Links ✅
**Files Modified:**
- `frontend/src/components/BenchmarkCard.tsx`

**Changes:**
- Added "Official Docs" link to each benchmark card
- Links point to `https://github.com/groq/openbench/tree/main/docs/benchmarks/{benchmark.name}.md`
- Uses ExternalLink icon from lucide-react
- Link opens in new tab with proper security attributes

### 2. GitHub Metadata Fetching ✅
**Files Modified:**
- `backend/app/services/benchmark_catalog.py`

**Changes:**
- Added `_fetch_github_metadata()` method to fetch benchmarks from GitHub API
- Fetches from `https://api.github.com/repos/groq/openbench/contents/src/openbench`
- Implements 24-hour cache for GitHub data (vs 10 minutes for CLI)
- Attempts to fetch descriptions from `docs/benchmarks/` directory
- Graceful fallback if GitHub API is unavailable

**Discovery Order:**
1. Python API (direct import - fastest)
2. GitHub metadata (cached 24h)
3. CLI discovery (`bench list`)
4. Static featured list (fallback)

### 3. OpenBench Python Dependency ✅
**Files Modified:**
- `backend/pyproject.toml`

**Changes:**
- Added `openbench>=0.5.3` to dependencies
- Enables direct Python API usage instead of subprocess calls

### 4. Python API Integration ✅
**Files Modified:**
- `backend/app/services/benchmark_catalog.py`

**Changes:**
- Added import attempt for `inspect_ai._cli.list.list_benchmarks`
- Implemented `_discover_via_python_api()` method
- Tries multiple import strategies:
  - `inspect_ai._cli.list.list_benchmarks()`
  - `openbench.list_benchmarks()`
- Falls back to subprocess if Python API unavailable
- Runs in executor to avoid blocking

**Benefits:**
- Faster than subprocess calls
- No text parsing required
- Better error handling
- Type-safe interfaces

### 5. Plugin System Support ✅
**Files Modified:**
- `backend/app/db/models.py`
- `backend/app/services/benchmark_catalog.py`
- `frontend/src/api/client.ts`
- `frontend/src/components/BenchmarkCard.tsx`

**Changes:**
- Added `source` field to Benchmark model (optional string)
- Tracks benchmark source: "builtin", "plugin", "github", "cli"
- Python API discovery detects plugin benchmarks via `is_plugin` attribute
- Frontend displays "Plugin" badge for plugin-provided benchmarks
- Badge uses Package icon from lucide-react

**UI Enhancement:**
- Plugin benchmarks show a small badge next to their name
- Badge styled with dark background and border

### 6. Version Detection ✅
**Files Modified:**
- `backend/app/api/routes/health.py`
- `frontend/src/api/client.ts`
- `frontend/src/pages/Settings.tsx`

**Changes:**
- Added `/api/version` endpoint
- Detects OpenBench version via:
  - Python import (`openbench.__version__`)
  - CLI command (`bench --version`)
- Returns version info for both Web UI and OpenBench CLI
- Settings page displays version information in dedicated section
- Shows "Not installed" if OpenBench CLI not available
- Includes link to OpenBench GitHub repository

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend UI                              │
│  - Benchmark cards with GitHub docs links                   │
│  - Plugin badges for custom benchmarks                       │
│  - Version info in Settings                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ /api/*
┌──────────────────────────▼──────────────────────────────────┐
│                    Backend (FastAPI)                         │
│  Discovery Priority:                                         │
│  1. Python API (import openbench)                           │
│  2. GitHub metadata (24h cache)                              │
│  3. CLI subprocess (bench list)                              │
│  4. Static fallback list                                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌──────────────┐  ┌──────────────┐
│ OpenBench Lib │  │ GitHub API   │  │ bench CLI    │
│ (Python API)  │  │ (REST)       │  │ (subprocess) │
└───────────────┘  └──────────────┘  └──────────────┘
```

## Benefits

### Reliability
- Multiple fallback layers ensure benchmarks are always available
- GitHub API provides canonical source of truth
- Graceful degradation if any source fails

### Maintenance
- Reduced manual updates of benchmark metadata
- Automatic discovery of new benchmarks
- Descriptions maintained by OpenBench team

### Performance
- Python API faster than subprocess calls
- 24-hour GitHub cache reduces API calls
- Parallel discovery from multiple sources

### User Experience
- Direct links to official documentation
- Clear indication of plugin vs built-in benchmarks
- Version information for troubleshooting

## Testing Recommendations

1. **Test with OpenBench installed:**
   - Verify Python API discovery works
   - Check version detection shows correct version
   - Confirm plugin benchmarks are detected

2. **Test without OpenBench:**
   - Verify graceful fallback to static list
   - Check version shows "Not installed"
   - Ensure UI remains functional

3. **Test GitHub API:**
   - Verify metadata fetching works
   - Test with GitHub API rate limit (should fallback)
   - Check 24-hour cache behavior

4. **Test UI:**
   - Verify documentation links work
   - Check plugin badges display correctly
   - Confirm version info appears in Settings

## Migration Notes

### For Users
- No breaking changes
- Existing functionality preserved
- New features available immediately

### For Developers
- Install dependencies: `pip install -e .` in backend directory
- OpenBench package now required (already was for CLI)
- No database migrations needed (source field is optional)

## Future Enhancements

Potential improvements for future iterations:

1. **Provider Configuration Sync**
   - Pull provider configs from OpenBench GitHub
   - Auto-update provider list

2. **Benchmark Schema Validation**
   - Validate benchmark configs against OpenBench schemas
   - Provide better error messages

3. **Version Compatibility Checking**
   - Warn if Web UI version incompatible with OpenBench version
   - Suggest updates when new versions available

4. **Enhanced Plugin Support**
   - UI for installing/managing plugins
   - Plugin marketplace integration

## References

- [OpenBench GitHub Repository](https://github.com/groq/openbench)
- [OpenBench Documentation](https://github.com/groq/openbench/tree/main/docs)
- [Inspect AI Documentation](https://inspect.ai-safety-institute.org.uk/)

