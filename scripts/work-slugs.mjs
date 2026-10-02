export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertSlug(slug) {
  if (typeof slug !== 'string' || !slugPattern.test(slug) || slug.length > 64) {
    throw new Error('slug は64文字以内の英小文字・数字・ハイフンで指定してください（例: omori-moyooshi）。');
  }
  return slug;
}

// Reserve draft slugs too, and prevent a new URL from replacing another work's
// folder-based image URLs. Folder names remain the source identifiers.
export function assertWorkSlugs(works) {
  const owners = new Map();
  const folders = new Map(works.map((work) => [work.folder.normalize(), work.folder]));
  for (const work of works) {
    const slug = work.data.slug;
    if ((slug === '' || slug === undefined) && work.data.draft) continue;
    try { assertSlug(slug); } catch (error) { throw new Error(`${work.folder}/index.md: ${error.message}`); }
    if (owners.has(slug)) throw new Error(`slug が重複しています: ${slug}（${owners.get(slug)} / ${work.folder}）`);
    const legacyOwner = folders.get(slug);
    if (legacyOwner && legacyOwner !== work.folder) throw new Error(`slug が別作品の旧URLと衝突しています: ${slug}`);
    owners.set(slug, work.folder);
  }
}
