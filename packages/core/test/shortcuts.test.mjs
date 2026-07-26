import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEscapeKeyCycleGuard,
  findDuplicateShortcut,
  normalizeShortcutString,
  validateShortcutSettings,
} from '../dist/core/settings/shortcuts.js';

test('shortcut normalization orders modifiers and uses platform names', () => {
  assert.deepEqual(normalizeShortcutString('shift + alt + ctrl + s', 'Win32'), {
    success: true,
    label: 'Ctrl+Alt+Shift+S',
    identity: 'ctrl+alt+shift+s',
  });
  assert.deepEqual(normalizeShortcutString('cmd+option+k', 'MacIntel'), {
    success: true,
    label: 'Option+Command+K',
    identity: 'alt+meta+k',
  });
});

test('shortcut normalization rejects reserved or incomplete shortcuts', () => {
  assert.equal(normalizeShortcutString('Shift').success, false);
  assert.equal(normalizeShortcutString('Escape').success, false);
  assert.equal(normalizeShortcutString('Ctrl+Escape').success, false);
  assert.equal(normalizeShortcutString('Ctrl+A+B').success, false);
});

test('duplicate shortcut detection compares normalized identities', () => {
  const shortcuts = {
    singleSelect: 'Ctrl+Alt+Shift+S',
    multiSelect: 'Shift+Ctrl+M',
    toggleToolbox: 'Ctrl+Alt+Shift+A',
    done: 'Enter',
  };

  assert.equal(
    findDuplicateShortcut('ctrl+shift+m', shortcuts, 'singleSelect', 'Win32'),
    'multiSelect',
  );
  assert.equal(
    findDuplicateShortcut('Ctrl+Alt+Shift+S', shortcuts, 'singleSelect', 'Win32'),
    null,
  );
});

test('complete shortcut validation normalizes labels and rejects duplicates', () => {
  const normalized = validateShortcutSettings(
    {
      singleSelect: 'shift+ctrl+s',
      multiSelect: 'Ctrl+M',
      toggleToolbox: 'Ctrl+A',
      done: 'Enter',
    },
    'Win32',
  );
  assert.equal(normalized.success, true);
  assert.equal(normalized.shortcuts.singleSelect, 'Ctrl+Shift+S');

  const duplicate = validateShortcutSettings(
    {
      singleSelect: 'Shift+Ctrl+S',
      multiSelect: 'ctrl+shift+s',
      toggleToolbox: 'Ctrl+A',
      done: 'Enter',
    },
    'Win32',
  );
  assert.equal(duplicate.success, false);
  assert.equal(duplicate.action, 'multiSelect');
  assert.equal(duplicate.duplicateAction, 'singleSelect');
});

test('Escape key cycle guard captures repeat keydowns through keyup', () => {
  const guard = createEscapeKeyCycleGuard();

  assert.equal(guard.handleKeyDown('Escape', false), 'ignore');
  assert.equal(guard.handleKeyDown('Escape', true), 'initial');
  assert.equal(guard.handleKeyDown('Escape', false), 'repeat');
  assert.equal(guard.handleKeyDown('Escape', false), 'repeat');
  assert.equal(guard.handleKeyUp('Escape'), true);
  assert.equal(guard.handleKeyDown('Escape', false), 'ignore');
  assert.equal(guard.handleKeyUp('Escape'), false);
});
