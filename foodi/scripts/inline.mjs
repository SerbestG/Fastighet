// Bakar in JavaScript och CSS i index.html så att hela prototypen blir en enda
// fil. Bilder är redan inbäddade av byggläget "single".
//
// Resultat:
//   dist-single/index.html     fristående sida som går att öppna direkt
//   dist-single/artifact.html  samma sida utan dokumentskal, för publicering
//                              som Claude-artifact (skalet läggs till där)
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../dist-single/', import.meta.url).pathname;
let html = readFileSync(join(dir, 'index.html'), 'utf8');
let css = '';
let js = '';

html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g, (_, file) => {
  css = readFileSync(join(dir, file), 'utf8');
  return `<style>${css}</style>`;
});

html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_, file) => {
  js = readFileSync(join(dir, file), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});

if (!css || !js || /(src|href)="\.\/assets\//.test(html)) {
  throw new Error('Kunde inte baka in alla filer i index.html');
}

writeFileSync(join(dir, 'index.html'), html);

const title = html.match(/<title>[^<]*<\/title>/)?.[0] ?? '<title>Foodi</title>';
const fonts = [...html.matchAll(/<link\s+rel="(?:preconnect|stylesheet)"\s+href="https:\/\/fonts\.[^"]+"[^>]*>/g)].map((m) => m[0]);
if (!fonts.some((f) => f.includes('stylesheet'))) throw new Error('Typsnittslänken saknas i index.html');
const artifact = [
  title,
  ...fonts,
  `<style>${css}</style>`,
  '<div id="root"></div>',
  `<script type="module">${js}</script>`,
].join('\n');
writeFileSync(join(dir, 'artifact.html'), artifact);

rmSync(join(dir, 'assets'), { recursive: true, force: true });
console.log(`dist-single/index.html: ${(html.length / 1024).toFixed(0)} kB, artifact.html: ${(artifact.length / 1024).toFixed(0)} kB`);
