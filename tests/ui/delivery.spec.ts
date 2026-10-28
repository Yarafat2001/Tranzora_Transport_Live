import { test, expect } from '@playwright/test';
test('delivery headers and BFF fail closed', async ({ request, baseURL }) => {
  const page = await request.get('/login');
  expect(page.headers()['x-content-type-options']).toBe('nosniff');
  expect(page.headers()['x-frame-options']).toBe('DENY');
  expect(page.headers()['referrer-policy']).toBe('no-referrer');
  const forbidden = await request.post('/api/auth/login', { headers: {Origin:'https://untrusted.example','X-Tranzora-Request':'1'}, data: {} });
  expect(forbidden.status()).toBe(403);
  const chunks = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(40000))); controller.enqueue(new TextEncoder().encode('x'.repeat(40000))); controller.close(); } });
  const response = await fetch(`${baseURL}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json','X-Tranzora-Request':'1'}, body:chunks, duplex:'half' } as RequestInit);
  expect(response.status).toBe(413);
});
