import { FastifyInstance } from 'fastify';
import { Server as TusServer } from '@tus/server';
export declare const tusServer: TusServer;
export declare function uploadRoutes(fastify: FastifyInstance): Promise<void>;
