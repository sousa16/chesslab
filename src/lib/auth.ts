import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { sendVerificationEmail } from "./email";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        action: { label: "Action", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Please enter your email and password");
        }

        const { email, password, action } = credentials;

        if (action === "register") {
          // Check if user already exists
          const existingUser = await prisma.user.findUnique({
            where: { email },
          });

          if (existingUser) {
            throw new Error("User already exists");
          }

          // Hash password
          const hashedPassword = await bcrypt.hash(password, 12);

          // Create new user (not verified yet)
          const user = await prisma.user.create({
            data: {
              email,
              hashedPassword,
              emailVerified: null, // Not verified yet
            },
          });

          // Generate verification token
          const token = randomBytes(32).toString("hex");
          const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

          await prisma.verificationToken.create({
            data: {
              identifier: email,
              token,
              expires,
            },
          });

          // Send verification email
          await sendVerificationEmail(email, token);

          // Don't automatically log them in - they need to verify first
          throw new Error(
            "Please check your email to verify your account before signing in",
          );
        } else {
          // Login
          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (!user || !user.hashedPassword) {
            throw new Error("Invalid email or password");
          }

          const isPasswordValid = await bcrypt.compare(
            password,
            user.hashedPassword,
          );

          if (!isPasswordValid) {
            throw new Error("Invalid email or password");
          }

          // Check if email is verified
          if (!user.emailVerified) {
            // Delete old expired tokens
            await prisma.verificationToken.deleteMany({
              where: {
                identifier: email,
                expires: { lt: new Date() },
              },
            });

            // Check if there's a valid token already
            const existingToken = await prisma.verificationToken.findFirst({
              where: {
                identifier: email,
                expires: { gt: new Date() },
              },
            });

            let token: string;

            if (existingToken) {
              // Reuse existing valid token
              token = existingToken.token;
            } else {
              // Generate new token
              token = randomBytes(32).toString("hex");
              const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

              await prisma.verificationToken.create({
                data: {
                  identifier: email,
                  token,
                  expires,
                },
              });
            }

            // Send verification email
            await sendVerificationEmail(email, token);

            throw new Error(
              "Please verify your email before signing in. A new verification email has been sent.",
            );
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt,
          };
        }
      },
    }),
  ],
  pages: {
    signIn: "/",
    signOut: "/",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user, trigger, account }) {
      // On initial sign in, user object is passed
      if (user) {
        token.id = user.id;
        token.createdAt = user.createdAt;

        // For OAuth providers, ensure emailVerified is set
        if (account?.provider && account.provider !== "credentials") {
          // Fetch current user state
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { emailVerified: true },
          });

          // If not verified, set it (OAuth emails are pre-verified)
          if (dbUser && !dbUser.emailVerified) {
            const updated = await prisma.user.update({
              where: { id: user.id },
              data: { emailVerified: new Date() },
              select: { emailVerified: true },
            });
            token.emailVerified = updated.emailVerified;
          } else {
            token.emailVerified = dbUser?.emailVerified || null;
          }
        } else {
          token.emailVerified = user.emailVerified;
        }
      }

      // Refresh user data on session update
      if (trigger === "update" && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { emailVerified: true },
        });
        if (dbUser) {
          token.emailVerified = dbUser.emailVerified;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.emailVerified = token.emailVerified as Date | null;
        session.user.createdAt = token.createdAt as Date;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
