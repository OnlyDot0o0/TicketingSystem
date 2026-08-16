import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "SUPER_ADMIN" | "ADMIN" | "AGENT" | "CUSTOM";
      customRoleId?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: "SUPER_ADMIN" | "ADMIN" | "AGENT" | "CUSTOM";
    customRoleId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "SUPER_ADMIN" | "ADMIN" | "AGENT" | "CUSTOM";
    id?: string;
    customRoleId?: string | null;
  }
}
