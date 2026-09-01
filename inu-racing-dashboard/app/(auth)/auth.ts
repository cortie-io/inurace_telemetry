import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/auth/password";
import { getUserByUsername } from "@/lib/auth/queries";
import { authConfig } from "./auth.config";

// No signup: crew accounts are admin-seeded (db/seed.ts), same policy as classnet.chat.
export type UserRole = "crew";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      username: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    username?: string;
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    username: string;
    role: UserRole;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.username = user.username as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.role = token.role;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const username = String(credentials.username ?? "").trim();
        const password = String(credentials.password ?? "");
        if (!username || !password) return null;

        const user = await getUserByUsername(username);
        if (!user) {
          // Dummy compare so a nonexistent username takes the same time as a wrong password.
          await verifyPassword(password, DUMMY_PASSWORD_HASH);
          return null;
        }

        const passwordsMatch = await verifyPassword(password, user.passwordHash);
        if (!passwordsMatch) return null;

        return {
          id: user.id,
          username: user.username,
          name: user.displayName,
          role: user.role as UserRole,
        };
      },
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
    }),
  ],
});
