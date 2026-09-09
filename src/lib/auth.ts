import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: {
    strategy: "jwt",
    // No maxAge/updateAge here before this meant NextAuth's own default:
    // a 30-day session with no idle cap — far too long for a staff tool
    // with access to customer contact info and internal notes. maxAge is
    // the hard ceiling (re-login required once a session has existed this
    // long regardless of activity); updateAge is how often an ACTIVE
    // session's expiry silently rolls forward, so a genuinely idle session
    // still expires at updateAge past the last real request rather than
    // sitting valid for the full maxAge. 12h/1h gives staff a full
    // workday before being forced to re-login while still capping how
    // long a forgotten, unattended session (e.g. a shared/kiosk machine)
    // stays valid.
    maxAge: 12 * 60 * 60, // 12 hours
    updateAge: 60 * 60, // 1 hour
  },
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
      // changePasswordAction clears the DB flag, or updateAccountInfoAction
      // changes the signed-in user's own name/email) — merges the caller-
      // supplied partial session into the token without a full re-sign-in.
      if (trigger === "update" && session && typeof session === "object") {
        const patch = (session as { user?: { mustChangePassword?: boolean; name?: string; email?: string } }).user;
        if (patch && typeof patch.mustChangePassword === "boolean") {
          token.mustChangePassword = patch.mustChangePassword;
        }
        // name/email live on the token via NextAuth's own default fields
        // (it populates them from authorize()'s return value at sign-in,
        // and the default session callback mirrors them onto session.user
        // before this file's custom session() callback below ever runs) —
        // so patching them here is enough to make an in-place account-info
        // edit show up immediately, with no separate handling needed in
        // the session() callback.
        if (patch && typeof patch.name === "string") {
          token.name = patch.name;
        }
        if (patch && typeof patch.email === "string") {
          token.email = patch.email;
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
