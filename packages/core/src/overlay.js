import * as bippy from 'bippy';
import { createAgenticReactSettingsClient } from './core/settings/browser.js';
import { highlightComponent } from './core/tools/component_highlighter.js';
import { getComponentStates } from './core/tools/component_state_viewer.js';
import { getComponentTree } from './core/tools/component_viewer.js';
import { buildSelectionContextForElement } from './core/tools/selection_context.js';
import { createElementSelector } from './core/tools/selection_selector.js';
import { createSelectionToolkit } from './core/tools/selection_toolkit.js';
import {
  collectUnnecessaryRender,
  queryWastedRender,
} from './core/tools/track_wasted_render.js';
import {
  __AGENTIC_REACT_BRIDGE_URL__,
  __AGENTIC_REACT_CONFIG__,
  __AGENTIC_REACT_TOOLS__,
  __AGENTIC_REACT__,
  target,
} from './shared/const.js';
import { BRIDGE_GLOBAL_CONFIG_KEY, BRIDGE_WS_PATH } from './shared/protocol.js';
import { fiberRoots, store } from './shared/store.js';

const customToolHandlers = new Map();

const registerCustomTool = (name, handler) => {
  customToolHandlers.set(name, handler);
};

const agenticReactConfig = target[__AGENTIC_REACT_CONFIG__] || {};
const settingsClient = createAgenticReactSettingsClient({
  initialSettings: agenticReactConfig.settings,
  request: (event, payload, timeoutMs) =>
    requestNodeBridge(event, payload, timeoutMs),
});
const selectionToolkit = createSelectionToolkit({
  initialConfig: agenticReactConfig.toolkit,
  settingsClient,
});

const runtimeApi = {
  showToolkit: () => selectionToolkit.showToolkit(),
  hideToolkit: () => selectionToolkit.hideToolkit(),
  setToolkitConfig: (config) => selectionToolkit.setToolkitConfig(config),
  enterSelectionMode: () => selectionToolkit.enterSelectionMode(),
  exitSelectionMode: () => selectionToolkit.exitSelectionMode(),
  setSelectionMode: (enabled) => selectionToolkit.setSelectionMode(enabled),
  getLastSelectionContext: () => selectionToolkit.getLastSelectionContext(),
  copyLastSelectionContext: (format = 'text') =>
    selectionToolkit.copyLastSelectionContext(format),
  registerTuningModalExtension: (extension) =>
    selectionToolkit.registerTuningModalExtension(extension),
  settings: settingsClient,
};

const builtInTools = {
  highlightComponent,
  getComponentTree,
  getComponentStates,
  getUnnecessaryRenderedComponents: queryWastedRender,
  registerCustomTool,
};

if (!Object.hasOwn(target, __AGENTIC_REACT_TOOLS__)) {
  Object.defineProperty(target, __AGENTIC_REACT_TOOLS__, {
    value: builtInTools,
    writable: false,
    configurable: true,
  });
} else {
  Object.assign(target[__AGENTIC_REACT_TOOLS__], builtInTools);
}
if (!Object.hasOwn(target, __AGENTIC_REACT__)) {
  Object.defineProperty(target, __AGENTIC_REACT__, {
    value: runtimeApi,
    writable: false,
    configurable: true,
  });
} else {
  Object.assign(target[__AGENTIC_REACT__], runtimeApi);
}

bippy.instrument({
  name: 'agentic-react',
  onCommitFiberRoot: (renderId, root) => {
    if (fiberRoots.has(renderId)) {
      fiberRoots.get(renderId).add(root);
    } else {
      fiberRoots.set(renderId, new Set([root]));
    }

    bippy.traverseRenderedFibers(root.current || root, (fiber, phase) => {
      if (phase === 'update') {
        collectUnnecessaryRender(fiber);
      }
    });

    store.currentCommitFrameId += 1;
  },
});

const normalizeQuery = (query) => query.trim().toLowerCase();

const getElementClassName = (element) => {
  if (typeof element.className === 'string') {
    return element.className;
  }
  return element.getAttribute?.('class') || '';
};

const getElementSearchText = (element) => {
  const parts = [];
  parts.push(element.tagName?.toLowerCase() || '');
  parts.push(element.id || '');
  parts.push(getElementClassName(element));
  parts.push(element.textContent || '');

  for (const attrName of ['name', 'aria-label', 'placeholder', 'title']) {
    const attrValue = element.getAttribute?.(attrName);
    if (attrValue) {
      parts.push(attrValue);
    }
  }

  return parts.join(' ').toLowerCase();
};

const getElementDepth = (element) => {
  let depth = 0;
  let current = element;
  while (current?.parentElement) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
};

const getElementMatchScore = (element, query) => {
  const id = normalizeQuery(element.id || '');
  if (id === query) return 0;

  for (const attrName of ['name', 'aria-label', 'placeholder', 'title']) {
    const attrValue = normalizeQuery(element.getAttribute?.(attrName) || '');
    if (attrValue === query) return 5;
  }

  if (id.includes(query)) return 10;

  for (const attrName of ['name', 'aria-label', 'placeholder', 'title']) {
    const attrValue = normalizeQuery(element.getAttribute?.(attrName) || '');
    if (attrValue.includes(query)) return 20;
  }

  const className = normalizeQuery(getElementClassName(element));
  if (className.includes(query)) return 30;

  const text = normalizeQuery(element.textContent || '');
  if (text.includes(query)) return 80;

  return 100;
};

const findHtmlElements = (queries, maxMatches = 10) => {
  const normalizedQueries = (queries || [])
    .map((query) => normalizeQuery(String(query || '')))
    .filter(Boolean);

  if (normalizedQueries.length === 0) {
    return [];
  }

  const matches = [];
  const seenElements = new Set();

  for (const query of normalizedQueries) {
    const allElements = document.querySelectorAll('*');
    for (const element of allElements) {
      if (seenElements.has(element)) {
        continue;
      }

      const searchText = getElementSearchText(element);
      if (!searchText.includes(query)) {
        continue;
      }

      seenElements.add(element);
      matches.push({
        query,
        element,
        score: getElementMatchScore(element, query),
        depth: getElementDepth(element),
        selector: createElementSelector(element),
        domPreview: (
          element.outerHTML || `<${element.tagName.toLowerCase()}>`
        ).slice(0, 800),
      });
    }
  }

  return matches
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }
      return right.depth - left.depth;
    })
    .slice(0, maxMatches);
};

const handleBridgeRequest = async (event, payload) => {
  switch (event) {
    case 'highlight-component': {
      if (typeof payload?.componentName !== 'string') {
        throw new Error('Invalid args: missing componentName');
      }
      let response = 'Action failed';
      try {
        const components = target.__AGENTIC_REACT_TOOLS__.highlightComponent(
          payload.componentName,
        );
        if (components.length > 0) {
          response = `Found and highlighted ${components.length} components`;
        }
      } catch (error) {
        response = `Error: ${error?.message || 'Unknown error'}`;
      }
      return response;
    }

    case 'get-component-tree': {
      return JSON.stringify(
        await target.__AGENTIC_REACT_TOOLS__.getComponentTree(payload || {}),
      );
    }

    case 'get-component-states': {
      if (typeof payload?.componentName !== 'string') {
        throw new Error('Invalid args: missing componentName');
      }
      return JSON.stringify(
        target.__AGENTIC_REACT_TOOLS__.getComponentStates(
          payload.componentName,
        ),
      );
    }

    case 'get-unnecessary-rerenders': {
      const wastedRenders =
        await target.__AGENTIC_REACT_TOOLS__.getUnnecessaryRenderedComponents(
          payload?.timeframe,
          {
            allComponents: Boolean(payload?.allComponents),
            debugMode: Boolean(payload?.debugMode),
          },
        );
      return JSON.stringify(wastedRenders);
    }

    case 'set-selection-mode': {
      if (typeof payload?.enabled !== 'boolean') {
        throw new Error('Invalid args: missing enabled');
      }
      target.__AGENTIC_REACT__.setSelectionMode(payload.enabled);
      return { success: true, enabled: payload.enabled };
    }

    case 'get-last-selection-context': {
      return {
        context: target.__AGENTIC_REACT__.getLastSelectionContext(),
      };
    }

    case 'copy-last-selection-context': {
      const format = payload?.format === 'json' ? 'json' : 'text';
      return await target.__AGENTIC_REACT__.copyLastSelectionContext(format);
    }

    case 'get-html-elements': {
      const maxMatches =
        typeof payload?.maxMatches === 'number' ? payload.maxMatches : 10;
      const matches = findHtmlElements(payload?.queries || [], maxMatches).map(
        (match) => ({
          query: match.query,
          selector: match.selector,
          domPreview: match.domPreview,
        }),
      );

      return {
        success: true,
        count: matches.length,
        matches,
      };
    }

    case 'get-react-source-code': {
      const maxMatches =
        typeof payload?.maxMatches === 'number' ? payload.maxMatches : 5;
      const matches = findHtmlElements(payload?.queries || [], maxMatches);

      if (matches.length === 0) {
        return {
          success: false,
          reason: 'No element matched the provided search strings',
          matches: [],
          context: null,
        };
      }

      const chosenMatch = matches[0];
      const context = await buildSelectionContextForElement(
        chosenMatch.element,
      );

      return {
        success: true,
        matches: matches.map((match) => ({
          query: match.query,
          selector: match.selector,
          domPreview: match.domPreview,
        })),
        chosenMatch: {
          query: chosenMatch.query,
          selector: chosenMatch.selector,
        },
        context,
      };
    }

    case 'custom-tool': {
      if (typeof payload?.name !== 'string') {
        throw new Error('Invalid args: missing custom tool name');
      }

      const handler = customToolHandlers.get(payload.name);
      if (typeof handler !== 'function') {
        throw new Error(`Custom tool "${payload.name}" is not registered`);
      }

      return await handler(payload.args);
    }

    default:
      throw new Error(`Unsupported bridge event: ${event}`);
  }
};

const getBridgeUrl = () => {
  const configuredUrl =
    target[__AGENTIC_REACT_BRIDGE_URL__] || target[BRIDGE_GLOBAL_CONFIG_KEY];
  if (typeof configuredUrl === 'string' && configuredUrl.length > 0) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${BRIDGE_WS_PATH}`;
};

const pendingNodeRequests = new Map();
let activeBridgeSocket = null;

const createBrowserRequestId = () => {
  const cryptoApi = target.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  return `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const requestNodeBridge = (event, payload, timeoutMs = 10000) =>
  new Promise((resolve, reject) => {
    if (
      !activeBridgeSocket ||
      activeBridgeSocket.readyState !== WebSocket.OPEN
    ) {
      reject(new Error('Bridge connection is not open'));
      return;
    }

    const requestId = createBrowserRequestId();
    const timeoutId = setTimeout(() => {
      pendingNodeRequests.delete(requestId);
      reject(new Error(`Bridge request timed out for ${event}`));
    }, timeoutMs);

    pendingNodeRequests.set(requestId, {
      resolve,
      reject,
      timeoutId,
    });

    try {
      activeBridgeSocket.send(
        JSON.stringify({
          type: 'bridge:request',
          id: requestId,
          event,
          payload,
        }),
      );
    } catch (error) {
      clearTimeout(timeoutId);
      pendingNodeRequests.delete(requestId);
      reject(error instanceof Error ? error : new Error('Bridge send failed'));
    }
  });

const rejectPendingNodeRequests = (message) => {
  for (const [requestId, pendingRequest] of pendingNodeRequests) {
    clearTimeout(pendingRequest.timeoutId);
    pendingRequest.reject(new Error(message));
    pendingNodeRequests.delete(requestId);
  }
};

const connectBridge = () => {
  let socket;
  let shouldReconnect = true;

  const closeBridgeForUnload = () => {
    shouldReconnect = false;
    try {
      socket?.close();
    } catch (_error) {
      // noop
    }
  };

  window.addEventListener('pagehide', closeBridgeForUnload);
  window.addEventListener('beforeunload', closeBridgeForUnload);

  const establishConnection = () => {
    if (!shouldReconnect) {
      return;
    }

    try {
      socket = new WebSocket(getBridgeUrl());
    } catch (_error) {
      if (shouldReconnect) {
        setTimeout(establishConnection, 1000);
      }
      return;
    }

    socket.addEventListener('message', async (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (_error) {
        return;
      }

      if (message?.type === 'bridge:response') {
        const pendingRequest = pendingNodeRequests.get(message.id);
        if (!pendingRequest) {
          return;
        }
        pendingNodeRequests.delete(message.id);
        clearTimeout(pendingRequest.timeoutId);

        if (message.ok) {
          pendingRequest.resolve(message.payload);
        } else {
          pendingRequest.reject(
            new Error(message.error || 'Bridge response failed'),
          );
        }
        return;
      }

      if (message?.type !== 'bridge:request') {
        return;
      }

      try {
        const payload = await handleBridgeRequest(
          message.event,
          message.payload,
        );
        socket.send(
          JSON.stringify({
            type: 'bridge:response',
            id: message.id,
            ok: true,
            payload,
          }),
        );
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: 'bridge:response',
            id: message.id,
            ok: false,
            error: error?.message || 'Bridge request failed',
          }),
        );
      }
    });

    socket.addEventListener('close', () => {
      if (activeBridgeSocket === socket) {
        activeBridgeSocket = null;
      }
      rejectPendingNodeRequests('Bridge connection closed before response');
      if (shouldReconnect) {
        setTimeout(establishConnection, 1000);
      }
    });

    socket.addEventListener('open', () => {
      activeBridgeSocket = socket;
    });

    socket.addEventListener('error', () => {
      try {
        socket.close();
      } catch (_error) {
        // noop
      }
    });
  };

  establishConnection();
};

connectBridge();
