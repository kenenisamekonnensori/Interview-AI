import type { Metadata } from "next";
import { LegalDoc } from "../../../features/marketing/components/legal-doc";
import { LEGAL_UPDATED, SUPPORT_EMAIL } from "../../../features/marketing/site";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy policy"
      description={`This policy explains what InterviewAi (“Interviewer AI,” “we,” “us”) collects, why we collect it, how it's used and protected, and the choices you have over your information. Questions? Email ${SUPPORT_EMAIL}.`}
      updated={LEGAL_UPDATED}
      sections={[
        {
          id: "introduction",
          heading: "Introduction",
          paragraphs: [
            "Interviewer AI is a voice-first interview preparation service. Using it means uploading your resume, providing job descriptions, and having spoken practice interviews that we analyze to give you feedback. Because this is personal and sensitive material, we designed the product around a simple principle: your data belongs to you, and we only process what is needed to make the service work.",
            "This policy applies to the Interviewer AI website and application (together, the “Service”). By creating an account or using the Service, you agree to the practices described here.",
          ],
        },
        {
          id: "information-we-collect",
          heading: "Information we collect",
          paragraphs: [
            "Account information. When you register, we collect your name, email address, and a password (stored as an encrypted hash), or your Google account identifier if you sign in with Google.",
            "Career information you provide. Resumes and job descriptions you upload, along with details you enter about your experience and target role. We analyze this content to personalize your interviews and reports.",
            "Interview data. Transcripts of your practice conversations, audio captured for live transcription during a session, your answers, scores, and the feedback reports we generate. Recordings are processed in real time to run your interview and are not retained unless we introduce recording as an explicit, consent-based feature.",
            "Usage information. Basic analytics such as pages visited, sessions completed, feature usage, and device or browser type, used to understand how the Service is used and to keep it working.",
            "Communications. If you contact support, we keep the content of your message and our replies so we can help you and improve the product.",
          ],
        },
        {
          id: "how-we-use-information",
          heading: "How we use your information",
          paragraphs: [
            "We use the information we collect to provide and improve the Service: to create and authenticate your account; to analyze your resume and job description so interviews are personalized to your actual context; to run live practice interviews, including transcribing your speech so the interviewer can respond; to generate your feedback reports; to save your interview history so you can review progress; to respond to support requests; and to keep the Service secure and reliable.",
            "We do not sell your personal information, and we do not use your resumes, transcripts, or interview content to train third-party models. Your practice data is used to provide the Service to you and to improve it in ways that don't expose your personal content.",
          ],
        },
        {
          id: "legal-bases",
          heading: "Legal bases for processing",
          paragraphs: [
            "Where data-protection law requires a legal basis (such as the GDPR or UK GDPR), we process your information on the following bases: performance of our contract with you, where processing is needed to provide the Service you asked for; legitimate interests, such as keeping the Service secure and understanding aggregate usage; and consent, where we ask for it — for example, if we ever introduce optional recording, we will ask first and you can withdraw consent at any time.",
            "You are never required to provide more information than the Service needs. Where processing is based on consent, you can withdraw it without affecting your ability to use the core Service.",
          ],
        },
        {
          id: "how-we-share-information",
          heading: "How we share information",
          paragraphs: [
            "We share information only with the service providers required to operate the platform, and only to the extent necessary. These include: infrastructure providers that host our servers and databases; an AI provider that processes your resume, job description, and conversation content to generate interview questions, responses, and evaluations; a speech provider that transcribes your audio during live voice sessions and synthesizes the interviewer's speech; an email provider that delivers verification and account emails; and analytics tooling that helps us understand aggregate usage.",
            "Each provider receives only the data needed for its task. They are contractually required to use it solely to provide services to us and to protect it. Where required, we have data-processing agreements in place.",
            "We may also disclose information where the law requires it, to protect the rights and safety of our users or the public, or in connection with a merger, acquisition, or sale of assets — in which case we will require the recipient to honor this policy.",
          ],
        },
        {
          id: "data-retention",
          heading: "Data retention",
          paragraphs: [
            "We keep your data for as long as your account is active, because interview history and reports are part of the Service. If you delete your account, we delete your profile, resumes, job descriptions, transcripts, and reports within a reasonable period, except where we're required to keep limited records for legal, tax, or security purposes.",
            "Audio is processed in real time to run your voice session and is not stored as a recording. If we introduce a recording feature, it will be opt-in, clearly labeled, and deletable by you at any time.",
          ],
        },
        {
          id: "security",
          heading: "Security",
          paragraphs: [
            "We protect your data with industry-standard measures: encryption in transit (TLS) and at rest, hashed and salted passwords, short-lived credentials for voice services, and provider keys that live only on our servers and are never exposed to the browser. Access to production systems is limited and logged. No system is completely secure, but we work continuously to keep yours safe.",
            "See our Security page for a fuller description of the controls we apply.",
          ],
        },
        {
          id: "international-transfers",
          heading: "International data transfers",
          paragraphs: [
            "We and our service providers may process data in countries other than your own. When we transfer personal data across borders, we rely on appropriate safeguards — including standard contractual clauses and the EU-U.S. Data Privacy Framework where applicable — so your information receives a comparable level of protection regardless of where it's processed.",
          ],
        },
        {
          id: "your-rights",
          heading: "Your rights and choices",
          paragraphs: [
            "Depending on where you live, you may have the right to access the personal data we hold about you, correct inaccuracies, request deletion, restrict or object to certain processing, receive a portable copy of data you provided, and withdraw consent where processing is based on it.",
            "Many of these controls are built into the product: you can view and edit your profile, download or review your interview history, and delete your account from your settings at any time. To exercise any other right, email us — we'll respond within the time frame the law requires, usually within one month.",
          ],
        },
        {
          id: "children",
          heading: "Children's privacy",
          paragraphs: [
            "The Service is intended for users who are at least 16 years old (or the age of digital consent in their jurisdiction). We do not knowingly collect personal information from children under that age. If you believe a child has provided us personal information, contact us and we'll delete it promptly.",
          ],
        },
        {
          id: "cookies",
          heading: "Cookies and analytics",
          paragraphs: [
            "We use a small number of cookies and similar technologies: essential cookies required for authentication and security, and analytics cookies that help us understand aggregate usage so we can improve the Service. You can control cookies through your browser settings; blocking essential cookies may prevent you from signing in. See our Cookie policy for details.",
          ],
        },
        {
          id: "changes",
          heading: "Changes to this policy",
          paragraphs: [
            "We may update this policy as the Service evolves. Material changes will be announced on this page and, where practical, notified to you by email or in the product. The “Last updated” date at the top of this page reflects the most recent revision, and continued use of the Service after changes take effect constitutes acceptance of the updated policy.",
          ],
        },
        {
          id: "contact",
          heading: "Contact us",
          paragraphs: [
            `For questions about this policy or to exercise your privacy rights, email ${SUPPORT_EMAIL}. We'll respond promptly — and, where the law requires, designate a point of contact for privacy requests.`,
          ],
        },
      ]}
    />
  );
}
