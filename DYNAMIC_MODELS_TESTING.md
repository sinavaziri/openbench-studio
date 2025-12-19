# Dynamic Model Discovery - Testing Guide

## Overview
This document describes how to test the dynamic model discovery feature that fetches available models from provider APIs based on user's API keys.

## Test Scenarios

### 1. No API Keys (Empty State)
**Setup:** User has no API keys configured

**Expected Behavior:**
- Model dropdown should show only "Custom Model" option
- No error messages should appear
- User can still enter a custom model identifier

**Test Steps:**
1. Log in to the application
2. Navigate to "New Run" page
3. Check model dropdown

**Expected Result:** Only "Custom" provider group with "Custom Model" option

---

### 2. Single Provider (OpenAI)
**Setup:** User has only OpenAI API key configured

**Expected Behavior:**
- Model dropdown should show OpenAI models fetched from API
- Models should be grouped under "OpenAI" optgroup
- "Custom" option should still be available

**Test Steps:**
1. Go to Settings
2. Add valid OpenAI API key
3. Wait for "Refreshing available models..." message
4. Navigate to "New Run" page
5. Check model dropdown

**Expected Result:** 
- OpenAI models listed (e.g., gpt-4o, gpt-4-turbo, gpt-3.5-turbo, etc.)
- Custom model option at the end

---

### 3. Multiple Providers
**Setup:** User has API keys for OpenAI, Anthropic, and Google

**Expected Behavior:**
- Model dropdown shows models from all three providers
- Models are grouped by provider
- Each provider's models are fetched dynamically

**Test Steps:**
1. Go to Settings
2. Add API keys for OpenAI, Anthropic, and Google
3. Navigate to "New Run" page
4. Check model dropdown

**Expected Result:**
- Three provider groups: OpenAI, Anthropic, Google
- Each group contains provider-specific models
- Custom option available

---

### 4. Invalid API Key
**Setup:** User enters an invalid/expired API key

**Expected Behavior:**
- That provider's models should not appear
- No error should break the entire page
- Other providers with valid keys should still work
- Custom option should always be available

**Test Steps:**
1. Go to Settings
2. Add an invalid API key for a provider
3. Navigate to "New Run" page
4. Check model dropdown

**Expected Result:**
- Provider with invalid key has no models listed
- Other providers work normally
- No error messages in UI (logged in console only)

---

### 5. Network Timeout
**Setup:** Simulate slow/failing network

**Expected Behavior:**
- Request should timeout after 10 seconds per provider
- Failed providers should be skipped
- Other providers should still work
- Custom option always available

**Test Steps:**
1. Add API keys for multiple providers
2. Disconnect network or use network throttling
3. Navigate to "New Run" page
4. Observe loading behavior

**Expected Result:**
- Loading indicator shows
- After timeout, available providers show
- No complete failure

---

### 6. Cache Behavior
**Setup:** User has API keys configured

**Expected Behavior:**
- First load fetches from APIs (slower)
- Subsequent loads use cache (faster)
- Cache expires after 1 hour
- Cache refreshes when API keys change

**Test Steps:**
1. Navigate to "New Run" page (first time)
2. Note loading time
3. Navigate away and back to "New Run"
4. Note loading time (should be instant)
5. Go to Settings and update an API key
6. Return to "New Run"
7. Models should refresh

**Expected Result:**
- First load: 1-3 seconds
- Cached loads: < 100ms
- Cache refreshes on key changes

---

### 7. Provider-Specific Models

#### OpenAI
**Expected Models:**
- GPT-4o variants
- GPT-4 Turbo variants
- GPT-3.5 Turbo variants
- o1 models

#### Anthropic (Static List)
**Expected Models:**
- Claude 3.5 Sonnet
- Claude 3 Opus
- Claude 3 Sonnet
- Claude 3 Haiku
- Claude 2.x

#### Google
**Expected Models:**
- Gemini 2.0 Flash
- Gemini 1.5 Pro
- Gemini 1.5 Flash

#### Groq
**Expected Models:**
- Llama 3.3 70B
- Llama 3.1 variants
- Mixtral models
- Whisper models

---

### 8. Custom Model Input
**Setup:** User selects "Custom Model" option

**Expected Behavior:**
- Text input field appears
- User can enter any model identifier
- Format hint shown: "provider/model-name"
- Form validates custom input

**Test Steps:**
1. Select "Custom Model" from dropdown
2. Enter custom model ID (e.g., "together/llama-3-70b")
3. Submit form

**Expected Result:**
- Custom model ID is used in run configuration
- Run starts successfully

---

### 9. Prefilled Model (Run Again)
**Setup:** User clicks "Run Again" on a completed run

**Expected Behavior:**
- If model exists in fetched list, it's pre-selected
- If model doesn't exist (custom), "Custom" is selected with model ID filled

**Test Steps:**
1. Complete a run with a standard model
2. Click "Run Again"
3. Check model selection

**Expected Result:**
- Model is pre-selected in dropdown
- All other config fields are pre-filled

---

### 10. Error States

#### API Error
**Scenario:** Provider API returns error (401, 403, 500)

**Expected:** Provider skipped, no UI error

#### Network Error
**Scenario:** Network completely unavailable

**Expected:** Error message shown, custom model still available

#### Malformed Response
**Scenario:** Provider returns unexpected JSON format

**Expected:** Provider skipped, logged to console

---

## Manual Testing Checklist

- [ ] Test with no API keys
- [ ] Test with single provider (OpenAI)
- [ ] Test with multiple providers
- [ ] Test with invalid API key
- [ ] Test cache behavior (first load vs subsequent)
- [ ] Test cache refresh after key update
- [ ] Test custom model input
- [ ] Test "Run Again" with standard model
- [ ] Test "Run Again" with custom model
- [ ] Verify loading states
- [ ] Verify error handling
- [ ] Check browser console for errors
- [ ] Test on different browsers (Chrome, Firefox, Safari)

---

## API Endpoints Tested

### Backend Endpoints
- `GET /available-models` - Fetch models for current user
- `GET /available-models?force_refresh=true` - Force cache refresh

### Provider APIs
- OpenAI: `https://api.openai.com/v1/models`
- Google: `https://generativelanguage.googleapis.com/v1/models`
- Mistral: `https://api.mistral.ai/v1/models`
- Groq: `https://api.groq.com/openai/v1/models`
- Together: `https://api.together.xyz/v1/models`
- Cohere: `https://api.cohere.ai/v1/models`
- Fireworks: `https://api.fireworks.ai/inference/v1/models`
- OpenRouter: `https://openrouter.ai/api/v1/models`

---

## Performance Benchmarks

**Target Metrics:**
- Initial model fetch: < 3 seconds (all providers in parallel)
- Cached fetch: < 100ms
- Per-provider timeout: 10 seconds max
- Cache TTL: 1 hour

**Actual Performance:**
- Will vary based on network and provider API response times
- Parallel fetching ensures total time ≈ slowest provider (not sum of all)

---

## Known Limitations

1. **Anthropic:** No public model listing API, uses static fallback list
2. **Rate Limits:** Provider APIs may have rate limits, cached to minimize calls
3. **Model Metadata:** Some providers return minimal metadata (no descriptions)
4. **Authentication:** Some providers may require additional headers or auth methods

---

## Troubleshooting

### Models not appearing
1. Check API key is valid
2. Check browser console for errors
3. Try force refresh: Settings → Update key
4. Check backend logs for API errors

### Slow loading
1. Check network connection
2. Check provider API status
3. Cache should speed up subsequent loads

### Wrong models showing
1. Clear cache: Update any API key in Settings
2. Check if provider API has changed
3. Verify API key has correct permissions

---

## Future Enhancements

1. **Model Filtering:** Filter by capability (vision, function calling, etc.)
2. **Model Search:** Search/filter in dropdown
3. **Model Details:** Show pricing, context window, capabilities
4. **Favorites:** Let users mark favorite models
5. **Provider Status:** Show if provider API is down
6. **Batch Refresh:** Manual "Refresh All Models" button

