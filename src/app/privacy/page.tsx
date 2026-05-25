import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to ChessLab
        </Link>
        <h1 className="text-4xl font-bold text-foreground mt-4 mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: May 25, 2026
        </p>

        <div className="space-y-8 text-foreground/90 leading-relaxed">
          <section>
            <p className="text-muted-foreground">
              ChessLab is a personal chess training app run by an individual
              developer. This page describes exactly what data the app stores,
              what gets sent to third parties, and how you can remove your
              information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              1. What we store about you
            </h2>
            <p className="text-muted-foreground mb-2">
              Your ChessLab account holds:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground ml-2">
              <li>
                <strong className="text-foreground/90">Email and name</strong> —
                used to identify your account and to send verification,
                password-reset, and (if enabled) daily training reminder
                emails.
              </li>
              <li>
                <strong className="text-foreground/90">
                  Password hash
                </strong>{" "}
                (only if you signed up with email/password) — never stored in
                plain text. If you used Google sign-in, no password is stored.
              </li>
              <li>
                <strong className="text-foreground/90">
                  Your repertoire, training history, and puzzle reviews
                </strong>{" "}
                — every line you save, every SRS recall rating, and the
                resulting scheduler state.
              </li>
              <li>
                <strong className="text-foreground/90">App settings</strong> —
                puzzle preferences, board theme, daily-email opt-in, and other
                in-app toggles.
              </li>
              <li>
                <strong className="text-foreground/90">
                  Optional external usernames
                </strong>{" "}
                — if you save a chess.com or Lichess username for Gap
                Analysis, we store it so you don&apos;t have to retype it.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              2. What we don&apos;t store
            </h2>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground ml-2">
              <li>
                We don&apos;t use analytics or tracking pixels. There&apos;s no
                Google Analytics, Mixpanel, Posthog, Segment, or similar tool
                running on ChessLab.
              </li>
              <li>
                We don&apos;t sell or share your data with advertisers. There
                are no ads.
              </li>
              <li>
                Your IP address is checked transiently for rate-limiting on
                sensitive endpoints (login, password reset, write APIs). It is
                not logged to a database or persisted.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              3. Third-party services we use
            </h2>
            <p className="text-muted-foreground mb-3">
              ChessLab relies on a small number of third-party services to
              operate. None of them are sent more data than the feature
              requires.
            </p>
            <ul className="space-y-3 text-muted-foreground">
              <li>
                <strong className="text-foreground/90">Vercel</strong> hosts the
                app and runs every request. They process incoming HTTP traffic
                and have access to operational logs.
              </li>
              <li>
                <strong className="text-foreground/90">
                  PostgreSQL database
                </strong>{" "}
                stores your account data. Connections are TLS-encrypted.
              </li>
              <li>
                <strong className="text-foreground/90">
                  Google (OAuth)
                </strong>{" "}
                — only used if you choose &quot;Sign in with Google&quot;.
                Google shares your email and basic profile with us; we share
                nothing back.
              </li>
              <li>
                <strong className="text-foreground/90">Resend</strong> delivers
                transactional email (verification, password reset, daily
                reminders). Your email address is passed to them at send
                time.
              </li>
              <li>
                <strong className="text-foreground/90">
                  chess.com & Lichess
                </strong>{" "}
                — only contacted from Gap Analysis, and only with the username
                you entered. Their public APIs return your recent games; we
                replay them in your browser and never store them.
              </li>
              <li>
                <strong className="text-foreground/90">
                  stockfish.online
                </strong>{" "}
                — used by the &quot;Analyze&quot; toggle in Tactics. We send
                only a position (FEN). No identifying information is included
                in the request.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              4. Cookies
            </h2>
            <p className="text-muted-foreground">
              ChessLab sets a single session cookie via NextAuth so you stay
              signed in. There are no advertising or tracking cookies. The
              session cookie is HTTP-only, secure, and tied to your browser.
              Clearing it (or signing out) ends your session.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              5. Your rights
            </h2>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground ml-2">
              <li>
                <strong className="text-foreground/90">View & edit</strong> —
                every piece of data we store about you is visible inside the
                app (repertoire, training history, settings, account profile).
              </li>
              <li>
                <strong className="text-foreground/90">Delete</strong> —{" "}
                <Link
                  href="/settings"
                  className="underline hover:text-foreground">
                  Settings → Delete Account
                </Link>{" "}
                removes your account and all associated data from the
                database. This action is immediate and irreversible.
              </li>
              <li>
                <strong className="text-foreground/90">Stop emails</strong> —
                disable daily training reminders from Settings at any time.
                You&apos;ll still receive essential account emails (password
                reset, verification) while your account exists.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              6. Changes to this policy
            </h2>
            <p className="text-muted-foreground">
              If the data ChessLab handles changes materially, this page will
              be updated and the &quot;Last updated&quot; date above will
              reflect the change.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              7. Contact
            </h2>
            <p className="text-muted-foreground">
              Questions or data requests can go to{" "}
              <a
                href="mailto:privacy@chesslab.pt"
                className="underline hover:text-foreground">
                privacy@chesslab.pt
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
