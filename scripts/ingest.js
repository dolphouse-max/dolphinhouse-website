import fs from "fs";
import path from "path";
import csv from "csv-parser";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const D1_URL = "https://api.cloudflare.com/client/v4/accounts/" + process.env.CF_ACCOUNT_ID + "/d1/query";
const D1_DATABASE_ID = process.env.e8e9c4e8cbb5cd7137842f51149f8b10;  // <- add your real D1 DB UUID here (see below)
const EMBED_URL = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/baai/bge-small-en-v1.5`;

const HEADERS = {
  "Authorization": `Bearer ${process.env.CF_API_TOKEN}`,
  "Content-Type": "application/json"
};

async function readCSV(filePath) {
  const results = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

async function embedText(text) {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ text })
  });
  const json = await res.json();
  if (!json.result) throw new Error("Embedding failed: " + JSON.stringify(json));
  return json.result;
}

async function insertToD1({ source, ref, text, vector }) {
  const res = await fetch("https://dolphinhouse-website.pages.dev/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ source, ref, text, vector }]),
  });
  const json = await res.json();
  if (!json.success) throw new Error("Ingest API failed: " + JSON.stringify(json));
}

async function processCSV(filename, source) {
  const filePath = path.join(__dirname, filename);
  const rows = await readCSV(filePath);
  console.log(`📘 Ingesting ${rows.length} rows from ${filename}`);

  for (const row of rows) {
    const text = Object.values(row).filter(Boolean).join(". ");
    try {
      const vector = await embedText(text);
      await insertToD1({ source, ref: row[Object.keys(row)[0]], text, vector });
      console.log(`✅ Added: ${row[Object.keys(row)[0]]} (${text.slice(0, 40)}...)`);
    } catch (err) {
      console.error(`❌ Failed on ${row[Object.keys(row)[0]]}:`, err.message);
    }
  }
}

async function main() {
  console.log("🚀 Starting ingestion process...");
  await processCSV("RAG.csv", "rooms");
  await processCSV("FacilitiesPoliciesLocation.csv", "facilities");
  await processCSV("MandatoryInstructions.csv", "instructions");
  console.log("🎉 All files ingested successfully!");
}

main().catch(console.error);
