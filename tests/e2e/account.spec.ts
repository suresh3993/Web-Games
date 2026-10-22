import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { login, PASSWORD, registerVerified } from './helpers';

/** A valid solid-colour PNG (uncompressed deflate), big enough for the 64×64 avatar minimum, built without dependencies. */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x7c)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  // Stored (uncompressed) deflate blocks inside a zlib wrapper.
  const blocks: Buffer[] = [];
  for (let i = 0; i < raw.length; i += 65535) {
    const part = raw.subarray(i, i + 65535);
    const header = Buffer.alloc(5);
    header.writeUInt8(i + 65535 >= raw.length ? 1 : 0, 0);
    header.writeUInt16LE(part.length, 1);
    header.writeUInt16LE(~part.length & 0xffff, 3);
    blocks.push(header, part);
  }
  let a = 1;
  let b = 0;
  for (const byte of raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((b << 16) | a) >>> 0);
  const idat = Buffer.concat([Buffer.from([0x78, 0x01]), ...blocks, adler]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

test('edit the profile, upload an avatar, export data and delete the account', async ({ page }) => {
  test.setTimeout(120_000);
  const email = await registerVerified(page, 'account', 'Account Owner');
  await login(page, email);

  await page.goto('/profile/edit');
  await page.getByRole('textbox', { name: 'Display name' }).fill('Renamed Owner');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Display name updated.')).toBeVisible();

  await page.getByLabel('Choose an avatar image').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(96, 96) });
  await page.getByRole('button', { name: 'Save avatar' }).click();
  await expect(page.getByText('Avatar updated.')).toBeVisible();
  const avatar = page.getByRole('button', { name: /account menu for renamed owner/i }).locator('img');
  await expect(avatar).toHaveAttribute('src', /\/api\/v1\/media\/[a-z0-9]+\/256\.webp$/);
  const image = await page.request.get((await avatar.getAttribute('src'))!);
  expect(image.headers()['content-type']).toBe('image/webp');

  await page.goto('/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^suresh-data-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(readFileSync((await file.path())!, 'utf8')) as { account: { email: string; displayName: string } };
  expect(exported.account).toMatchObject({ email, displayName: 'Renamed Owner' });

  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('dialog').getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('Your account has been deleted.')).toBeVisible();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
});
