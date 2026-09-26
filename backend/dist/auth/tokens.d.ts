export declare const SESSION_COOKIE_NAME = "packpanel_session";
export interface UserSession {
    sessionId: string;
    userId: string;
    username: string;
    role: 'admin' | 'operator' | 'viewer';
}
export declare function hashToken(token: string): string;
export declare function createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<{
    sessionId: string;
    token: string;
}>;
export declare function validateSession(sessionId: string, token: string): Promise<UserSession | null>;
export declare function revokeSession(sessionId: string): Promise<void>;
