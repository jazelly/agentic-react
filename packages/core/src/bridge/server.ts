import { randomUUID } from 'node:crypto';
import { type WebSocket, WebSocketServer } from 'ws';
import {
  BRIDGE_WS_PATH,
  type BridgeMessage,
  type BridgeRequestEvent,
} from '../shared/protocol.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  socket: WebSocket;
  timeoutId: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT_MS = 10000;
const BRIDGE_CONNECT_POLL_MS = 50;

interface RuntimeBridgeRequestOptions {
  acceptResponse?: (value: unknown) => boolean;
  broadcast?: boolean;
  timeoutMs?: number;
}

type BrowserBridgeRequestHandler = (
  payload: unknown,
) => unknown | Promise<unknown>;

const isBridgeMessage = (value: unknown): value is BridgeMessage => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as { type?: unknown };
  return (
    message.type === 'bridge:request' || message.type === 'bridge:response'
  );
};

const MAX_BRIDGE_MESSAGE_BYTES = 2 * 1024 * 1024;

export class RuntimeBridgeServer {
  private wsServer: WebSocketServer | null = null;
  private activeSocket: WebSocket | null = null;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly requestHandlers = new Map<
    BridgeRequestEvent,
    BrowserBridgeRequestHandler
  >();
  private readonly sockets = new Set<WebSocket>();

  registerHandler(
    event: BridgeRequestEvent,
    handler: BrowserBridgeRequestHandler,
  ) {
    this.requestHandlers.set(event, handler);
  }

  attach(httpServer: any) {
    this.wsServer = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
      const requestUrl = request.url || '';
      const pathname = requestUrl.split('?')[0];

      if (pathname !== BRIDGE_WS_PATH || !this.wsServer) {
        return;
      }

      this.wsServer.handleUpgrade(request, socket, head, (websocket) => {
        this.wsServer?.emit('connection', websocket, request);
      });
    });

    this.wsServer.on('connection', (websocket) => {
      this.sockets.add(websocket);
      this.activeSocket = websocket;

      websocket.on('message', (messageBuffer) => {
        try {
          const messageText = messageBuffer.toString();
          if (
            Buffer.byteLength(messageText, 'utf8') > MAX_BRIDGE_MESSAGE_BYTES
          ) {
            websocket.close(1009, 'Bridge message too large');
            return;
          }

          const parsedMessage = JSON.parse(messageText) as unknown;

          if (!isBridgeMessage(parsedMessage)) {
            return;
          }

          if (parsedMessage.type === 'bridge:request') {
            void this.handleBrowserRequest(websocket, parsedMessage);
            return;
          }

          const pendingRequest = this.pendingRequests.get(parsedMessage.id);
          if (!pendingRequest) {
            return;
          }

          this.pendingRequests.delete(parsedMessage.id);
          clearTimeout(pendingRequest.timeoutId);

          if (parsedMessage.ok) {
            pendingRequest.resolve(parsedMessage.payload);
            return;
          }

          pendingRequest.reject(
            new Error(parsedMessage.error || 'Bridge response failed'),
          );
        } catch (_error) {
          // ignore malformed response
        }
      });

      websocket.on('close', () => {
        this.sockets.delete(websocket);
        if (this.activeSocket === websocket) {
          this.activeSocket = null;
        }

        for (const [requestId, pendingRequest] of this.pendingRequests) {
          if (pendingRequest.socket !== websocket) {
            continue;
          }
          clearTimeout(pendingRequest.timeoutId);
          pendingRequest.reject(
            new Error('Bridge connection closed before receiving response'),
          );
          this.pendingRequests.delete(requestId);
        }
      });
    });
  }

  async request(
    event: BridgeRequestEvent,
    payload: unknown,
    optionsOrTimeoutMs:
      | RuntimeBridgeRequestOptions
      | number = DEFAULT_TIMEOUT_MS,
  ): Promise<unknown> {
    const options =
      typeof optionsOrTimeoutMs === 'number'
        ? { timeoutMs: optionsOrTimeoutMs }
        : optionsOrTimeoutMs;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const sockets = await this.waitForOpenSockets(timeoutMs);
    const orderedSockets = this.orderSocketsByActivity(sockets);

    if (options.broadcast) {
      const responses = await Promise.allSettled(
        orderedSockets.map((socket) =>
          this.requestFromSocket(socket, event, payload, timeoutMs),
        ),
      );
      const fulfilledResponses = responses
        .filter(
          (response): response is PromiseFulfilledResult<unknown> =>
            response.status === 'fulfilled',
        )
        .map((response) => response.value);
      const acceptedResponse = fulfilledResponses.find(
        (response) =>
          !options.acceptResponse || options.acceptResponse(response),
      );
      if (acceptedResponse !== undefined) {
        return acceptedResponse;
      }
      if (fulfilledResponses.length > 0) {
        return fulfilledResponses[0];
      }
      const rejectedResponse = responses.find(
        (response): response is PromiseRejectedResult =>
          response.status === 'rejected',
      );
      throw rejectedResponse?.reason instanceof Error
        ? rejectedResponse.reason
        : new Error(`Bridge request failed for ${event}`);
    }

    let firstResponse: unknown;
    let hasFirstResponse = false;
    let lastError: Error | null = null;

    for (const socket of orderedSockets) {
      try {
        const response = await this.requestFromSocket(
          socket,
          event,
          payload,
          timeoutMs,
        );
        if (!hasFirstResponse) {
          firstResponse = response;
          hasFirstResponse = true;
        }
        if (!options.acceptResponse || options.acceptResponse(response)) {
          return response;
        }
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error('Bridge request failed');
      }
    }

    if (hasFirstResponse) {
      return firstResponse;
    }
    if (lastError) {
      throw lastError;
    }
    throw new Error(`Bridge request failed for ${event}`);
  }

  private async requestFromSocket(
    socket: WebSocket,
    event: BridgeRequestEvent,
    payload: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    const requestId = randomUUID();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Bridge request timed out for ${event}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        socket,
        timeoutId,
      });

      const message: BridgeMessage = {
        type: 'bridge:request',
        id: requestId,
        event,
        payload,
      };

      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeoutId);
        reject(
          error instanceof Error ? error : new Error('Bridge send failed'),
        );
      }
    });
  }

  private async handleBrowserRequest(
    socket: WebSocket,
    message: Extract<BridgeMessage, { type: 'bridge:request' }>,
  ) {
    const handler = this.requestHandlers.get(message.event);
    if (!handler) {
      this.sendResponse(socket, {
        type: 'bridge:response',
        id: message.id,
        ok: false,
        error: `Unsupported bridge event: ${message.event}`,
      });
      return;
    }

    try {
      const payload = await handler(message.payload);
      this.sendResponse(socket, {
        type: 'bridge:response',
        id: message.id,
        ok: true,
        payload,
      });
    } catch (error) {
      this.sendResponse(socket, {
        type: 'bridge:response',
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : 'Bridge request failed',
      });
    }
  }

  private sendResponse(
    socket: WebSocket,
    message: Extract<BridgeMessage, { type: 'bridge:response' }>,
  ) {
    if (socket.readyState !== socket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(message));
  }

  private getOpenSockets(): WebSocket[] {
    const sockets = Array.from(this.sockets).filter(
      (socket) => socket.readyState === socket.OPEN,
    );
    if (
      this.activeSocket &&
      this.activeSocket.readyState !== this.activeSocket.OPEN
    ) {
      this.activeSocket = null;
    }
    return sockets;
  }

  private orderSocketsByActivity(sockets: WebSocket[]): WebSocket[] {
    const activeSocket =
      this.activeSocket &&
      this.activeSocket.readyState === this.activeSocket.OPEN
        ? this.activeSocket
        : null;
    const newestFirst = [...sockets].reverse();

    if (!activeSocket) {
      return newestFirst;
    }

    return [
      activeSocket,
      ...newestFirst.filter((socket) => socket !== activeSocket),
    ];
  }

  private async waitForOpenSockets(timeoutMs: number): Promise<WebSocket[]> {
    const openSockets = this.getOpenSockets();
    if (openSockets.length > 0) {
      return openSockets;
    }

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const intervalId = setInterval(() => {
        const nextOpenSockets = this.getOpenSockets();
        if (nextOpenSockets.length > 0) {
          clearInterval(intervalId);
          resolve(nextOpenSockets);
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          clearInterval(intervalId);
          reject(new Error('No active runtime bridge connection'));
        }
      }, BRIDGE_CONNECT_POLL_MS);
    });
  }
}
