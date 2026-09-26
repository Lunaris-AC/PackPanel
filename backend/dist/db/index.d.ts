import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
export declare const pool: Pool;
export declare function query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
export declare function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
