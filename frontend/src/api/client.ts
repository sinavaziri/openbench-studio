const API_BASE = '/api';
const TOKEN_KEY = 'openbench_token';

// Request timeout in milliseconds
const DEFAULT_TIMEOUT = 30000;

/**
 * Custom API Error class with additional context
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly detail: string;
  public readonly code?: string;
  public readonly isNetworkError: boolean;
  public readonly isAuthError: boolean;
  public readonly isTimeout: boolean;
  public readonly recoverable: boolean;

  constructor(
    message: string,
    statusCode: number = 0,
    detail?: string,
    options?: { 
      isNetworkError?: boolean; 
      isAuthError?: boolean;
      isTimeout?: boolean;
      code?: string;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.detail = detail || message;
    this.code = options?.code;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isAuthError = options?.isAuthError ?? (statusCode === 401);
    this.isTimeout = options?.isTimeout ?? false;
    
    // Determine if error is recoverable (can retry)
    this.recoverable = this.isNetworkError || 
      this.isTimeout ||
      statusCode === 429 || // Rate limited
      statusCode >= 500;    // Server errors
  }
}

// =============================================================================
// Auth Types
// =============================================================================

export interface User {
  user_id: string;
  email: string;
  created_at: string;
  is_active: boolean;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
}

// =============================================================================
// API Key Types
// =============================================================================

// Dynamic provider type (string for flexibility)
export type ApiKeyProvider = string;

export interface ApiKeyPublic {
  key_id: string;
  provider: string;
  key_preview: string;
  custom_env_var?: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyCreate {
  provider: string;
  key: string;
  custom_env_var?: string;
}

export interface ProviderInfo {
  provider: string;
  env_var: string;
  display_name: string;
  color: string;
}

export interface ProviderDefinition {
  id: string;
  displayName: string;
  envVar: string;
  color: string;
}

// =============================================================================
// Settings Import/Export Types
// =============================================================================

export interface EncryptedApiKey {
  provider: string;
  encrypted_value: string;
  custom_env_var?: string;
}

export interface SettingsExport {
  schema_version: number;
  exported_at: string;
  encrypted: boolean;
  salt?: string;
  api_keys: EncryptedApiKey[];
}

export interface SettingsImportRequest {
  data: SettingsExport;
  password?: string;
}

export interface ImportPreview {
  api_keys: {
    provider: string;
    display_name: string;
    key_preview: string;
    custom_env_var?: string;
  }[];
  will_overwrite: string[];
  new_providers: string[];
  errors: string[];
}

export interface ImportResponse {
  status: string;
  imported_count: number;
  skipped_count: number;
  details: string[];
}

// =============================================================================
// Model Discovery Types
// =============================================================================

export interface ModelCapabilities {
  vision: boolean;
  code_execution: boolean;
  function_calling: boolean;
  json_mode: boolean;
  streaming: boolean;
}

export interface ModelPricing {
  input_per_1m?: number;
  output_per_1m?: number;
  currency: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  capabilities?: ModelCapabilities;
  pricing?: ModelPricing;
}

export interface ModelProvider {
  name: string;
  provider_key: string;
  models: ModelInfo[];
}

export interface AvailableModelsResponse {
  providers: ModelProvider[];
}

// =============================================================================
// Benchmark Types
// =============================================================================

export interface BenchmarkRequirements {
  vision: boolean;
  code_execution: boolean;
  function_calling: boolean;
  min_context_length?: number;
}

export interface Benchmark {
  name: string;
  category: string;
  description_short: string;
  description?: string;  // Full description for detail view
  tags: string[];
  featured?: boolean;  // Whether this is a featured/popular benchmark
  source?: string;  // Source of benchmark: "builtin", "plugin", "github", "cli"
  requirements?: BenchmarkRequirements;  // Model capability requirements
  estimated_tokens?: number;  // Average tokens per sample
  sample_count?: number;  // Total samples in benchmark
}

export interface RunConfig {
  schema_version?: number;  // Config schema version for reproducibility
  benchmark: string;
  model: string;
  limit?: number;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  timeout?: number;
  epochs?: number;
  max_connections?: number;
}

export interface RunDuplicateOverrides {
  model?: string;
  limit?: number;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  timeout?: number;
  epochs?: number;
  max_connections?: number;
}

export interface RunSummary {
  run_id: string;
  benchmark: string;
  model: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  created_at: string;
  started_at?: string;
  finished_at?: string;
  scheduled_for?: string;
  primary_metric?: number;
  primary_metric_name?: string;
  estimated_cost?: number;
  tags: string[];
  notes?: string;
  template_name?: string;
}

export interface ScheduledRunCreate {
  benchmark: string;
  model: string;
  scheduled_for: string;
  limit?: number;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  timeout?: number;
  epochs?: number;
  max_connections?: number;
}

export interface ScheduledRunUpdate {
  scheduled_for: string;
}

export interface RunFilters {
  limit?: number;
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  benchmark?: string;
  tag?: string;
  started_after?: string;
  started_before?: string;
  sort_by?: 'created_at' | 'benchmark' | 'model';
  sort_order?: 'asc' | 'desc';
}

export interface RunListResponse {
  runs: RunSummary[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

// Structured summary types
export interface MetricValue {
  name: string;
  value: number;
  unit?: string | null;
}

export interface BreakdownItem {
  key: string;
  value: number;
  unit?: string | null;
}

export interface Breakdown {
  name: string;
  items: BreakdownItem[];
}

export interface ResultSummary {
  schema_version: number;
  primary_metric: MetricValue | null;
  metrics: MetricValue[];
  breakdowns: Breakdown[];
  notes: string[];
  raw: {
    source: string;
    hint: string;
  };
}

export interface RunDetail extends RunSummary {
  started_at?: string;
  scheduled_for?: string;
  artifact_dir?: string;
  exit_code?: number;
  error?: string;
  config?: RunConfig;
  command?: string;  // Exact CLI command for reproducibility
  artifacts: string[];
  stdout_tail?: string;
  stderr_tail?: string;
  summary?: ResultSummary | null;  // Structured results summary
  tags: string[];  // User-defined tags for organization
  notes?: string;  // User notes for the run
  template_id?: string;  // ID of template used (if created from template)
}

// =============================================================================
// Run Template Types
// =============================================================================

export interface RunTemplate {
  template_id: string;
  user_id: string;
  name: string;
  benchmark: string;
  model: string;
  config?: RunConfig;
  created_at: string;
  updated_at: string;
}

export interface RunTemplateSummary {
  template_id: string;
  name: string;
  benchmark: string;
  model: string;
  created_at: string;
}

export interface RunTemplateCreate {
  name: string;
  benchmark: string;
  model: string;
  limit?: number;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  timeout?: number;
  epochs?: number;
  max_connections?: number;
}

// =============================================================================
// Notification Types
// =============================================================================

export interface NotificationSettings {
  email_enabled: boolean;
  webhook_url: string | null;
  notify_on_complete: boolean;
  notify_on_failure: boolean;
}

export interface NotificationSettingsUpdate {
  email_enabled?: boolean;
  webhook_url?: string;
  notify_on_complete?: boolean;
  notify_on_failure?: boolean;
}

export interface NotificationLog {
  log_id: string;
  run_id: string | null;
  notification_type: 'email' | 'webhook';
  status: 'sent' | 'failed';
  message: string | null;
  created_at: string;
}

export interface WebhookTestResponse {
  success: boolean;
  status_code: number | null;
  message: string;
}

export interface SmtpStatusResponse {
  smtp_enabled: boolean;
  message: string;
}

// SSE Event Types
export interface SSEStatusEvent {
  status: string;
  timestamp: string;
}

export interface SSELogLineEvent {
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface SSEProgressEvent {
  current: number;
  total: number;
  percentage: number;
  message?: string;
}

export interface SSECompletedEvent {
  exit_code: number;
  finished_at: string | null;
}

export interface SSEFailedEvent {
  exit_code: number;
  error: string | null;
  finished_at: string | null;
}

export interface SSECanceledEvent {
  finished_at: string | null;
}

export interface SSEHeartbeatEvent {
  timestamp: string;
}

// =============================================================================
// Stats/Analytics Types
// =============================================================================

export interface HistoryDataPoint {
  date: string;
  total: number;
  completed: number;
  failed: number;
  avg_score: number | null;
}

export interface HistoryResponse {
  data: HistoryDataPoint[];
  period: string;
  start_date: string;
  end_date: string;
}

export interface ModelStats {
  model: string;
  run_count: number;
  completed_count: number;
  failed_count: number;
  avg_score: number | null;
  min_score: number | null;
  max_score: number | null;
  success_rate: number;
}

export interface ModelsResponse {
  models: ModelStats[];
  total_runs: number;
}

export interface BenchmarkStats {
  benchmark: string;
  run_count: number;
  completed_count: number;
  failed_count: number;
  avg_score: number | null;
  last_run: string | null;
}

export interface BenchmarksResponse {
  benchmarks: BenchmarkStats[];
  total_runs: number;
}

export interface SummaryStats {
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  running_runs: number;
  success_rate: number;
  avg_score: number | null;
  unique_models: number;
  unique_benchmarks: number;
}

export type SSEEventHandlers = {
  onStatus?: (event: SSEStatusEvent) => void;
  onLogLine?: (event: SSELogLineEvent) => void;
  onProgress?: (event: SSEProgressEvent) => void;
  onCompleted?: (event: SSECompletedEvent) => void;
  onFailed?: (event: SSEFailedEvent) => void;
  onCanceled?: (event: SSECanceledEvent) => void;
  onHeartbeat?: (event: SSEHeartbeatEvent) => void;
  onError?: (error: Error) => void;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    // Load token from localStorage on init
    this.token = localStorage.getItem(TOKEN_KEY);
  }

  // ===========================================================================
  // Token Management
  // ===========================================================================

  setToken(token: string | null): void {
    this.token = token;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  getToken(): string | null {
    return this.token;
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }

  // ===========================================================================
  // HTTP Request Helper
  // ===========================================================================

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requireAuth: boolean = false,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    // Add auth header if we have a token
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    } else if (requireAuth) {
      throw new ApiError(
        'Please sign in to continue.',
        401,
        'Authentication required',
        { isAuthError: true }
      );
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorDetail = '';
        let errorCode: string | undefined;
        let errorBody: Record<string, unknown> = {};
        
        try {
          errorBody = await response.json();
          // Handle both flat detail and structured error response
          if (typeof errorBody.detail === 'string') {
            errorDetail = errorBody.detail;
          } else if (errorBody.error && typeof errorBody.error === 'object') {
            const err = errorBody.error as Record<string, unknown>;
            errorDetail = (err.message as string) || (err.detail as string) || '';
            errorCode = err.code as string | undefined;
          }
        } catch {
          // Response wasn't JSON
        }
        
        // Map status codes to user-friendly messages
        const statusMessages: Record<number, string> = {
          400: errorDetail || 'The request was invalid. Please check your input.',
          401: 'Your session has expired. Please sign in again.',
          403: "You don't have permission to perform this action.",
          404: errorDetail || 'The requested resource was not found.',
          408: 'The request timed out. Please try again.',
          409: errorDetail || 'This action conflicts with existing data.',
          422: errorDetail || 'The provided data is invalid.',
          429: 'Too many requests. Please wait a moment and try again.',
          500: 'Something went wrong on our end. Please try again.',
          502: 'The server is temporarily unavailable.',
          503: 'The service is temporarily unavailable. Please try again later.',
          504: 'The request timed out. Please try again.',
        };
        
        const userMessage = statusMessages[response.status] || 
          errorDetail || 
          `Request failed (${response.status})`;
        
        // Handle auth errors specially - clear token
        if (response.status === 401) {
          this.setToken(null);
        }
        
        throw new ApiError(
          userMessage,
          response.status,
          errorDetail,
          { 
            isAuthError: response.status === 401,
            isTimeout: response.status === 408 || response.status === 504,
            code: errorCode,
          }
        );
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return {} as T;
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Already an ApiError, re-throw
      if (error instanceof ApiError) {
        throw error;
      }
      
      // Handle abort/timeout
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError(
          'The request timed out. Please check your connection and try again.',
          408,
          'Request timeout',
          { isNetworkError: true, isTimeout: true }
        );
      }
      
      // Handle network errors
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new ApiError(
          'Unable to connect to the server. Please check your internet connection.',
          0,
          'Network error',
          { isNetworkError: true }
        );
      }
      
      // Unknown error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new ApiError(
        `An unexpected error occurred: ${errorMessage}`,
        0,
        errorMessage
      );
    }
  }

  // ===========================================================================
  // Auth Endpoints
  // ===========================================================================

  async register(credentials: RegisterCredentials): Promise<AuthToken> {
    const result = await this.request<AuthToken>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    this.setToken(result.access_token);
    return result;
  }

  async login(credentials: LoginCredentials): Promise<AuthToken> {
    const result = await this.request<AuthToken>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    this.setToken(result.access_token);
    return result;
  }

  logout(): void {
    this.setToken(null);
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me', {}, true);
  }

  // ===========================================================================
  // API Keys Endpoints
  // ===========================================================================

  async listApiKeys(): Promise<ApiKeyPublic[]> {
    return this.request<ApiKeyPublic[]>('/api-keys', {}, true);
  }

  async createOrUpdateApiKey(keyCreate: ApiKeyCreate): Promise<ApiKeyPublic> {
    return this.request<ApiKeyPublic>('/api-keys', {
      method: 'POST',
      body: JSON.stringify(keyCreate),
    }, true);
  }

  async deleteApiKey(provider: ApiKeyProvider): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/api-keys/${provider}`, {
      method: 'DELETE',
    }, true);
  }

  async listProviders(): Promise<ProviderInfo[]> {
    return this.request<ProviderInfo[]>('/api-keys/providers');
  }

  async getAvailableModels(
    forceRefresh: boolean = false,
    includeCapabilities: boolean = false
  ): Promise<AvailableModelsResponse> {
    const params = new URLSearchParams();
    if (forceRefresh) params.set('force_refresh', 'true');
    if (includeCapabilities) params.set('include_capabilities', 'true');
    const query = params.toString();
    return this.request<AvailableModelsResponse>(`/available-models${query ? `?${query}` : ''}`, {}, true);
  }

  async getCompatibleModels(benchmark: string): Promise<{
    providers: ModelProvider[];
    incompatible: { model_id: string; reason: string }[];
    requirements: BenchmarkRequirements;
  }> {
    return this.request(`/compatible-models?benchmark=${encodeURIComponent(benchmark)}`, {}, true);
  }

  // ===========================================================================
  // Settings Import/Export Endpoints
  // ===========================================================================

  async exportSettings(password?: string): Promise<{ data: SettingsExport }> {
    const params = password ? `?password=${encodeURIComponent(password)}` : '';
    return this.request<{ data: SettingsExport }>(`/settings/export${params}`, {}, true);
  }

  async previewImport(data: SettingsExport, password?: string): Promise<ImportPreview> {
    return this.request<ImportPreview>('/settings/import/preview', {
      method: 'POST',
      body: JSON.stringify({ data, password }),
    }, true);
  }

  async importSettings(data: SettingsExport, password?: string): Promise<ImportResponse> {
    return this.request<ImportResponse>('/settings/import', {
      method: 'POST',
      body: JSON.stringify({ data, password }),
    }, true);
  }

  // ===========================================================================
  // Health & Benchmarks
  // ===========================================================================

  async healthCheck(): Promise<{ status: string }> {
    return this.request('/health');
  }

  async getVersion(): Promise<{ web_ui: string; openbench: string | null; openbench_available: boolean }> {
    return this.request('/version');
  }

  async listBenchmarks(): Promise<Benchmark[]> {
    return this.request('/benchmarks');
  }

  async getBenchmark(name: string): Promise<Benchmark> {
    return this.request(`/benchmarks/${name}`);
  }

  // ===========================================================================
  // Runs Endpoints
  // ===========================================================================

  async createRun(config: RunConfig): Promise<{ run_id: string }> {
    return this.request('/runs', {
      method: 'POST',
      body: JSON.stringify(config),
    }, true);  // Requires auth
  }

  async listRuns(filters: RunFilters = {}): Promise<RunListResponse> {
    const params = new URLSearchParams();
    if (filters.page) params.set('page', filters.page.toString());
    if (filters.per_page) params.set('per_page', filters.per_page.toString());
    if (filters.limit) params.set('per_page', filters.limit.toString()); // Legacy support
    if (filters.search) params.set('search', filters.search);
    if (filters.status) params.set('status', filters.status);
    if (filters.benchmark) params.set('benchmark', filters.benchmark);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.started_after) params.set('started_after', filters.started_after);
    if (filters.started_before) params.set('started_before', filters.started_before);
    if (filters.sort_by) params.set('sort_by', filters.sort_by);
    if (filters.sort_order) params.set('sort_order', filters.sort_order);
    const query = params.toString();
    return this.request(`/runs${query ? `?${query}` : ''}`);
  }

  async getRun(runId: string, logLines: number = 100): Promise<RunDetail> {
    return this.request(`/runs/${runId}?log_lines=${logLines}`);
  }

  async cancelRun(runId: string): Promise<{ status: string }> {
    return this.request(`/runs/${runId}/cancel`, {
      method: 'POST',
    }, true);  // Requires auth
  }

  async deleteRun(runId: string): Promise<{ status: string }> {
    return this.request(`/runs/${runId}`, {
      method: 'DELETE',
    }, true);  // Requires auth
  }

  async bulkDeleteRuns(runIds: string[]): Promise<{
    status: string;
    summary: {
      total: number;
      deleted: number;
      failed: number;
      running: number;
      not_found: number;
    };
    details: {
      deleted: string[];
      failed: string[];
      running: string[];
      not_found: string[];
    };
  }> {
    return this.request('/runs/bulk-delete', {
      method: 'POST',
      body: JSON.stringify(runIds),
    }, true);  // Requires auth
  }

  async updateRunTags(runId: string, tags: string[]): Promise<{ tags: string[] }> {
    return this.request(`/runs/${runId}/tags`, {
      method: 'PATCH',
      body: JSON.stringify({ tags }),
    }, true);  // Requires auth
  }

  async updateRunNotes(runId: string, notes: string | null): Promise<{ notes: string | null }> {
    return this.request(`/runs/${runId}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }, true);  // Requires auth
  }

  async duplicateRun(runId: string, overrides?: RunDuplicateOverrides): Promise<{ run_id: string }> {
    return this.request(`/runs/${runId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify(overrides || {}),
    }, true);  // Requires auth
  }

  async listAllTags(): Promise<string[]> {
    return this.request('/runs/tags');
  }

  // ===========================================================================
  // Scheduled Runs Endpoints
  // ===========================================================================

  async scheduleRun(config: ScheduledRunCreate): Promise<{ run_id: string }> {
    return this.request('/runs/schedule', {
      method: 'POST',
      body: JSON.stringify(config),
    }, true);  // Requires auth
  }

  async listScheduledRuns(): Promise<RunSummary[]> {
    return this.request('/runs/scheduled');
  }

  async updateScheduledRun(runId: string, update: ScheduledRunUpdate): Promise<RunSummary> {
    return this.request(`/runs/scheduled/${runId}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }, true);  // Requires auth
  }

  async cancelScheduledRun(runId: string): Promise<{ status: string }> {
    return this.request(`/runs/scheduled/${runId}`, {
      method: 'DELETE',
    }, true);  // Requires auth
  }

  // ===========================================================================
  // Templates Endpoints
  // ===========================================================================

  async listTemplates(): Promise<RunTemplateSummary[]> {
    return this.request<RunTemplateSummary[]>('/templates', {}, true);
  }

  async getTemplate(templateId: string): Promise<RunTemplate> {
    return this.request<RunTemplate>(`/templates/${templateId}`, {}, true);
  }

  async createTemplate(template: RunTemplateCreate): Promise<RunTemplate> {
    return this.request<RunTemplate>('/templates', {
      method: 'POST',
      body: JSON.stringify(template),
    }, true);
  }

  async updateTemplate(templateId: string, name: string): Promise<RunTemplate> {
    return this.request<RunTemplate>(`/templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }, true);
  }

  async deleteTemplate(templateId: string): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/templates/${templateId}`, {
      method: 'DELETE',
    }, true);
  }

  async createRunFromTemplate(templateId: string): Promise<{ run_id: string }> {
    return this.request<{ run_id: string }>(`/templates/${templateId}/run`, {
      method: 'POST',
    }, true);
  }

  // ===========================================================================
  // Stats/Analytics Endpoints
  // ===========================================================================

  async getSummaryStats(days: number = 30): Promise<SummaryStats> {
    return this.request<SummaryStats>(`/stats/summary?days=${days}`);
  }

  async getRunHistory(days: number = 30, period: 'day' | 'week' = 'day'): Promise<HistoryResponse> {
    return this.request<HistoryResponse>(`/stats/history?days=${days}&period=${period}`);
  }

  async getModelStats(days: number = 30, limit: number = 10): Promise<ModelsResponse> {
    return this.request<ModelsResponse>(`/stats/models?days=${days}&limit=${limit}`);
  }

  async getBenchmarkStats(days: number = 30, limit: number = 10): Promise<BenchmarksResponse> {
    return this.request<BenchmarksResponse>(`/stats/benchmarks?days=${days}&limit=${limit}`);
  }

  // ===========================================================================
  // Notification Endpoints
  // ===========================================================================

  async getNotificationSettings(): Promise<NotificationSettings> {
    return this.request<NotificationSettings>('/notifications/settings', {}, true);
  }

  async updateNotificationSettings(update: NotificationSettingsUpdate): Promise<NotificationSettings> {
    return this.request<NotificationSettings>('/notifications/settings', {
      method: 'PATCH',
      body: JSON.stringify(update),
    }, true);
  }

  async getNotificationLogs(limit: number = 50, offset: number = 0): Promise<NotificationLog[]> {
    return this.request<NotificationLog[]>(`/notifications/logs?limit=${limit}&offset=${offset}`, {}, true);
  }

  async testWebhook(webhookUrl: string): Promise<WebhookTestResponse> {
    return this.request<WebhookTestResponse>('/notifications/test-webhook', {
      method: 'POST',
      body: JSON.stringify({ webhook_url: webhookUrl }),
    }, true);
  }

  async getSmtpStatus(): Promise<SmtpStatusResponse> {
    return this.request<SmtpStatusResponse>('/notifications/smtp-status');
  }

  /**
   * Subscribe to run events via Server-Sent Events (SSE).
   * Returns a cleanup function to close the connection.
   */
  subscribeToRunEvents(runId: string, handlers: SSEEventHandlers): () => void {
    const eventSource = new EventSource(`${API_BASE}/runs/${runId}/events`);

    // Handle each event type
    eventSource.addEventListener('status', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEStatusEvent;
        handlers.onStatus?.(data);
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error('Failed to parse status event'));
      }
    });

    eventSource.addEventListener('log_line', (e) => {
      try {
        const data = JSON.parse(e.data) as SSELogLineEvent;
        handlers.onLogLine?.(data);
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error('Failed to parse log_line event'));
      }
    });

    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEProgressEvent;
        handlers.onProgress?.(data);
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error('Failed to parse progress event'));
      }
    });

    eventSource.addEventListener('completed', (e) => {
      try {
        const data = JSON.parse(e.data) as SSECompletedEvent;
        handlers.onCompleted?.(data);
        eventSource.close();
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error('Failed to parse completed event'));
      }
    });

    eventSource.addEventListener('failed', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEFailedEvent;
        handlers.onFailed?.(data);
        eventSource.close();
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error('Failed to parse failed event'));
      }
    });

    eventSource.addEventListener('canceled', (e) => {
      try {
        const data = JSON.parse(e.data) as SSECanceledEvent;
        handlers.onCanceled?.(data);
        eventSource.close();
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error('Failed to parse canceled event'));
      }
    });

    eventSource.addEventListener('heartbeat', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEHeartbeatEvent;
        handlers.onHeartbeat?.(data);
      } catch (err) {
        // Heartbeat errors are non-critical
      }
    });

    eventSource.onerror = () => {
      handlers.onError?.(new Error('SSE connection error'));
      eventSource.close();
    };

    // Return cleanup function
    return () => {
      eventSource.close();
    };
  }
}

export const api = new ApiClient();

