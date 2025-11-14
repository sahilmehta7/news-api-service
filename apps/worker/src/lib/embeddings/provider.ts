import { createLogger } from "@news-api/logger";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitState,
  type CircuitBreakerOptions
} from "./circuit-breaker.js";
import { workerMetrics } from "../../metrics/registry.js";

const logger = createLogger({ name: "embeddings" });

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  getDimensions(): number;
}

interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 8000, // 8 seconds
  backoffMultiplier: 2
};

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  attempt = 0,
  providerName = "http"
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };

  try {
    return await fn();
  } catch (error) {
    if (attempt >= opts.maxRetries) {
      throw error;
    }

    // Track retry attempt
    workerMetrics.embeddingRetries.inc({ provider: providerName });

    const delay = Math.min(
      opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt),
      opts.maxDelayMs
    );

    logger.debug(
      { attempt: attempt + 1, maxRetries: opts.maxRetries, delayMs: delay },
      "Retrying embedding request after failure"
    );

    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryWithBackoff(fn, opts, attempt + 1, providerName);
  }
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  private readonly dimensions = 384;

  getDimensions(): number {
    return this.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    logger.debug({ textLength: text.length }, "Generating mock embedding");
    const embedding = new Array<number>(this.dimensions);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    for (let i = 0; i < this.dimensions; i++) {
      embedding[i] = Math.sin((hash + i) * 0.1) * 0.5 + 0.5;
    }
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map((val) => val / norm);
  }
}

export class HTTPEmbeddingProvider implements EmbeddingProvider {
  private readonly dimensions = 384;
  private readonly endpoint: string;
  private readonly timeout: number;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryOptions: RetryOptions;

  constructor(
    endpoint: string,
    timeout = 10_000,
    circuitBreakerOptions?: Partial<CircuitBreakerOptions>,
    retryOptions?: Partial<RetryOptions>
  ) {
    this.endpoint = endpoint;
    this.timeout = timeout;
    this.circuitBreaker = new CircuitBreaker({
      ...circuitBreakerOptions,
      onStateChange: (state) => {
        logger.info({ state, endpoint }, "Circuit breaker state changed");
      }
    });
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  }

  getDimensions(): number {
    return this.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const timer = workerMetrics.embeddingDuration.startTimer({
      provider: "http"
    });

    // Update circuit breaker state metric
    this.updateCircuitBreakerMetric();

    // Check circuit breaker first
    if (!this.circuitBreaker.canExecute()) {
      logger.warn(
        { endpoint: this.endpoint, state: this.circuitBreaker.getState() },
        "Circuit breaker is open, returning dummy embedding"
      );
      workerMetrics.embeddingRequests.inc({
        provider: "http",
        status: "circuit_breaker_open"
      });
      timer();
      return this.generateDummyEmbedding(text);
    }

    try {
      const embedding = await this.circuitBreaker.execute(() =>
        retryWithBackoff(
          () => this.fetchEmbedding(text),
          this.retryOptions,
          0,
          "http"
        )
      );
      workerMetrics.embeddingRequests.inc({
        provider: "http",
        status: "success"
      });
      timer();
      return embedding;
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        logger.warn(
          { endpoint: this.endpoint },
          "Circuit breaker opened, returning dummy embedding"
        );
        workerMetrics.embeddingRequests.inc({
          provider: "http",
          status: "circuit_breaker_open"
        });
        timer();
        return this.generateDummyEmbedding(text);
      }
      workerMetrics.embeddingRequests.inc({
        provider: "http",
        status: "error"
      });
      timer();
      throw error;
    } finally {
      this.updateCircuitBreakerMetric();
    }
  }

  private updateCircuitBreakerMetric(): void {
    const state = this.circuitBreaker.getState();
    const stateValue =
      state === CircuitState.CLOSED
        ? 0
        : state === CircuitState.HALF_OPEN
          ? 1
          : 2; // OPEN
    workerMetrics.embeddingCircuitBreakerState.set(
      { provider: "http" },
      stateValue
    );
  }

  private async fetchEmbedding(text: string): Promise<number[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Embedding API returned ${response.status}`);
      }

      const data = await response.json();
      if (!Array.isArray(data.embedding) || data.embedding.length !== this.dimensions) {
        throw new Error("Invalid embedding response format");
      }

      return data.embedding;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generate a dummy embedding when circuit breaker is open
   * This allows the system to continue operating, though with degraded quality
   */
  private generateDummyEmbedding(text: string): number[] {
    const embedding = new Array<number>(this.dimensions);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    for (let i = 0; i < this.dimensions; i++) {
      embedding[i] = Math.sin((hash + i) * 0.1) * 0.5 + 0.5;
    }
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map((val) => val / norm);
  }

  /**
   * Get circuit breaker state (for monitoring)
   */
  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker (for testing/recovery)
   */
  resetCircuitBreaker() {
    this.circuitBreaker.reset();
  }
}

export async function createEmbeddingProvider(): Promise<EmbeddingProvider> {
  const providerType = process.env.EMBEDDING_PROVIDER || "mock";
  const endpoint = process.env.EMBEDDING_ENDPOINT;
  const modelName = process.env.EMBEDDING_MODEL;

  // Circuit breaker configuration
  const failureThreshold = parseInt(
    process.env.EMBEDDING_CIRCUIT_BREAKER_FAILURE_THRESHOLD || "5",
    10
  );
  const successThreshold = parseInt(
    process.env.EMBEDDING_CIRCUIT_BREAKER_SUCCESS_THRESHOLD || "3",
    10
  );
  const timeout = parseInt(
    process.env.EMBEDDING_CIRCUIT_BREAKER_TIMEOUT_MS || "30000",
    10
  );

  // Retry configuration
  const maxRetries = parseInt(
    process.env.EMBEDDING_MAX_RETRIES || "3",
    10
  );
  const initialDelayMs = parseInt(
    process.env.EMBEDDING_RETRY_INITIAL_DELAY_MS || "1000",
    10
  );
  const maxDelayMs = parseInt(
    process.env.EMBEDDING_RETRY_MAX_DELAY_MS || "8000",
    10
  );

  // Timeout configuration
  const requestTimeout = parseInt(
    process.env.EMBEDDING_TIMEOUT_MS || "10000",
    10
  );

  if (providerType === "http" && endpoint) {
    logger.info(
      {
        endpoint,
        circuitBreaker: {
          failureThreshold,
          successThreshold,
          timeout
        },
        retry: {
          maxRetries,
          initialDelayMs,
          maxDelayMs
        },
        requestTimeout
      },
      "Using HTTP embedding provider with circuit breaker and retry"
    );
    return new HTTPEmbeddingProvider(
      endpoint,
      requestTimeout,
      {
        failureThreshold,
        successThreshold,
        timeout
      },
      {
        maxRetries,
        initialDelayMs,
        maxDelayMs
      }
    );
  }

  if (providerType === "node") {
    const { NodeEmbeddingProvider } = await import("./node-provider.js");
    logger.info({ modelName }, "Using Node.js embedding provider");
    return new NodeEmbeddingProvider(modelName);
  }

  logger.info("Using mock embedding provider");
  return new MockEmbeddingProvider();
}

