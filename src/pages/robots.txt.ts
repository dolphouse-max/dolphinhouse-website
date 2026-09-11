export const GET = async () => {
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8'
  };

  const body = [
    '# Robots.txt for Dolphin House - GEO Optimized',
    '# Allow AI search to cite this resort, block only spam',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    '',
    '# AI Crawlers - ALLOWED so ChatGPT, Perplexity, Claude can recommend us',
    'User-agent: GPTBot',
    'User-agent: ChatGPT-User',
    'User-agent: OAI-SearchBot',
    'User-agent: Google-Extended',
    'User-agent: ClaudeBot',
    'User-agent: Claude-Web',
    'User-agent: anthropic-ai',
    'User-agent: PerplexityBot',
    'User-agent: Applebot-Extended',
    'User-agent: Amazonbot',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    '',
    '# Block only known spam/scrapers',
    'User-agent: Bytespider',
    'User-agent: CCBot',
    'Disallow: /',
    '',
    'Sitemap: https://dolphinhouse-alibaug.com/sitemap.xml'
  ].join('\n') + '\n';

  return new Response(body, { headers });
};