export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-foreground mb-8">
          Privacy Policy
        </h1>

        <div className="space-y-6 text-foreground/90">
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              1. Information We Collect
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              When you use ChessLab, we collect information that you provide
              directly to us, including:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-2 text-muted-foreground ml-4">
              <li>Email address and name when you create an account</li>
              <li>Chess repertoire data and training progress</li>
              <li>Usage information and preferences</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              2. How We Use Your Information
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-2 text-muted-foreground ml-4">
              <li>Provide, maintain, and improve our services</li>
              <li>Save your chess repertoire and training data</li>
              <li>Send you technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              3. Data Storage and Security
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Your data is stored securely and we implement appropriate
              technical and organizational measures to protect your personal
              information against unauthorized access, alteration, disclosure,
              or destruction.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              4. Third-Party Services
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We use third-party services for authentication (Google OAuth) and
              hosting. These services have their own privacy policies governing
              the use of your information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              5. Your Rights
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You have the right to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-2 text-muted-foreground ml-4">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your repertoire data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              6. Cookies
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We use cookies and similar technologies to maintain your session
              and remember your preferences. You can control cookies through
              your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              7. Changes to This Policy
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this privacy policy from time to time. We will
              notify you of any changes by posting the new policy on this page
              and updating the "Last Updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              8. Contact Us
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about this Privacy Policy, please
              contact us at privacy@chesslab.pt
            </p>
          </section>

          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Last Updated: February 21, 2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
