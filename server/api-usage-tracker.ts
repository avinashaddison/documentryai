interface ApiUsage {
  anthropic: number;
  replicate: number;
  deepgram: number;
  perplexity: number;
}

class ApiUsageTracker {
  private usage: ApiUsage = {
    anthropic: 0,
    replicate: 0,
    deepgram: 0,
    perplexity: 0,
  };

  increment(service: keyof ApiUsage, count: number = 1): void {
    this.usage[service] += count;
  }

  getUsage(): ApiUsage {
    return { ...this.usage };
  }

  reset(): void {
    this.usage = {
      anthropic: 0,
      replicate: 0,
      deepgram: 0,
      perplexity: 0,
    };
  }
}

export const apiUsageTracker = new ApiUsageTracker();
