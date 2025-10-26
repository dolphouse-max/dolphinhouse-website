export const GET = async () => {
  const headers = {
    'Content-Type': 'application/xml'
  };

  const base = 'https://dolphinhouse-alibaug.com';
  const now = new Date().toISOString();

  const paths = [
    '/',
    '/rooms',
    '/attractions',
    '/booking',
    '/booking-policy',
    '/contact',
    '/faq',
    '/privacy',
    '/terms',
    '/disclaimer',
    '/pre-checkin',
    '/pay',
    '/submit-payment-proof',
    '/thank-you'
  ];

  const urls = paths
    .map((p) => `  <url>\n    <loc>${base}${p}</loc>\n    <lastmod>${now}</lastmod>\n  </url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers });
};