export const GET = async () => {
  const headers = {
    'Content-Type': 'application/xml'
  };

  const base = 'https://dolphinhouse-alibaug.com';
  const now = new Date().toISOString();

  const pages = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    { path: '/rooms', priority: '0.9', changefreq: 'weekly' },
    { path: '/booking', priority: '0.9', changefreq: 'daily' },
    { path: '/attractions', priority: '0.8', changefreq: 'weekly' },
    { path: '/group-corporate-bookings', priority: '0.8', changefreq: 'weekly' },
    { path: '/alibaug-family-group-guide-2026', priority: '0.8', changefreq: 'weekly' },
    { path: '/why-smart-travelers-choose-nagaon', priority: '0.8', changefreq: 'weekly' },
    { path: '/dolphin-watching-alibaug-guide', priority: '0.8', changefreq: 'weekly' },
    { path: '/gallery', priority: '0.8', changefreq: 'weekly' },
    { path: '/contact', priority: '0.8', changefreq: 'monthly' },
    { path: '/about', priority: '0.7', changefreq: 'monthly' },
    { path: '/faq', priority: '0.7', changefreq: 'monthly' },
    { path: '/menu', priority: '0.6', changefreq: 'monthly' },
    { path: '/booking-policy', priority: '0.4', changefreq: 'yearly' },
    { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
    { path: '/terms', priority: '0.3', changefreq: 'yearly' },
    { path: '/disclaimer', priority: '0.2', changefreq: 'yearly' }
  ];

  const urls = pages
    .map(({ path, priority, changefreq }) => `  <url>\n    <loc>${base}${path}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers });
};
