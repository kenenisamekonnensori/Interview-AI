import type { Metadata } from "next";
import { LegalDoc } from "../../../features/marketing/components/legal-doc";
import { LEGAL_UPDATED, SUPPORT_EMAIL } from "../../../features/marketing/site";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of service"
      description="These terms govern your use of the Interviewer AI service operated by InterviewAi. Please read them carefully — by creating an account or using the Service, you agree to them."
      updated={LEGAL_UPDATED}
      sections={[
        {
          id: "acceptance",
          heading: "Acceptance of these terms",
          paragraphs: [
            "These Terms of Service (“Terms”) form a binding agreement between you and InterviewAi (“Interviewer AI,” “we,” “us”) for the use of our website and application (the “Service”). If you use the Service on behalf of an organization, you represent that you have authority to bind that organization, and references to “you” include the organization.",
            "We may update these Terms from time to time. When changes are material, we'll make the revised version available here and update the “Last updated” date. Continued use of the Service after changes take effect means you accept the updated Terms. If you don't agree, you should stop using the Service.",
          ],
        },
        {
          id: "eligibility",
          heading: "Eligibility",
          paragraphs: [
            "You must be at least 16 years old (or the age of digital consent in your jurisdiction) to use the Service. By creating an account you confirm that you meet this requirement and that the information you provide is accurate and current.",
          ],
        },
        {
          id: "account",
          heading: "Your account",
          paragraphs: [
            "You're responsible for safeguarding your account credentials and for everything that happens under your account. If you believe your account has been compromised, change your password and contact us immediately.",
            "You may not create accounts through unauthorized or automated means, misrepresent your identity, or register accounts in a way that circumvents our limits (such as repeated free accounts to exceed plan allowances). We may suspend or close accounts that violate these Terms.",
          ],
        },
        {
          id: "the-service",
          heading: "The Service",
          paragraphs: [
            "Interviewer AI provides voice-first mock interviews and feedback to help you prepare for real interviews. You provide context (such as a resume and job description), and the Service generates and conducts practice conversations and produces evaluation reports.",
            "The Service is provided “as is” for lawful, personal preparation purposes. We work to keep it available and accurate, but the Service is not a guarantee of any interview outcome, job offer, or employment result.",
          ],
        },
        {
          id: "subscriptions",
          heading: "Subscriptions and billing",
          paragraphs: [
            "The Service offers a free plan and paid subscription plans. Paid plans renew automatically at the end of each billing period until cancelled, at the rate shown at the time of purchase (including any discounts, which apply only to the stated period). Prices may change for future billing periods, with notice before they take effect.",
            "You can upgrade, downgrade, or cancel from your account settings. Cancellation takes effect at the end of the current billing period, and you keep access until then. If you cancel within 14 days of your first paid subscription payment, we'll refund it in full on request; refunds for later periods are provided at our discretion, for example where the Service was unavailable for an extended time.",
            "Payment is processed by our payment providers; we do not store full card numbers. If a payment fails, we'll retry and notify you, and we may suspend access if the account remains unpaid.",
          ],
        },
        {
          id: "acceptable-use",
          heading: "Acceptable use",
          paragraphs: [
            "You agree not to misuse the Service. Prohibited conduct includes: attempting to access, scrape, or disrupt the Service or its infrastructure beyond normal use; probing, scanning, or testing for vulnerabilities without authorization; uploading content you don't have the right to provide; using the Service to generate spam, harassment, or content that is unlawful, defamatory, or infringing; impersonating others; reselling or sublicensing the Service without our written consent; and using the Service to build a competing product or train a competing model.",
            "We may suspend or terminate access for conduct that violates these Terms or that harms other users or the Service. Where feasible, we'll warn you first — but we may act immediately for serious violations or where required by law.",
          ],
        },
        {
          id: "your-content",
          heading: "Your content",
          paragraphs: [
            "You retain all rights in the resumes, job descriptions, and other content you provide (“Your Content”). You grant us a limited license to host, process, and analyze Your Content solely to provide the Service to you — for example, to personalize interviews and generate reports.",
            "You represent that you own or have the right to provide Your Content, and that it doesn't violate anyone's rights. We don't claim ownership of Your Content, and we don't sell it or use it to train third-party models.",
            "To improve the Service, we may analyze aggregated, de-identified usage patterns. If we ever use practice content to improve quality beyond serving your own sessions, it will be on an aggregated basis that doesn't identify you.",
          ],
        },
        {
          id: "ai-output",
          heading: "AI output and disclaimers",
          paragraphs: [
            "Interviews, follow-up questions, evaluations, and reports are generated by AI systems. AI output can be imperfect: an interviewer may mishear an answer, a report may under- or overstate a strength, and generated questions may not always match your context. Feedback is an aid to your judgment, not an authoritative assessment of your abilities.",
            "You're responsible for how you use feedback, and the Service must not be relied on for decisions where error would cause harm — for example, it is not a licensed assessment, medical, or legal service. Practice data you share with us is protected under our Privacy policy; anything you say in a practice session should still be information you're comfortable providing to a commercial service.",
          ],
        },
        {
          id: "ip",
          heading: "Intellectual property",
          paragraphs: [
            "The Service — including its software, design, branding, and generated product text — is owned by us or our licensors and is protected by intellectual property laws. We grant you a personal, non-exclusive, non-transferable, revocable license to use the Service for your own preparation, subject to these Terms. No other rights are granted.",
          ],
        },
        {
          id: "third-parties",
          heading: "Third-party services",
          paragraphs: [
            "The Service integrates with third-party providers (such as authentication, speech, AI, email, and hosting providers) that process data as described in our Privacy policy. The Service may also link to third-party websites; we're not responsible for their content or practices. Our pages are hosted on infrastructure we contract for, and you may choose to sign in through Google — which is governed by Google's own terms as well as ours.",
          ],
        },
        {
          id: "termination",
          heading: "Termination",
          paragraphs: [
            "You may stop using the Service and delete your account at any time from your settings. We may suspend or terminate your access for breach of these Terms, for conduct that threatens the Service or other users, or where we discontinue the Service. Upon termination you lose access to your account, and we'll delete your data in line with our Privacy policy. Sections of these Terms that by their nature survive — including content licenses you granted, disclaimers, limitation of liability, and governing law — continue to apply.",
          ],
        },
        {
          id: "disclaimers",
          heading: "Disclaimers",
          paragraphs: [
            "To the maximum extent permitted by law, the Service is provided “as is” and “as available,” without warranties of any kind, express or implied — including implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We don't warrant that the Service will be uninterrupted, error-free, or that feedback will be accurate or complete. You use the Service at your own risk.",
          ],
        },
        {
          id: "liability",
          heading: "Limitation of liability",
          paragraphs: [
            "To the maximum extent permitted by law, InterviewAi and its providers won't be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, data, or goodwill, arising out of or related to your use of the Service — even if advised of the possibility. Our total liability for any claim arising from the Service will not exceed the greater of the amount you paid us in the twelve months before the claim, or one hundred dollars ($100). Nothing in these Terms limits liability that cannot be limited by law.",
          ],
        },
        {
          id: "indemnification",
          heading: "Indemnification",
          paragraphs: [
            "You agree to indemnify and hold harmless InterviewAi and its officers, employees, and providers from claims, damages, and costs (including reasonable legal fees) arising from your use of the Service, Your Content, or your breach of these Terms — to the extent the claim is caused by you.",
          ],
        },
        {
          id: "changes-to-terms",
          heading: "Changes to these Terms",
          paragraphs: [
            "We may revise these Terms to reflect changes to the Service, legal requirements, or our practices. We'll provide reasonable notice of material changes, and the revised Terms will apply from the effective date shown. If you continue using the Service after changes take effect, you accept them; if you don't, you can stop using the Service and delete your account.",
          ],
        },
        {
          id: "governing-law",
          heading: "Governing law and disputes",
          paragraphs: [
            "These Terms are governed by the laws of the jurisdiction in which InterviewAi is established, without regard to conflict-of-law rules. We encourage you to contact us first with any dispute — most issues are resolved fastest by email. If a dispute isn't resolved informally, you agree it will be resolved in the competent courts of that jurisdiction, and you consent to their jurisdiction.",
            "If any provision of these Terms is found unenforceable, the remaining provisions continue in full force.",
          ],
        },
        {
          id: "contact",
          heading: "Contact",
          paragraphs: [
            `Questions about these Terms? Email ${SUPPORT_EMAIL} and we'll help.`,
          ],
        },
      ]}
    />
  );
}