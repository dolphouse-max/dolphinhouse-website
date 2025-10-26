export const GET = async () => {
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8'
  };

  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Sitemap: https://dolphinhouse-alibaug.com/sitemap.xml'
  ].join('\n') + '\n';

  return new Response(body, { headers });
};