export const GET = async ({ locals }) => {
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8'
  };

  const base = (locals?.runtime?.env?.SITE_URL || 'https://dolphinhouse-alibaug.com').replace(/\/$/, '');

  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    `Sitemap: ${base}/sitemap.xml`
  ].join('\n') + '\n';

  return new Response(body, { headers });
};