export const GET = async ({ locals }) => {
  const headers = {
    'Content-Type': 'application/xml'
  };

  // Prefer SITE_URL from environment; fallback to a placeholder that you should update.
  const base = (locals?.runtime?.env?.SITE_URL || 'https://www.dolphinhouse-alibaug.com').replace(/\/$/, '');
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