export class AzureRateLimiter {
  private isRateLimited: boolean = false;
  private rateLimitEndTime: number = 0;

  constructor() {
    console.log('[Azure] Service initialized');
  }

  async waitIfLimited(): Promise<void> {
    if (this.isRateLimited) {
      const waitTime = this.rateLimitEndTime - Date.now();
      if (waitTime > 0) {
        const remainingSeconds = Math.ceil(waitTime/1000);
        console.log(`[Azure] Rate limited - Waiting ${remainingSeconds}s before resuming`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      console.log('[Azure] Rate limit period ended - Resuming processing');
      this.isRateLimited = false;
    }
  }

  setRateLimit(retryAfter: number) {
    this.isRateLimited = true;
    this.rateLimitEndTime = Date.now() + (retryAfter * 1000);
    console.log(`[Azure] Rate limit encountered - Must wait ${retryAfter}s`);
  }
}

export class MistralRateLimiter {
  private isRateLimited: boolean = false;
  private rateLimitEndTime: number = 0;
  private readonly defaultRetryDelay = 60; // Default 60 seconds if no Retry-After header

  constructor() {
    console.log('[Mistral] Rate limiter initialized');
  }

  async waitIfLimited(): Promise<void> {
    if (this.isRateLimited) {
      const waitTime = this.rateLimitEndTime - Date.now();
      if (waitTime > 0) {
        const remainingSeconds = Math.ceil(waitTime/1000);
        console.log(`[Mistral] Rate limited - Waiting ${remainingSeconds}s before resuming`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      console.log('[Mistral] Rate limit period ended - Resuming processing');
      this.isRateLimited = false;
    }
  }

  setRateLimit(retryAfter?: number) {
    this.isRateLimited = true;
    const delay = retryAfter || this.defaultRetryDelay;
    this.rateLimitEndTime = Date.now() + (delay * 1000);
    console.log(`[Mistral] Rate limit encountered - Must wait ${delay}s`);
  }

  isLimited(): boolean {
    return this.isRateLimited;
  }

  getRateLimitInfo(): { isRateLimited: boolean; retryAfter: number; retryAt: string } | undefined {
    if (!this.isRateLimited) {
      return undefined;
    }
    
    return {
      isRateLimited: true,
      retryAfter: Math.ceil((this.rateLimitEndTime - Date.now()) / 1000),
      retryAt: new Date(this.rateLimitEndTime).toISOString()
    };
  }
} 