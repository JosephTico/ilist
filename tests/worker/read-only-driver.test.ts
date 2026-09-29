import { describe, expect, it, vi } from 'vitest';
import { createDriver } from '../../src/worker/drivers/registry';
import { readOnlyDriver } from '../../src/worker/drivers/read-only';
import type { DriverRegistry, StorageDriver, StorageItem } from '../../src/worker/drivers/types';
import type { Env, Mount } from '../../src/worker/types';

const item: StorageItem = {
  id: 'file-1', parentId: 'root', name: 'a.txt', kind: 'file', size: 1, contentType: 'text/plain', modifiedAt: null, etag: null,
};

class FakeDriver implements StorageDriver {
  readonly rootId = 'root';
  readonly capabilities = new Set(['list', 'download', 'upload', 'multipartUpload', 'createFolder', 'rename', 'move', 'copy', 'delete'] as const);
  readonly resumableUpload = { create: vi.fn(), uploadPart: vi.fn(), complete: vi.fn(), abort: vi.fn() };
  private readonly items = [item];
  createFolder = vi.fn(async () => item);
  upload = vi.fn(async () => item);
  rename = vi.fn(async () => item);
  move = vi.fn(async () => item);
  copy = vi.fn(async () => item);
  remove = vi.fn(async () => undefined);
  getDownload = vi.fn(async () => ({ kind: 'redirect' as const, url: 'https://example.test/a' }));
  isWithin = vi.fn(async () => true);
  // Reads `this`, so a wrapper that loses the receiver breaks here.
  async list() { return { items: this.items, nextCursor: null }; }
  async stat() { return this.items[0]!; }
}

const mount = (readOnly: boolean): Mount => ({
  id: 'm', name: 'Assets', mountPath: '/assets', driverType: 's3', provider: 'custom', enabled: true, isPublic: true, readOnly,
  sortOrder: 0, rootItemId: null, config: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } } as unknown as Env;

describe('read-only driver view', () => {
  it('drops every mutating capability but keeps listing and downloading', () => {
    const driver = readOnlyDriver(new FakeDriver());

    expect([...driver.capabilities].sort()).toEqual(['download', 'list']);
    expect(driver.readOnly).toBe(true);
    expect(driver.resumableUpload).toBeUndefined();
  });

  it.each([
    ['createFolder', (driver: StorageDriver) => driver.createFolder('root', 'x')],
    ['upload', (driver: StorageDriver) => driver.upload('root', 'x', new ReadableStream(), null)],
    ['rename', (driver: StorageDriver) => driver.rename('file-1', 'y')],
    ['move', (driver: StorageDriver) => driver.move('file-1', 'root')],
    ['copy', (driver: StorageDriver) => driver.copy('file-1', 'root')],
    ['remove', (driver: StorageDriver) => driver.remove('file-1')],
  ])('rejects %s without reaching the storage', async (method, call) => {
    const inner = new FakeDriver();

    await expect(call(readOnlyDriver(inner))).rejects.toMatchObject({ status: 403, code: 'MOUNT_READ_ONLY' });
    expect((inner as unknown as Record<string, { mock: { calls: unknown[] } }>)[method]!.mock.calls).toHaveLength(0);
  });

  it('still lists, stats, and downloads through the original driver', async () => {
    const driver = readOnlyDriver(new FakeDriver());

    await expect(driver.list('root')).resolves.toMatchObject({ items: [item] });
    await expect(driver.stat('file-1')).resolves.toBe(item);
    await expect(driver.getDownload('file-1', new Request('https://x.test'))).resolves.toMatchObject({ kind: 'redirect' });
  });

  it('is applied by createDriver only for read-only mounts', async () => {
    const inner = new FakeDriver();
    const registry: DriverRegistry = { s3: () => inner };

    const writable = await createDriver(env, mount(false), registry);
    const locked = await createDriver(env, mount(true), registry);

    expect(writable).toBe(inner);
    expect(writable.capabilities.has('upload')).toBe(true);
    expect(locked.capabilities.has('upload')).toBe(false);
  });
});
