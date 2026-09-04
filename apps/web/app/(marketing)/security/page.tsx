import type { Metadata } from "next";
import { LegalDoc } from "../../../features/marketing/components/legal-doc";
import { LEGAL_UPDATED, SUPPORT_EMAIL } from "../../../features/marketing/site";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <LegalDoc
      title="Security"
      description="Your resume, transcripts, and account data are sensitive — here's how we protect them, and how to tell us if you find a problem."
      updated={LEGAL_UPDATED}
      sections={[
        {
          id: "encryption",
          heading: "Encryption",
          paragraphs: [
            "All traffic between your browser and our services is encrypted in transit using TLS. Data stored in our databases and object storage is encrypted at rest. Passwords are never stored in plain text — they're hashed and salted before being saved.",
            "Resumes and other uploaded files are stored in private, access-controlled storage buckets and served only to you and the systems that need to process them for your sessions.",
          ],
        },
        {
          id: "credentials",
          heading: "Credential handling",
          paragraphs: [
            "Keys for third-party providers — speech recognition, text-to-speech, AI, and email — exist only on our servers and are never exposed to the browser. Voice access uses short-lived tokens that expire quickly, so there is no long-lived voice credential sitting in client code that could be extracted and abused.",
            "Environment configuration keeps secrets out of client bundles entirely: nothing prefixed as server-only is ever shipped to the browser.",
          ],
        },
        {
          id: "access",
          heading: "Access control and isolation",
          paragraphs: [
            "Access to production systems is limited to the people who need it, authenticated with strong credentials, and logged. Your data is isolated by account: sessions, transcripts, and reports are only ever served to the account that owns them, with authorization checked on every request.",
            "We follow the principle of least privilege for our own tooling and review access as the team and systems change.",
          ],
        },
        {
          id: "data-protection",
          heading: "Data protection measures",
          paragraphs: [
            "We collect only the data the Service needs and keep it only as long as your account is active — you can delete your account and data at any time. Audio is processed in real time to run your voice session and is not retained as a recording unless recording becomes an explicit, consent-based feature.",
            "We monitor the Service for unusual activity, keep dependencies patched, and review our configuration regularly. These are practices, not guarantees: no system is completely secure, and we're transparent when something goes wrong — if a security incident affects your data, we'll notify you as required by law.",
          ],
        },
        {
          id: "reporting",
          heading: "Reporting vulnerabilities",
          paragraphs: [
            "We take security reports seriously and welcome them from the community. If you believe you've found a vulnerability in the Service, please tell us privately before disclosing it publicly, and give us a reasonable window to investigate and fix the issue.",
            "When reporting, please include enough detail to reproduce the issue — the affected page or endpoint, the steps you took, and the impact you observed. Don't test against production data in ways that could harm other users, and don't access accounts or data beyond what's needed to demonstrate the issue.",
          ],
        },
        {
          id: "contact",
          heading: "Security contact",
          paragraphs: [
            `For security questions or to report a vulnerability, email ${SUPPORT_EMAIL}. For anything urgent involving a live incident, mark the subject “Security incident” so it's routed immediately.`,
          ],
        },
      ]}
    />
  );
}
