import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CLIENT_IP_HEADER,
  configureClientIp,
  trustProxyFrom,
} from './client-ip';

/** Spins up a tiny express app that echoes what the API would see. */
async function echoServer(trust: string) {
  const app = express();
  configureClientIp(app, trust);
  app.get('/whoami', (req, res) => {
    res.json({ ip: req.ip, header: req.headers[CLIENT_IP_HEADER] });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    get: async (headers: Record<string, string> = {}) =>
      (await (
        await fetch(`http://127.0.0.1:${port}/whoami`, { headers })
      ).json()) as { ip: string; header: string },
  };
}

describe('client IP behind the reverse proxy', () => {
  let close: (() => void) | undefined;
  afterEach(() => close?.());

  it('takes X-Forwarded-For from a trusted proxy (loopback/private nets by default)', async () => {
    const s = await echoServer(trustProxyFrom(undefined));
    close = () => s.server.close();
    const seen = await s.get({ 'x-forwarded-for': '203.0.113.7' });
    expect(seen.ip).toBe('203.0.113.7');
    expect(seen.header).toBe('203.0.113.7');
  });

  it('uses the rightmost untrusted hop, so a client-forged XFF prefix is ignored', async () => {
    const s = await echoServer(trustProxyFrom(undefined));
    close = () => s.server.close();
    // Client sent "1.1.1.1"; the proxy appended the real peer.
    const seen = await s.get({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' });
    expect(seen.ip).toBe('203.0.113.7');
  });

  it('ignores X-Forwarded-For when the peer is not a trusted proxy', async () => {
    const s = await echoServer('10.0.0.0/8'); // loopback NOT trusted here
    close = () => s.server.close();
    const seen = await s.get({ 'x-forwarded-for': '203.0.113.7' });
    expect(seen.ip).toBe('127.0.0.1');
    expect(seen.header).toBe('127.0.0.1');
  });

  it('overwrites a client-supplied client-ip header', async () => {
    const s = await echoServer('10.0.0.0/8');
    close = () => s.server.close();
    const seen = await s.get({ [CLIENT_IP_HEADER]: '9.9.9.9' });
    expect(seen.header).toBe('127.0.0.1');
  });

  it('TRUST_PROXY env overrides the default', () => {
    expect(trustProxyFrom(undefined)).toBe('loopback, uniquelocal');
    expect(trustProxyFrom('172.18.0.0/16')).toBe('172.18.0.0/16');
    expect(trustProxyFrom('  ')).toBe('loopback, uniquelocal');
  });
});
