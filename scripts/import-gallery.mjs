// One-off import of Lab Life photos: web-size each source (max 1600px, EXIF
// stripped) into src/assets/gallery/ and write a gallery content entry.
// Captions are scene-accurate first drafts for the PI to refine.
//   node scripts/import-gallery.mjs
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(homedir(), "Downloads", "Lab Pictures");
const ASSETS = join(ROOT, "src/assets/gallery");
const CONTENT = join(ROOT, "src/content/gallery");

const photos = [
  { src: "IMG_0882.jpeg", slug: "2022-conference", date: "2022-10-12", caption: "The lab out together at a conference." },
  { src: "IMG_3718.jpeg", slug: "2023-lab-meeting", date: "2023-10-26", caption: "A lab meeting in the office." },
  { src: "IMG_5588.jpeg", slug: "2024-team", date: "2024-08-07", caption: "The whole lab, summer 2024." },
  { src: "IMG_5592.jpeg", slug: "2024-bowling", date: "2024-08-07", caption: "Lab night out at the bowling alley." },
  { src: "IMG_7845.jpeg", slug: "2025-aan", date: "2025-04-08", caption: "Presenting at the American Academy of Neurology Annual Meeting." },
  { src: "IMG_8880.jpeg", slug: "2025-farm", date: "2025-09-13", caption: "Fall lab outing to the farm." },
  { src: "IMG_8887.jpeg", slug: "2025-vines", date: "2025-09-13", caption: "Among the vines at the orchard." },
  { src: "IMG_8895.jpeg", slug: "2025-pumpkins", date: "2025-09-13", caption: "The lab at the pumpkin patch." },
  { src: "IMG_1171.jpeg", slug: "2026-dinner", date: "2026-04-07", caption: "Celebrating over a lab dinner." },
];

for (const p of photos) {
  const out = join(ASSETS, `${p.slug}.jpg`);
  execSync(`magick ${JSON.stringify(join(SRC, p.src))} -auto-orient -resize 1600x1600 -strip -quality 82 ${JSON.stringify(out)}`);
  writeFileSync(
    join(CONTENT, `${p.slug}.md`),
    `---\nimage: ../../assets/gallery/${p.slug}.jpg\ncaption: ${JSON.stringify(p.caption)}\ndate: ${p.date}\n---\n`,
  );
  console.log("✓", p.slug);
}
console.log(`\nimported ${photos.length} gallery photos`);
