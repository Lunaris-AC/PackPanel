"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sseManager = void 0;
class SSEManager {
    clients = new Map();
    addClient(req, reply) {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const userId = req.user?.userId || 'anonymous';
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('X-Accel-Buffering', 'no');
        reply.raw.flushHeaders();
        this.clients.set(clientId, { id: clientId, reply, userId });
        // Send initial connected event
        this.sendToClient(clientId, 'connected', { status: 'ok', timestamp: Date.now() });
        // Handle client disconnect
        reply.raw.on('close', () => {
            this.clients.delete(clientId);
        });
    }
    sendToClient(clientId, event, data) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        try {
            client.reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
        catch (e) {
            this.clients.delete(clientId);
        }
    }
    broadcast(event, data) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const [id, client] of this.clients.entries()) {
            try {
                client.reply.raw.write(payload);
            }
            catch (e) {
                this.clients.delete(id);
            }
        }
    }
    closeAll() {
        for (const [id, client] of this.clients.entries()) {
            try {
                client.reply.raw.end();
            }
            catch (e) {
                // ignore
            }
        }
        this.clients.clear();
    }
    // Periodic heartbeat every 20 seconds to prevent proxy / Zoraxy / browser timeouts
    startHeartbeat() {
        setInterval(() => {
            const ping = `: heartbeat ${Date.now()}\n\n`;
            for (const [id, client] of this.clients.entries()) {
                try {
                    client.reply.raw.write(ping);
                }
                catch (e) {
                    this.clients.delete(id);
                }
            }
        }, 20000);
    }
}
exports.sseManager = new SSEManager();
exports.sseManager.startHeartbeat();
//# sourceMappingURL=sse.js.map