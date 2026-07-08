import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Highlight } from '@biblestdy/shared';
import type { AuthedRequest } from '../auth/session.guard';
import { HighlightsController } from './highlights.controller';
import type { HighlightsService } from './highlights.service';

const req = {
  user: { id: 'user-1', email: 'a@b.c', name: '' },
} as AuthedRequest;

function make(overrides: Partial<HighlightsService> = {}) {
  const service = {
    listForChapter: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
  return { service, controller: new HighlightsController(service) };
}

describe('HighlightsController', () => {
  it('lists scoped to the session user', async () => {
    const { service, controller } = make({
      listForChapter: vi.fn().mockResolvedValue([]),
    });
    await controller.list(req, 'WEB', 'JHN', '3');
    expect(service.listForChapter).toHaveBeenCalledWith(
      'user-1',
      'WEB',
      'JHN',
      3,
    );
  });

  it('rejects a list request missing params', async () => {
    const { controller } = make();
    await expect(controller.list(req, '', 'JHN', '3')).rejects.toThrow(
      BadRequestException,
    );
    await expect(controller.list(req, 'WEB', 'JHN', 'x')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates a highlight for the session user', async () => {
    const created = { id: 'h1' } as Highlight;
    const { service, controller } = make({
      create: vi.fn().mockResolvedValue(created),
    });
    const dto = {
      translationId: 'WEB',
      color: 'gold' as const,
      book: 'JHN',
      chapter: 3,
      startVerse: 16,
      startWord: 0,
      endVerse: 16,
      endWord: 2,
    };
    const result = await controller.create(req, dto);
    expect(result).toBe(created);
    expect(service.create).toHaveBeenCalledWith('user-1', dto);
  });

  it('404s when deleting a highlight the user does not own', async () => {
    const { controller } = make({ remove: vi.fn().mockResolvedValue(false) });
    await expect(controller.remove(req, 'nope')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('deletes an owned highlight', async () => {
    const { service, controller } = make({
      remove: vi.fn().mockResolvedValue(true),
    });
    await expect(controller.remove(req, 'h1')).resolves.toEqual({ ok: true });
    expect(service.remove).toHaveBeenCalledWith('user-1', 'h1');
  });
});
