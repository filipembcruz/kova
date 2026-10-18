// Renders launcher icons (legacy + adaptive) into android-res/ using sharp.
const sharp = require(process.env.SHARP || 'sharp');
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'android-res');
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
(async () => {
  const logo = fs.readFileSync(path.join(root, 'assets/logo.svg'));
  const fg = fs.readFileSync(path.join(root, 'assets/icon-fg.svg'));
  const bg = fs.readFileSync(path.join(root, 'assets/icon-bg.svg'));
  for (const [d, f] of Object.entries(dens)) {
    const dir = path.join(out, `mipmap-${d}`); fs.mkdirSync(dir, { recursive: true });
    const s = Math.round(48 * f), a = Math.round(108 * f);
    await sharp(logo, { density: 384 }).resize(s, s).png().toFile(path.join(dir, 'ic_launcher.png'));
    const r = Math.round(s / 2);
    const mask = Buffer.from(`<svg width="${s}" height="${s}"><circle cx="${r}" cy="${r}" r="${r}"/></svg>`);
    await sharp(logo, { density: 384 }).resize(s, s).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(path.join(dir, 'ic_launcher_round.png'));
    await sharp(fg, { density: 384 }).resize(a, a).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
    await sharp(bg, { density: 384 }).resize(a, a).png().toFile(path.join(dir, 'ic_launcher_background.png'));
  }
  const any = path.join(out, 'mipmap-anydpi-v26'); fs.mkdirSync(any, { recursive: true });
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@mipmap/ic_launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n  <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`;
  fs.writeFileSync(path.join(any, 'ic_launcher.xml'), xml);
  fs.writeFileSync(path.join(any, 'ic_launcher_round.xml'), xml);
  await sharp(logo, { density: 300 }).resize(192, 192).png().toFile(path.join(root, 'public/icon-192.png'));
  await sharp(logo, { density: 300 }).resize(512, 512).png().toFile(path.join(root, 'public/icon-512.png'));
  await sharp(logo, { density: 300 }).resize(256, 256).png().toFile(path.join(root, 'assets/logo.png'));
  console.log('ok');
})();
