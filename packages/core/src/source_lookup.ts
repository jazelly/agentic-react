import fs from 'node:fs';
import path from 'node:path';
import type { RuntimeBridgeServer } from './bridge/server.js';
import type { SelectionResolvedSource } from './shared/types.js';

const LOCAL_COMPONENT_NAME_PATTERN = /^[A-Z][A-Za-z0-9_$]*$/;

const stripCssEscapes = (value: string): string =>
  value.replace(/\\([^\r\n])/g, '$1');

const pushSourceHint = (
  hints: string[],
  hint: string | null | undefined,
): void => {
  if (!hint || hint.length < 3 || hints.includes(hint)) return;
  hints.push(hint);
};

const extractSelectorHints = (selector: string): string[] => {
  const hints: string[] = [];
  const idMatch = selector.match(/#((?:\\.|[^\s>+~.#:[\]])+)/);
  pushSourceHint(hints, idMatch?.[1] ? stripCssEscapes(idMatch[1]) : null);

  const classHints = Array.from(
    selector.matchAll(/\.((?:\\.|[^\s>+~.#:[\]])+)/g),
    (match) => stripCssEscapes(match[1]),
  );
  for (const classHint of classHints.reverse()) {
    pushSourceHint(hints, classHint);
  }

  return hints;
};

const isSourceFileName = (fileName: string): boolean =>
  /\.(?:jsx?|tsx?)$/i.test(fileName);

const walkProjectSourceFiles = (
  directory: string,
  visit: (filePath: string) => boolean,
): boolean => {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (_error) {
    return false;
  }

  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === '.git' ||
      entry.name === 'dist' ||
      entry.name === 'tmp'
    ) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (walkProjectSourceFiles(entryPath, visit)) return true;
      continue;
    }

    if (!isSourceFileName(entry.name)) continue;
    if (visit(entryPath)) return true;
  }

  return false;
};

export const findComponentSourceInProject = (
  rootDir: string,
  componentName: string,
  selector: string,
): SelectionResolvedSource | null => {
  if (!LOCAL_COMPONENT_NAME_PATTERN.test(componentName)) return null;

  const declarationPattern = new RegExp(
    `(?:function\\s+${componentName}\\b|const\\s+${componentName}\\s*=|class\\s+${componentName}\\b)`,
  );
  const hints = extractSelectorHints(selector);
  const normalizedRootDir = fs.realpathSync(rootDir);
  let matchedSource: SelectionResolvedSource | null = null;

  walkProjectSourceFiles(rootDir, (filePath) => {
    let sourceText: string;
    try {
      sourceText = fs.readFileSync(filePath, 'utf8');
    } catch (_error) {
      return false;
    }

    if (!declarationPattern.test(sourceText)) return false;

    const lines = sourceText.split(/\r?\n/);
    const declarationIndex = lines.findIndex((line) =>
      declarationPattern.test(line),
    );
    let lineIndex = declarationIndex >= 0 ? declarationIndex : 0;
    const searchStartIndex = Math.max(0, lineIndex);
    const searchRanges = [
      lines.slice(searchStartIndex).map((line, index) => ({
        line,
        lineIndex: searchStartIndex + index,
      })),
      lines.slice(0, searchStartIndex).map((line, index) => ({
        line,
        lineIndex: index,
      })),
    ];

    for (const hint of hints) {
      for (const searchRange of searchRanges) {
        const matchedLine = searchRange.find(({ line }) => line.includes(hint));
        if (matchedLine) {
          lineIndex = matchedLine.lineIndex;
          break;
        }
      }
      if (lineIndex !== declarationIndex) break;
    }

    matchedSource = {
      filePath: path
        .relative(normalizedRootDir, fs.realpathSync(filePath))
        .replace(/\\/g, '/'),
      lineNumber: lineIndex + 1,
      columnNumber: null,
      componentName,
    };
    return true;
  });

  return matchedSource;
};

interface SourceLookupPayload {
  componentName?: unknown;
  selector?: unknown;
}

export const registerSourceLookupHandler = (
  runtimeBridge: Pick<RuntimeBridgeServer, 'registerHandler'>,
  rootDir: string,
): void => {
  runtimeBridge.registerHandler('source:resolve', (payload) => {
    const sourceLookup = (payload || {}) as SourceLookupPayload;
    if (
      typeof sourceLookup.componentName !== 'string' ||
      typeof sourceLookup.selector !== 'string'
    ) {
      return null;
    }

    return findComponentSourceInProject(
      rootDir,
      sourceLookup.componentName,
      sourceLookup.selector,
    );
  });
};
