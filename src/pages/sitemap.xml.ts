import { roomPages } from './rooms/[slug].astro';

export const prerender = true;

const base = 'https://dolphinhouse-alibaug.com';

const xmlEscape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export const GET = async () => {
  const headers = {
    'Content-Type': 'application/xml; charset=utf-8'
  };

  const lastmod = new Date().toISOString().split('T')[0];

  const pages = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    { path: '/rooms', priority: '0.9', changefreq: 'weekly' },
    ...Object.keys(roomPages).map((slug) => ({
      path: `/rooms/${slug}`,
      priority: '0.8',
      changefreq: 'weekly'
    })),
    { path: '/booking', priority: '0.9', changefreq: 'daily' },
    { path: '/attractions', priority: '0.8', changefreq: 'weekly' },
    { path: '/group-corporate-bookings', priority: '0.8', changefreq: 'weekly' },
    { path: '/resort-in-alibaug', priority: '0.8', changefreq: 'weekly' },
    { path: '/beach-resort-alibaug', priority: '0.8', changefreq: 'weekly' },
    { path: '/nagaon-beach-resort', priority: '0.8', changefreq: 'weekly' },
    { path: '/alibaug-family-group-guide-2026', priority: '0.8', changefreq: 'weekly' },
    { path: '/why-smart-travelers-choose-nagaon', priority: '0.8', changefreq: 'weekly' },
    { path: '/dolphin-watching-alibaug-guide', priority: '0.8', changefreq: 'weekly' },
    { path: '/resort-with-swimming-pool-alibaug', priority: '0.8', changefreq: 'weekly' },
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
    .map(({ path, priority, changefreq }) => [
      '  <url>',
      `    <loc>${xmlEscape(`${base}${path}`)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>'
    ].join('\n'))
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers });
};
