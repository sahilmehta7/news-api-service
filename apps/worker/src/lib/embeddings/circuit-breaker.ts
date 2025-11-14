import { createLogger } from "@news-api/logger";

const logger = createLogger({ name: "circuit-breaker" });

export enum CircuitState {
  CLOSED = "closed", // Normal operation
  OPEN = "open", // Failing, reject requests
  HALF_OPEN = "half-open" // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold: number; // Open circuit after N consecutive failures
  successThreshold: number; // Close circuit after N consecutive successes
  timeout: number; // Time in ms before transitioning from OPEN to HALF_OPEN
  onStateChange?: (state: CircuitState) => void;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30_000 // 30 seconds
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private readonly options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  getState(): CircuitState {
    return this.state;
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.successCount = 0;
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset success count in closed state
      this.successCount = 0;
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    this.successCount = 0;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during half-open, go back to open
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount++;
      if (this.failureCount >= this.options.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Check if request should be allowed
   */
  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Check if timeout has passed, transition to half-open
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime >= this.options.timeout
      ) {
        this.transitionTo(CircuitState.HALF_OPEN);
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow one request to test
    return true;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitBreakerOpenError("Circuit breaker is open");
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      logger.debug(
        { from: oldState, to: newState },
        "Circuit breaker state transition"
      );
      this.options.onStateChange?.(newState);
    }
  }

  /**
   * Reset circuit breaker to closed state (useful for testing)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

