/** Pluggable coherence/invalidation bus surface (publish / subscribe). */

export type CoherenceHandler = (payload: Record<string, unknown>) => void;

export interface CoherenceBus {
  publish(topic: string, payload: Record<string, unknown>): Promise<void>;
  /**
   * Register ``handler`` for ``topic``.
   * Returns an async stop function that ends the subscription cleanly.
   */
  subscribe(
    topic: string,
    handler: CoherenceHandler,
  ): Promise<() => Promise<void>>;
}
