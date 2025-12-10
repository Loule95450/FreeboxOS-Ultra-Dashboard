import { WebSocketServer, WebSocket } from 'ws';
import type { WebSocket as WsType } from 'ws';
import { freeboxApi } from './freeboxApi.js';

interface ConnectionStatus {
  type: string;
  state: string;
  media: string;
  ipv4: string;
  ipv4_port_range: [number, number];
  ipv6: string;
  rate_down: number;
  rate_up: number;
  bandwidth_down: number;
  bandwidth_up: number;
  bytes_down: number;
  bytes_up: number;
}

type ClientWebSocket = WsType & { isAlive?: boolean };

const POLLING_INTERVAL = 1000; // 1 second

class ConnectionWebSocketService {
  private wss: WebSocketServer | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the WebSocket server
   */
  init(server: import('http').Server) {
    console.log('[WS] Initializing WebSocket server...');

    this.wss = new WebSocketServer({ server, path: '/ws/connection' });

    console.log('[WS] WebSocket server created on path /ws/connection');

    this.wss.on('error', (error) => {
      console.error('[WS] Server error:', error);
    });

    this.wss.on('connection', (ws: ClientWebSocket, req) => {
      console.log('[WS] Client connected from:', req.socket.remoteAddress);
      ws.isAlive = true;

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        // Stop polling if no more clients
        if (this.wss && this.wss.clients.size === 0) {
          this.stopPolling();
        }
      });

      ws.on('error', (error) => {
        console.error('[WS] Client error:', error.message);
      });

      // Start polling if this is the first client
      if (this.wss && this.wss.clients.size === 1) {
        this.startPolling();
      }
    });

    // Ping clients to detect stale connections
    this.pingInterval = setInterval(() => {
      this.wss?.clients.forEach((ws) => {
        const client = ws as ClientWebSocket;
        if (client.isAlive === false) {
          return client.terminate();
        }
        client.isAlive = false;
        client.ping();
      });
    }, 30000);

    console.log('[WS] WebSocket server initialized on /ws/connection');
  }

  /**
   * Start polling Freebox API for connection status
   */
  private startPolling() {
    if (this.pollingInterval) return;

    console.log('[WS] Starting connection status polling');

    this.pollingInterval = setInterval(async () => {
      await this.fetchAndBroadcast();
    }, POLLING_INTERVAL);

    // Fetch immediately
    this.fetchAndBroadcast();
  }

  /**
   * Stop polling
   */
  private stopPolling() {
    if (this.pollingInterval) {
      console.log('[WS] Stopping connection status polling');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Fetch connection status from Freebox and broadcast to clients
   */
  private async fetchAndBroadcast() {
    if (!freeboxApi.isLoggedIn()) return;
    if (!this.wss || this.wss.clients.size === 0) return;

    try {
      const response = await freeboxApi.getConnectionStatus();
      if (response.success && response.result) {
        this.broadcast(response.result as ConnectionStatus);
      }
    } catch (error) {
      // Silent fail - don't spam logs
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(data: ConnectionStatus) {
    if (!this.wss) return;

    const message = JSON.stringify({
      type: 'connection_status',
      data
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Close WebSocket server and stop polling
   */
  close() {
    this.stopPolling();

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    console.log('[WS] WebSocket service closed');
  }

  /**
   * Called when user logs in - start polling if clients connected
   */
  onLogin() {
    if (this.wss && this.wss.clients.size > 0) {
      this.startPolling();
    }
  }

  /**
   * Called when user logs out - stop polling
   */
  onLogout() {
    this.stopPolling();
  }
}

export const connectionWebSocket = new ConnectionWebSocketService();
