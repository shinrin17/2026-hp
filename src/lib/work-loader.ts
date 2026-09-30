import type { Loader } from 'astro/loaders';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readWorks } from '../../scripts/work-files.mjs';

// Astro's glob loader treats # in filenames as a URL fragment. Keep the existing
// Japanese work folders intact and read filesystem paths with Node instead.
export function workFolders(): Loader {
  return {
    name: 'work-folders',
    async load({ store, parseData, renderMarkdown, generateDigest, config, watcher, logger }) {
      const projectRoot = fileURLToPath(config.root);
      const root = resolve(projectRoot, 'works');
      const sync = async () => {
        const works = await readWorks(root);
        const retained = new Set<string>();
        for (const work of works) {
          const id = work.folder;
          retained.add(id);
          const digest = generateDigest({ data: work.data, body: work.body, markdown: JSON.stringify(config.markdown) });
          const data = await parseData({ id, data: work.data, filePath: work.path });
          if (store.get(id)?.digest === digest) continue;
          const rendered = await renderMarkdown(work.body, { fileURL: pathToFileURL(work.path) });
          store.set({ id, data, body: work.body, digest, rendered, filePath: relative(projectRoot, work.path) });
        }
        for (const id of store.keys()) if (!retained.has(id)) store.delete(id);
      };
      await sync();
      if (watcher) {
        watcher.add(root);
        let pending = Promise.resolve();
        watcher.on('all', (event, path) => {
          if (!['add', 'change', 'unlink'].includes(event) || !path.startsWith(root + sep) || !path.endsWith(`${sep}index.md`)) return;
          pending = pending.then(sync).catch((error) => { logger.error(error.message); });
        });
      }
    },
  };
}
