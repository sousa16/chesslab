import { authOptions } from "@/lib/auth";

describe("Auth Options Configuration", () => {
  describe("Session Strategy", () => {
    it("should use JWT session strategy", () => {
      expect(authOptions.session?.strategy).toBe("jwt");
    });
  });

  describe("Sign In Page", () => {
    it("should have / as custom sign in page", () => {
      expect(authOptions.pages?.signIn).toBe("/");
    });
  });

  describe("Providers", () => {
    it("should include Google provider", () => {
      const googleProvider = authOptions.providers.find(
        (p) => p.id === "google",
      );
      expect(googleProvider).toBeDefined();
    });

    it("should include Credentials provider", () => {
      const credentialsProvider = authOptions.providers.find(
        (p) => p.id === "credentials",
      );
      expect(credentialsProvider).toBeDefined();
    });

    it("should have 2 providers configured", () => {
      expect(authOptions.providers).toHaveLength(2);
    });
  });

  describe("Callbacks", () => {
    it("should have jwt callback", () => {
      expect(authOptions.callbacks?.jwt).toBeDefined();
    });

    it("should have session callback", () => {
      expect(authOptions.callbacks?.session).toBeDefined();
    });

    describe("JWT Callback", () => {
      it("should add user id to token when user is present", async () => {
        const jwtCallback = authOptions.callbacks?.jwt as any;
        const token = { name: "Test User" };
        const user = { id: "user-123", email: "test@example.com" };

        const result = await jwtCallback({ token, user });

        expect(result.id).toBe("user-123");
      });

      it("should return unchanged token when no user is present", async () => {
        const jwtCallback = authOptions.callbacks?.jwt as any;
        const token = { id: "existing-id", name: "Test User" };

        const result = await jwtCallback({ token, user: undefined });

        expect(result).toEqual(token);
      });
    });

    describe("Session Callback", () => {
      it("should add token id to session user", async () => {
        const sessionCallback = authOptions.callbacks?.session as any;
        const session = { user: { email: "test@example.com" } };
        const token = { id: "token-id-123" };

        const result = await sessionCallback({ session, token });

        expect(result.user.id).toBe("token-id-123");
      });

      it("should return unchanged session when no user is present", async () => {
        const sessionCallback = authOptions.callbacks?.session as any;
        const session = { user: null };
        const token = { id: "token-id-123" };

        const result = await sessionCallback({ session, token });

        expect(result.user).toBeNull();
      });
    });
  });

  describe("NEXTAUTH_SECRET", () => {
    it("should require NEXTAUTH_SECRET environment variable", () => {
      expect(authOptions.secret).toBeDefined();
    });
  });
});
