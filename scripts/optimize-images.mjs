import sharp from "sharp";
import path from "path";
import fs from "fs";

const tasks = [
  {
    input: "public/uploader/dolphinhouse-front-4.webp",
    outputs: [
      { out: "public/uploader/dolphinhouse-front-4-700w.webp", width: 700, quality: 70 },
      { out: "public/uploader/dolphinhouse-front-4-876w.webp", width: 876, quality: 70 }
    ],
    fit: "cover",
  },
  {
    input: "public/uploader/hotel-front-1.webp",
    outputs: [
      { out: "public/uploader/hotel-front-1-480x320.webp", width: 480, height: 320, quality: 70 },
      { out: "public/uploader/hotel-front-1-960x640.webp", width: 960, height: 640, quality: 70 }
    ],
    fit: "cover",
  },
  {
    input: "public/uploader/swimming-pool1.webp",
    outputs: [
      { out: "public/uploader/swimming-pool1-480x320.webp", width: 480, height: 320, quality: 70 },
      { out: "public/uploader/swimming-pool1-960x640.webp", width: 960, height: 640, quality: 70 }
    ],
    fit: "cover",
  },
  {
    input: "public/uploader/nagaon-beach.webp",
    outputs: [
      { out: "public/uploader/nagaon-beach-332x221.webp", width: 332, height: 221, quality: 70 },
      { out: "public/uploader/nagaon-beach-800x533.webp", width: 800, height: 533, quality: 70 }
    ],
    fit: "cover",
  },
  {
    input: "public/uploader/logo-512.webp",
    outputs: [
      { out: "public/uploader/logo-44.webp", width: 44, height: 44, quality: 80 },
      { out: "public/uploader/logo-88.webp", width: 88, height: 88, quality: 80 }
    ],
    fit: "cover",
  },
  {
    input: "public/icons/chatbot.webp",
    outputs: [
      { out: "public/icons/chatbot-64.webp", width: 64, height: 64, quality: 80 },
      { out: "public/icons/chatbot-128.webp", width: 128, height: 128, quality: 80 }
    ],
    fit: "cover",
  },
];

async function run() {
  for (const t of tasks) {
    if (!fs.existsSync(t.input)) {
      console.warn(`Skip missing: ${t.input}`);
      continue;
    }
    for (const o of t.outputs) {
      try {
        const img = sharp(t.input);
        const params = { fit: t.fit || "cover" };
        if (o.width) params.width = o.width;
        if (o.height) params.height = o.height;
        await img
          .resize(params)
          .webp({ quality: o.quality ?? 75 })
          .toFile(o.out);
        console.log(`Wrote ${o.out}`);
      } catch (e) {
        console.error(`Error processing ${t.input} -> ${o.out}:`, e);
      }
    }
  }
}

run();