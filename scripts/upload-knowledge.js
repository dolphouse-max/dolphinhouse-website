// scripts/upload-knowledge.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_URL = process.env.API_URL || 'https://dolphinhouse-website.pages.dev';

async function uploadKnowledge() {
  console.log('📚 Starting knowledge upload...');

  // Read knowledge data
  const knowledgePath = path.join(__dirname, '../data/knowledge.json');
  const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf-8'));

  console.log(`Found ${knowledge.length} knowledge chunks`);

  // Prepare chunks without embeddings (we're using text search now)
  const chunks = knowledge.map(item => ({
    source: item.source,
    ref: item.ref,
    text: item.text
  }));

  // Upload to API
  console.log('\n📤 Uploading to database...');
  const response = await fetch(`${API_URL}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chunks),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Upload failed:', error);
    process.exit(1);
  }

  const result = await response.json();
  console.log('✅ Upload complete!', result);
  console.log(`\n🎉 Successfully uploaded ${result.count} knowledge chunks!`);
}

uploadKnowledge().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});