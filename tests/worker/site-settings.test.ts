import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import type { Env } from '../../src/worker/types';

const origin = 'https://ilist.example';

async function login(): Promise<string> {
  const response = await SELF.fetch(`${origin}/api/admin/login`, {
    method: 'POST',
    headers: { 'CF-Connecting-IP': '127.0.0.3', 'content-type': 'application/json', origin },
    body: JSON.stringify({ username: 'admin', password: 'test-password' }),
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}

function putSettings(body: unknown, cookie?: string) {
  return SELF.fetch(`${origin}/api/admin/site`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

const putTitle = (title: unknown, cookie?: string) => putSettings({ title }, cookie);

async function publicSettings(): Promise<{ title: string; defaultView: string }> {
  const response = await SELF.fetch(`${origin}/api/site`);
  expect(response.status).toBe(200);
  return (await response.json() as { data: { title: string; defaultView: string } }).data;
}

const publicTitle = async () => (await publicSettings()).title;

afterEach(async () => {
  await (env as unknown as Env).DB.prepare("DELETE FROM settings WHERE key LIKE 'site.%'").run();
});

describe('site title', () => {
  it('defaults to iList for everyone', async () => {
    expect(await publicTitle()).toBe('iList');
  });

  it('is changed only by an administrator and is then visible to guests', async () => {
    expect((await putTitle('Card Vault')).status).toBe(401);
    expect(await publicTitle()).toBe('iList');

    const cookie = await login();
    const saved = await putTitle('  Card Vault  ', cookie);

    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ data: { title: 'Card Vault' } });
    expect(await publicTitle()).toBe('Card Vault');
  });

  it('resets to the default when saved empty', async () => {
    const cookie = await login();
    await putTitle('Card Vault', cookie);

    const reset = await putTitle('   ', cookie);

    expect(await reset.json()).toMatchObject({ data: { title: 'iList' } });
    expect(await publicTitle()).toBe('iList');
  });

  it.each([
    ['too long', 'x'.repeat(61)],
    ['a control character', 'bad\ntitle'],
    ['a non-string', 42],
  ])('rejects a title with %s and keeps the current one', async (_label, title) => {
    const cookie = await login();
    await putTitle('Kept', cookie);

    const response = await putTitle(title, cookie);

    expect(response.status).toBe(400);
    expect(await publicTitle()).toBe('Kept');
  });

  it('counts characters, not UTF-16 units, toward the limit', async () => {
    const cookie = await login();

    const response = await putTitle('🃏'.repeat(60), cookie);

    expect(response.status).toBe(200);
  });

  it('rejects cross-origin writes even with a valid session', async () => {
    const cookie = await login();

    const response = await SELF.fetch(`${origin}/api/admin/site`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie },
      body: JSON.stringify({ title: 'Hijacked' }),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await publicTitle()).toBe('iList');
  });
});

describe('site default view', () => {
  it('defaults to list for everyone', async () => {
    expect((await publicSettings()).defaultView).toBe('list');
  });

  it('is changed only by an administrator and is then what guests get', async () => {
    expect((await putSettings({ defaultView: 'grid' })).status).toBe(401);
    expect((await publicSettings()).defaultView).toBe('list');

    const cookie = await login();
    const saved = await putSettings({ defaultView: 'grid' }, cookie);

    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ data: { defaultView: 'grid' } });
    expect((await publicSettings()).defaultView).toBe('grid');
  });

  it('updates only the fields provided', async () => {
    const cookie = await login();
    await putSettings({ title: 'Card Vault', defaultView: 'grid' }, cookie);

    await putTitle('Renamed', cookie);
    expect(await publicSettings()).toMatchObject({ title: 'Renamed', defaultView: 'grid' });

    await putSettings({ defaultView: 'list' }, cookie);
    expect(await publicSettings()).toMatchObject({ title: 'Renamed', defaultView: 'list' });
  });

  it.each([
    ['an unknown view', { defaultView: 'tiles' }],
    ['a non-string view', { defaultView: 1 }],
    ['a valid view next to an invalid title', { defaultView: 'grid', title: 'x'.repeat(61) }],
  ])('rejects %s without changing anything', async (_label, body) => {
    const cookie = await login();
    await putSettings({ title: 'Kept', defaultView: 'list' }, cookie);

    expect((await putSettings(body, cookie)).status).toBe(400);
    expect(await publicSettings()).toMatchObject({ title: 'Kept', defaultView: 'list' });
  });

  it.each([[{}], [null], [[]], [{ unrelated: true }]])('rejects a body with no setting to change: %j', async (body) => {
    const cookie = await login();

    expect((await putSettings(body, cookie)).status).toBe(400);
  });
});

describe('hidden header controls', () => {
  const flags = ['hideGithubLink', 'hideLanguageSelector', 'hideLogin'] as const;

  it('shows every control by default', async () => {
    expect(await publicSettings()).toMatchObject({ hideGithubLink: false, hideLanguageSelector: false, hideLogin: false });
  });

  it.each(flags)('hides only %s, for guests too, and can show it again', async (flag) => {
    expect((await putSettings({ [flag]: true })).status).toBe(401);
    const cookie = await login();

    const hidden = await putSettings({ [flag]: true }, cookie);

    expect(hidden.status).toBe(200);
    const settings = await publicSettings();
    for (const other of flags) expect(settings[other as keyof typeof settings]).toBe(other === flag);

    await putSettings({ [flag]: false }, cookie);
    for (const other of flags) expect((await publicSettings())[other as never]).toBe(false);
  });

  it('updates only the fields provided and leaves title and view alone', async () => {
    const cookie = await login();
    await putSettings({ title: 'Card Vault', defaultView: 'grid', hideLogin: true }, cookie);

    await putSettings({ hideGithubLink: true }, cookie);

    expect(await publicSettings()).toMatchObject({
      title: 'Card Vault', defaultView: 'grid', hideLogin: true, hideGithubLink: true, hideLanguageSelector: false,
    });
  });

  it.each([['a string', 'yes'], ['a number', 1], ['null', null]])('rejects %s as a flag value without changing anything', async (_label, value) => {
    const cookie = await login();
    await putSettings({ hideLogin: true }, cookie);

    const response = await putSettings({ hideGithubLink: value, hideLogin: false }, cookie);

    expect(response.status).toBe(400);
    expect(await publicSettings()).toMatchObject({ hideGithubLink: false, hideLogin: true });
  });
});
