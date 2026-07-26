import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  findComponentSourceInProject,
  registerSourceLookupHandler,
} from '../dist/source_lookup.js';

test('source lookup resolves a component and refines its selector line', () => {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'agentic-react-source-lookup-'),
  );
  const sourceDirectory = path.join(rootDir, 'components');
  fs.mkdirSync(sourceDirectory);
  fs.writeFileSync(
    path.join(sourceDirectory, 'hero.tsx'),
    [
      'export function InteriorHero() {',
      '  return (',
      '    <section className="interior-hero">',
      '      <svg className="interior-map" />',
      '    </section>',
      '  );',
      '}',
    ].join('\n'),
  );

  try {
    assert.deepEqual(
      findComponentSourceInProject(
        rootDir,
        'InteriorHero',
        '.interior-map > div > svg',
      ),
      {
        filePath: 'components/hero.tsx',
        lineNumber: 4,
        columnNumber: null,
        componentName: 'InteriorHero',
      },
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('bridge handler exposes source lookup to browser clients', () => {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'agentic-react-source-bridge-'),
  );
  fs.writeFileSync(
    path.join(rootDir, 'blog-page.jsx'),
    [
      'export const BlogPage = () => (',
      '  <main id="notes">Notes</main>',
      ');',
    ].join('\n'),
  );
  let registeredEvent;
  let registeredHandler;

  try {
    registerSourceLookupHandler(
      {
        registerHandler(event, handler) {
          registeredEvent = event;
          registeredHandler = handler;
        },
      },
      rootDir,
    );

    assert.equal(registeredEvent, 'source:resolve');
    assert.deepEqual(
      registeredHandler({
        componentName: 'BlogPage',
        selector: '#notes',
      }),
      {
        filePath: 'blog-page.jsx',
        lineNumber: 2,
        columnNumber: null,
        componentName: 'BlogPage',
      },
    );
    assert.equal(registeredHandler({ componentName: '../etc/passwd' }), null);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
