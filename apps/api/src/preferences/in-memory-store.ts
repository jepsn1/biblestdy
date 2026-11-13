import type { ReaderStyle } from '@biblestdy/shared';
import type { PreferencesStore } from './preferences.store';

export class InMemoryPreferencesStore implements PreferencesStore {
  private styles = new Map<string, ReaderStyle>();

  readerStyle(userId: string) {
    return Promise.resolve(this.styles.get(userId) ?? null);
  }

  setReaderStyle(userId: string, style: ReaderStyle) {
    this.styles.set(userId, style);
    return Promise.resolve();
  }
}
