import type { AccountStore } from './account.store';

/** In-memory AccountStore: seeds and inspects the per-user rows the delete
 * cascade must wipe (AccountService behavior tests). */
export class InMemoryAccountStore implements AccountStore {
  private users = new Set<string>();
  private highlights: { userId: string }[] = [];
  private annotations: { userId: string }[] = [];
  private sessions: { userId: string }[] = [];

  addUser(userId: string) {
    this.users.add(userId);
  }
  addHighlight(userId: string) {
    this.highlights.push({ userId });
  }
  addAnnotation(userId: string) {
    this.annotations.push({ userId });
  }
  addSession(userId: string) {
    this.sessions.push({ userId });
  }

  hasUser(userId: string) {
    return this.users.has(userId);
  }
  highlightCount(userId: string) {
    return this.highlights.filter((h) => h.userId === userId).length;
  }
  annotationCount(userId: string) {
    return this.annotations.filter((a) => a.userId === userId).length;
  }
  sessionCount(userId: string) {
    return this.sessions.filter((s) => s.userId === userId).length;
  }

  userExists(userId: string) {
    return Promise.resolve(this.users.has(userId));
  }

  deleteHighlights(userId: string) {
    this.highlights = this.highlights.filter((h) => h.userId !== userId);
    return Promise.resolve();
  }

  deleteAnnotations(userId: string) {
    this.annotations = this.annotations.filter((a) => a.userId !== userId);
    return Promise.resolve();
  }

  deleteSessions(userId: string) {
    this.sessions = this.sessions.filter((s) => s.userId !== userId);
    return Promise.resolve();
  }

  deleteUser(userId: string) {
    this.users.delete(userId);
    return Promise.resolve();
  }
}
