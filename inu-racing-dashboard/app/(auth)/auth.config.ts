import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  basePath: "/api/auth",
  callbacks: {},
  pages: {
    signIn: "/login",
  },
  providers: [],
  trustHost: true,
} satisfies NextAuthConfig;
