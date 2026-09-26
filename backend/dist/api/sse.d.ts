import { FastifyReply, FastifyRequest } from 'fastify';
declare class SSEManager {
    private clients;
    addClient(req: FastifyRequest, reply: FastifyReply): void;
    sendToClient(clientId: string, event: string, data: any): void;
    broadcast(event: string, data: any): void;
    closeAll(): void;
    startHeartbeat(): void;
}
export declare const sseManager: SSEManager;
export {};
