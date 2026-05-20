import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      emailVerified?: Date | null;
      createdAt?: Date;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    emailVerified?: Date | null;
    createdAt?: Date;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    emailVerified?: Date | null;
    createdAt?: Date;
    // Transient signal from the login form: when false, the jwt callback
    // overrides token.exp to a short window even if the cookie has a
    // 30-day lifetime.
    rememberMe?: boolean;
  }
}
