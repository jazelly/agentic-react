#!/usr/bin/env node
// Apply {file, find, replace, regex?, all?} edits under appRoot.
// Usage: node apply-edits.mjs <appRoot> <edits.json>
import fs from 'node:fs';
import path from 'node:path';

const [appRoot, editsPath] = process.argv.slice(2);
if (!appRoot || !editsPath) {
  console.error('usage: apply-edits.mjs <appRoot> <edits.json>');
  process.exit(2);
}

const edits = JSON.parse(fs.readFileSync(editsPath, 'utf8'));
if (!Array.isArray(edits)) throw new Error('edits.json must be an array');

for (const e of edits) {
  const file = path.join(appRoot, e.file);
  const src = fs.readFileSync(file, 'utf8');
  let next;
  let count;
  if (e.regex) {
    const re = new RegExp(e.find, e.all ? 'g' : '');
    count = (src.match(new RegExp(e.find, 'g')) ?? []).length;
    next = src.replace(re, e.replace);
    if (count === 0) throw new Error(`edit did not match: ${e.file} /${e.find}/`);
  } else {
    count = src.split(e.find).length - 1;
    if (count !== 1 && !(e.all && count > 0)) {
      throw new Error(`edit must match once, matched ${count}x: ${e.file} :: ${JSON.stringify(e.find).slice(0, 80)}`);
    }
    next = e.all ? src.split(e.find).join(e.replace) : src.replace(e.find, () => e.replace);
  }
  fs.writeFileSync(file, next);
  console.log(`applied ${e.file} (${count} match${count === 1 ? '' : 'es'})`);
}
