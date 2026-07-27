import { describe, expect, it } from 'vitest';
import type { ResourceLoadProgress } from '../domain/models';
import { readJsonResponseWithProgress } from './bankRepository';

describe('readJsonResponseWithProgress', () => {
  it('reports streamed byte progress before parsing and completion', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ready: true, words: 3_000 }));
    const splitAt = Math.floor(bytes.length / 2);
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, splitAt));
        controller.enqueue(bytes.slice(splitAt));
        controller.close();
      },
    }), {
      headers: { 'content-length': String(bytes.length) },
    });
    const updates: ResourceLoadProgress[] = [];

    await expect(readJsonResponseWithProgress(response, (progress) => {
      updates.push(progress);
    })).resolves.toEqual({ ready: true, words: 3_000 });

    expect(updates[0]).toMatchObject({ phase: 'downloading', percentage: 0 });
    expect(updates.some((progress) => (
      progress.phase === 'downloading'
      && progress.percentage !== null
      && progress.percentage > 0
      && progress.percentage < 100
    ))).toBe(true);
    expect(updates.at(-2)).toMatchObject({ phase: 'processing', percentage: 99 });
    expect(updates.at(-1)).toMatchObject({ phase: 'complete', percentage: 100 });
  });
});