#!/bin/bash

# Create base directory
mkdir -p sample-projects

# Clean up if exists
rm -rf sample-projects/*

# Function to generate a large shared file content
get_shared_code() {
cat <<EOF
/**
 * Core authentication logic shared across services.
 * This handles token validation, user session management, and permission checks.
 */
export class AuthManager {
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
EOF
}

# --- Project A ---
mkdir -p sample-projects/project-a/src
echo '{"name": "project-a", "version": "1.0.0"}' > sample-projects/project-a/package.json
get_shared_code > sample-projects/project-a/src/auth.ts

cat <<EOF > sample-projects/project-a/src/server.ts
import { AuthManager } from './auth';

const auth = new AuthManager("secret-a");
console.log("Project A Server Started");
EOF

# --- Project B ---
mkdir -p sample-projects/project-b/src
echo '{"name": "project-b", "version": "1.0.0"}' > sample-projects/project-b/package.json
# Copy shared code but maybe rename the class to test structural matching?
# For now, let's keep it identical to ensure it works first, but maybe change whitespace
get_shared_code | sed 's/AuthManager/SessionController/g' > sample-projects/project-b/src/session.ts

cat <<EOF > sample-projects/project-b/src/worker.ts
console.log("Project B Worker");
// Some unique logic
for(let i=0; i<10; i++) {
    console.log(i);
}
EOF

# --- Project C ---
mkdir -p sample-projects/project-c/src
echo '{"name": "project-c", "version": "1.0.0"}' > sample-projects/project-c/package.json
# Internal Duplication
get_shared_code > sample-projects/project-c/src/legacy_auth.ts

# Internal duplicate file 1
cat <<EOF > sample-projects/project-c/src/helper.ts
export function complexCalculation(a: number, b: number): number {
    console.log("Starting calculation");
    let result = a * b;
    result = result + (a / b);
    result = Math.pow(result, 2);

    if (result > 1000) {
        console.log("Result is large");
        return 1000;
    }

    // More padding
    const temp = [1, 2, 3, 4, 5];
    temp.forEach(n => {
        result += n;
    });

    return result;
}
EOF

# Internal duplicate file 2 (Identical to helper.ts)
cp sample-projects/project-c/src/helper.ts sample-projects/project-c/src/helper_v2.ts

echo "Sample projects created."
