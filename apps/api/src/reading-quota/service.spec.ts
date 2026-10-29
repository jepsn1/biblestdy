import { randomUUID } from 'node:crypto';
import { beforeEach } from 'vitest';
import { quotaServiceContract } from './service.contract';
import { InMemoryQuotaStore } from './store';

quotaServiceContract('in-memory store', () => {
  // The in-memory store stands in for the database: every service instance in
  // a test shares it, like app instances sharing one Postgres.
  let store = new InMemoryQuotaStore();
  let userId = randomUUID();
  beforeEach(() => {
    store = new InMemoryQuotaStore();
    userId = randomUUID();
  });
  return { store: () => store, userId: () => userId };
});
