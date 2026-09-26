export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(hash: string, plain: string): Promise<boolean>;
