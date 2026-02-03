/**
 * Core authentication logic shared across services.
 * This handles token validation, user session management, and permission checks.
 */
export class SessionController {
    private secretKey: string;
    private tokenExpiry: number;

    constructor(secret: string) {
        this.secretKey = secret;
        this.tokenExpiry = 3600; // 1 hour
    }

    /**
     * Validates the provided auth token.
     * @param token The JWT token string
     */
    public validateToken(token: string): boolean {
        if (!token) {
            console.error("Token is missing");
            return false;
        }

        if (token.length < 10) {
            console.warn("Token is too short");
            return false;
        }

        // Simulate complex validation logic
        const parts = token.split('.');
        if (parts.length !== 3) {
            return false;
        }

        try {
            const payload = JSON.parse(atob(parts[1]));
            if (payload.exp < Date.now() / 1000) {
                console.log("Token expired");
                return false;
            }
        } catch (e) {
            console.error("Invalid token format", e);
            return false;
        }

        return true;
    }

    public createSession(userId: string, role: string): any {
        console.log("Creating session for " + userId);

        // Boilerplate session creation
        const session = {
            id: Math.random().toString(36).substring(7),
            userId: userId,
            role: role,
            createdAt: new Date(),
            isActive: true,
            permissions: []
        };

        if (role === 'admin') {
            session.permissions.push('read:all');
            session.permissions.push('write:all');
            session.permissions.push('delete:all');
        } else {
            session.permissions.push('read:own');
        }

        return session;
    }

    public logout(sessionId: string): void {
        console.log("Logging out session " + sessionId);
        // cleanup logic
        // database calls
        // cache invalidation
        // notification
    }

    // Some utility methods that take up space
    private hash(data: string): string {
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }
}
