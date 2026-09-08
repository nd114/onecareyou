import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';

/**
 * The documentation page is only as good as its habit of staying complete.
 *
 * It imports handbook files as raw markdown, so a new guide is invisible until
 * somebody adds an import — and the way that fails is silent: the page still
 * renders, just without the thing you wrote. This asserts every handbook file
 * reaches the page, and that no section points at a file that has gone.
 */
describe('the documentation page', () => {
  it('publishes every handbook guide', async () => {
    const page = await readFile('src/pages/AdminDocs.tsx', 'utf8');
    const files = (await readdir('docs/handbook')).filter((f) => f.endsWith('.md'));

    expect(files.length).toBeGreaterThan(4);
    for (const file of files) {
      expect(page, `docs/handbook/${file} is not published on the docs page`).toContain(file);
    }
  });

  it('imports nothing that no longer exists', async () => {
    const page = await readFile('src/pages/AdminDocs.tsx', 'utf8');
    const imports = [...page.matchAll(/from '\.\.\/\.\.\/(docs\/[^']+\.md)\?raw'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(5);
    for (const path of imports) {
      await expect(readFile(path, 'utf8'), `${path} is imported but missing`).resolves.toBeTruthy();
    }
  });

  it('gives every published section a title and a blurb', async () => {
    const page = await readFile('src/pages/AdminDocs.tsx', 'utf8');
    const sections = [...page.matchAll(/\{\s*id:\s*'([^']+)',\s*title:\s*'([^']+)',\s*blurb:\s*'([^']+)'/g)];
    expect(sections.length).toBeGreaterThan(5);
    for (const [, id, title, blurb] of sections) {
      expect(title.length, `${id} has no title`).toBeGreaterThan(2);
      expect(blurb.length, `${id} has no blurb`).toBeGreaterThan(5);
    }
  });

  it('keeps the guides substantial enough to answer a question', async () => {
    // A guide that shrinks to a stub is how documentation dies: it stays in the
    // index, so nobody notices it stopped saying anything.
    for (const [file, minLines] of [
      ['docs/handbook/patient-guide.md', 100],
      ['docs/handbook/clinician-guide.md', 100],
      ['docs/handbook/admin-guide.md', 50],
      ['docs/handbook/data-model.md', 60],
    ] as const) {
      const text = await readFile(file, 'utf8');
      expect(text.split('\n').length, `${file} is too thin to answer anything`).toBeGreaterThan(minLines);
    }
  });
});
