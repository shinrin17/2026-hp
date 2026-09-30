import { rename, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorks, routeSegment } from './work-files.mjs';

// Astro encodes # and ? in dynamic route output filenames. GitHub Pages expects
// the actual filesystem characters for existing URLs such as /works/...%23.../.
const outputName = routeSegment;
async function restoreName(parent, name) {
  const encoded = outputName(name);
  if (encoded === name) return;
  const target = join(parent, name);
  if (await access(target).then(() => true, () => false)) throw new Error(`公開パスが衝突しています: ${name}`);
  await rename(join(parent, encoded), target);
}

export function preserveWorkPaths() {
  return {
    name: 'preserve-work-paths',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const works = (await readWorks(resolve('works'))).filter((work) => !work.data.draft);
        const destination = join(fileURLToPath(dir), 'works');
        for (const work of works) {
          await restoreName(destination, work.folder);
          for (const path of new Set([work.data.slug, work.folder])) {
            for (const file of new Set(work.data.images.map((image) => image.file.slice('img/'.length)))) {
              await restoreName(join(destination, path, 'img'), file);
            }
          }
        }
      },
    },
  };
}
