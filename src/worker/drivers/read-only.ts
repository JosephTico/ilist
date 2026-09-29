import { HttpError } from '../http';
import type { DriverCapability, StorageDriver } from './types';

const MUTATING_CAPABILITIES: Partial<Record<DriverCapability, true>> = {
  upload: true,
  multipartUpload: true,
  createFolder: true,
  rename: true,
  move: true,
  copy: true,
  delete: true,
};

const MUTATING_METHODS: Record<string, true> = {
  createFolder: true,
  upload: true,
  rename: true,
  move: true,
  copy: true,
  remove: true,
};

export function mountReadOnly(): HttpError {
  return new HttpError(403, 'MOUNT_READ_ONLY', 'This storage is read-only');
}

/**
 * A view of `driver` that cannot change anything: mutating capabilities and the resumable-upload adapter are
 * removed, so every capability check (listing flags, upload sessions, route guards) sees a read-only storage,
 * and the mutating methods reject even if a caller skips the check.
 */
export function readOnlyDriver(driver: StorageDriver): StorageDriver {
  const capabilities = new Set([...driver.capabilities].filter((capability) => !MUTATING_CAPABILITIES[capability]));
  return new Proxy(driver, {
    get(target, property) {
      if (property === 'capabilities') return capabilities;
      if (property === 'resumableUpload') return undefined;
      if (property === 'readOnly') return true;
      if (typeof property === 'string' && MUTATING_METHODS[property]) return () => Promise.reject(mountReadOnly());
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
