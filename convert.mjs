import sharp from "sharp";
import fs from "fs";
import path from "path";

const src = "public/uploader";
const backup = "public/uploader-backup";

if (!fs.existsSync(backup)) fs.mkdirSync(backup);

fs.readdirSync(src).forEach(file => {
  const ext = path.extname(file).toLowerCase();
  if (![".jpg", ".jpeg", ".png"].includes(ext)) return;

  const input = path.join(src, file);
  const output = path.join(src, path.basename(file, ext) + ".webp");

  // backup original
  fs.copyFileSync(input, path.join(backup, file));

  // resize & convert
  sharp(input)
    .resize(1600, 1600, { fit: "inside" })
    .webp({ quality: 80 })
    .toFile(output)
    .then(() => console.log(`Converted: ${file} -> ${output}`))
    .catch(err => console.error(err));
});
