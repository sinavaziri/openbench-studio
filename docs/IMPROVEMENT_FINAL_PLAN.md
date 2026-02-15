# OpenBench Studio - Final Improvement Plan

**Synthesized:** 2026-02-14  
**Based on:** Proposer V1 + Reviewer V1 feedback  
**Decision maker:** Artemis

---

## Approved Improvements (7 items)

### Phase 1: Foundation (Week 1)

#### 1. Configuration Management
**Complexity:** Small | **Impact:** High  
**Scope:**
- Centralize all config in `backend/app/core/config.py`
- Use Pydantic Settings with validation
- Environment variable documentation
- `.env.example` file

**Acceptance Criteria:**
- [ ] All config loaded from one place
- [ ] Validation errors on startup for missing required vars
- [ ] README updated with all env vars

---

#### 2. Health Check Endpoint
**Complexity:** Small | **Impact:** High  
**Scope:**
- Add `GET /health` endpoint
- Check database connectivity
- Return version, uptime, status
- Add `GET /ready` for Kubernetes readiness

**Acceptance Criteria:**
- [ ] `/health` returns JSON with db status
- [ ] Docker HEALTHCHECK uses this endpoint
- [ ] Fails gracefully if DB unreachable

---

#### 3. Test Suite & CI
**Complexity:** Medium | **Impact:** Critical  
**Scope:**
- pytest for backend (API routes first, then services)
- GitHub Actions workflow
- Coverage reporting (target 70%+)
- Pre-commit hooks for linting

**Acceptance Criteria:**
- [ ] 50+ API route tests
- [ ] CI runs on every PR
- [ ] Coverage badge in README
- [ ] Tests pass locally and in CI

---

### Phase 2: Reliability (Week 2)

#### 4. Rate Limiting
**Complexity:** Small | **Impact:** High  
**Scope:**
- Use `slowapi` library (not custom)
- Rate limit auth endpoints (login, register)
- Rate limit run creation
- Return proper 429 responses with Retry-After

**Acceptance Criteria:**
- [ ] Login: 5 attempts/minute
- [ ] Run creation: 10/minute
- [ ] 429 response includes Retry-After header

---

#### 5. Error Recovery & Retry
**Complexity:** Medium | **Impact:** High  
**Scope:**
- Exponential backoff for LLM API calls
- Configurable max retries per provider
- Auto-retry on 429, 500, 502, 503
- Clear error messages in UI

**Acceptance Criteria:**
- [ ] 429 errors auto-retry with backoff
- [ ] Max 5 retries with 1s → 32s backoff
- [ ] Retry attempts logged
- [ ] Final failure shows actionable message

---

#### 6. Database Indexes
**Complexity:** Small | **Impact:** Medium  
**Scope:**
- Add composite index on runs(user_id, created_at)
- Add index on runs(status)
- Add index on runs(benchmark)
- Migration file only

**Acceptance Criteria:**
- [ ] Migration adds 3 indexes
- [ ] Query performance tested with 1K runs
- [ ] No breaking changes

---

### Phase 3: Features (Week 3)

#### 7. Webhook Notifications
**Complexity:** Small | **Impact:** Medium  
**Scope:**
- POST to user-configured webhook URL on run complete/fail
- JSON payload with run summary
- Test webhook button in Settings
- Retry failed webhooks 3x

**Acceptance Criteria:**
- [ ] Webhook fires on completion
- [ ] Payload includes run_id, status, benchmark, model, score
- [ ] Test button shows success/failure
- [ ] Failed webhooks retry with backoff

---

## Explicitly Cut

| Proposal | Reason |
|----------|--------|
| Plugin System | Over-engineering, no demand |
| PWA Support | Wrong tool, adds complexity |
| Teams & RBAC | Massive scope, defer until demand |
| Full DB Optimization | Premature, just indexes for now |
| Browser Push Notifications | Complex, webhooks sufficient |
| API SDK Generation | Wait for API stability |

---

## Quick Wins (Sprinkle Throughout)

- [ ] Copy Run ID button
- [ ] Cost estimate display before run starts
- [ ] Favicon and meta tags
- [ ] Loading skeletons
- [ ] Confirm before cancel modal
- [ ] Run duration in dashboard

---

## Total Estimated Effort

| Phase | Items | Estimate |
|-------|-------|----------|
| Phase 1 | 3 | 3-4 days |
| Phase 2 | 3 | 3-4 days |
| Phase 3 | 1 | 1-2 days |
| Quick Wins | 6 | 1 day |

**Total:** ~10-12 days of focused work

---

STATUS: FINAL_PLAN_READY  
Approved improvements ready for implementation.
