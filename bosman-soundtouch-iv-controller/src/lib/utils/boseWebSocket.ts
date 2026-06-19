/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { ConnectionCallback, UpdateCallback } from './boseShared';
import { parseUpdateXml } from './boseShared';

export class BoseWebSocketClient {
  private socket: WebSocket | null = null;
  private ip: string;
  private onUpdate: UpdateCallback;
  private onConnectionChange?: ConnectionCallback;
  private reconnectTimer: any = null;
  private shouldReconnect = true;
  private connected = false;
  private connectionAttempts = 0;

  constructor(ip: string, onUpdate: UpdateCallback, onConnectionChange?: ConnectionCallback) {
    this.ip = ip;
    this.onUpdate = onUpdate;
    this.onConnectionChange = onConnectionChange;
  }

  isConnected() {
    return this.connected;
  }

  connect() {
    this.shouldReconnect = true;
    const url = `ws://${this.ip}:8080`;

    // Verhindere Spam: Wenn bereits verbunden oder im Aufbau, nichts tun
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.connectionAttempts++;
      // Bose ist eigenwillig. Wenn 'gabbo' fehlschlägt, versuche es ohne Protokoll-String.
      this.socket = new WebSocket(url, 'gabbo');

      this.socket.onopen = () => {
        console.log(`Bose WebSocket connected: ${this.ip}`);
        this.connectionAttempts = 0;
        this.setConnected(true);
        // WICHTIG: Die Box muss wissen, dass wir Updates wollen!
        this.socket?.send('<updates>');
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.socket.onclose = (event) => {
        if (this.connected) {
          console.log(`Bose WebSocket closed: ${this.ip}`);
          this.setConnected(false);
        }

        // Falls die erste Verbindung fehlschlägt, geben wir auf
        if (this.connectionAttempts === 1 && !this.connected) {
          console.log(`Bose WebSocket initial connection failed for ${this.ip}. Giving up WS.`);
          this.shouldReconnect = false;
          this.onConnectionChange?.(false);
          return;
        }

        // Exponentielles Backoff oder längeres Warten, um den Browser-Tab nicht zu killen
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = () => {
        this.setConnected(false);
        // Wir loggen hier weniger, um die Konsole nicht zu fluten
      };
    } catch (e) {
      this.setConnected(false);
      if (this.connectionAttempts === 1) {
        this.shouldReconnect = false;
      } else {
        this.scheduleReconnect();
      }
    }
  }

  private setConnected(val: boolean) {
    if (this.connected !== val) {
      this.connected = val;
      this.onConnectionChange?.(val);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    // Erhöhe die Zeit auf 15 Sekunden, um "Dauer-Requests" zu vermeiden
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, 15000);
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private handleMessage(data: string) {
    console.log(`Bose WebSocket message from ${this.ip}:`, data);
    if (typeof data !== 'string') return;
    try {
      // The Bose API returns XML updates
      if (data.includes('<updates')) {
        const update = parseUpdateXml(data);
        if (update && Object.keys(update).length > 0) {
          console.log(`Parsed update from ${this.ip}:`, update);
          this.onUpdate(update);
        }
      }
    } catch (e) {
      console.error(`Error handling WebSocket message from ${this.ip}`, e);
    }
  }
}
