import { defaultWebSocketFactory } from '@getpaseo/client/internal/daemon-client-websocket-transport';
import type { WebSocketFactory } from '@getpaseo/client/internal/daemon-client-transport-types';

/** Scoped workaround for the pinned SDK's timeout disposal code. */
export const createStatusWebSocket: WebSocketFactory = (url, options) => {
  const socket = defaultWebSocketFactory(url, options);
  const close = socket.close.bind(socket);
  // Paseo 0.8.0-beta.1 disposes a timed-out transport with 1001, which Node's
  // browser-compatible WebSocket rejects. The SDK swallows that exception and
  // drops the transport reference, leaving the socket alive. Use an allowed
  // normal close for this probe's socket; never change the global WebSocket.
  socket.close = (code, reason) => close(code === 1001 ? 1000 : code, reason);
  return socket;
};
