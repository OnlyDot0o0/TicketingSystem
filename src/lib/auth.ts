import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "البريد الإلكتروني", type: "email" },
        password: { label: "كلمة المرور", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as "SUPER_ADMIN" | "ADMIN" | "AGENT" | "CUSTOM",
          customRoleId: user.customRoleId,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user, trigger, session }) => {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = (user as { id: string }).id;
        token.customRoleId = (user as { customRoleId?: string | null }).customRoleId ?? null;
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false;
      }
      // Triggered by unstable_update() from a server action (e.g. after
      // changePasswordAction clears the DB flag) — merges the caller-
      // supplied partial session into the token without a full re-sign-in.
      if (trigger === "update" && session && typeof session === "object") {
        const patch = (session as { user?: { mustChangePassword?: boolean } }).user;
        if (patch && typeof patch.mustChangePassword === "boolean") {
          token.mustChangePassword = patch.mustChangePassword;
        }
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        const user = session.user as { role?: string; id?: string; customRoleId?: string | null; mustChangePassword?: boolean };
        user.role = token.role as string;
        user.id = token.id as string;
        user.customRoleId = (token.customRoleId as string | null | undefined) ?? null;
        user.mustChangePassword = (token.mustChangePassword as boolean | undefined) ?? false;
      }
      return session;
    },
  },
});
