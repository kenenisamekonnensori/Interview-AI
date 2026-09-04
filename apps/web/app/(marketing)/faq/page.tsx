import type { Metadata } from "next";
import { CtaCard } from "../../../features/marketing/components/cta-card";
import { FaqList } from "../../../features/marketing/components/faq-list";
import { PageHeading } from "../../../features/marketing/components/page-heading";

export const metadata: Metadata = { title: "FAQ" };

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <PageHeading
        eyebrow="FAQ"
        title="Frequently asked questions"
        description="Straight answers to the questions we hear most. Can't find yours? Email support and a real person will reply."
      />

      <div className="mt-12">
        <FaqList
          groups={[
            {
              id: "getting-started",
              title: "Getting started",
              items: [
                {
                  q: "What is Interviewer AI?",
                  a: "Interviewer AI is a voice-first interview preparation platform. You upload your resume and a target job description, then have a live spoken conversation with an AI interviewer that adapts to your answers — followed by a detailed feedback report.",
                },
                {
                  q: "Do I need to pay to try it?",
                  a: "No. The Free plan includes a full practice interview with resume analysis and feedback every month, with no credit card required.",
                },
                {
                  q: "How is this different from reading interview questions?",
                  a: "Reading questions prepares you to recognize topics; speaking prepares you to actually answer. Our interviewer listens to what you say and asks follow-ups, so you practice the real skill — holding a conversation under pressure.",
                },
                {
                  q: "What interview types are available?",
                  a: "Behavioral, technical, HR/culture-fit, and mixed interviews. More types, including system design and coding, are on the way.",
                },
              ],
            },
            {
              id: "voice",
              title: "Voice & technical",
              items: [
                {
                  q: "How does the voice interview work?",
                  a: "Your browser captures your microphone audio and streams it for transcription, while the interviewer's responses are spoken back to you in real time. It feels like a voice call — you just talk.",
                },
                {
                  q: "What browsers and devices are supported?",
                  a: "Current versions of Chrome, Edge, and Safari work on desktop, along with the latest Chrome and Safari on mobile. Your device needs a microphone and a stable internet connection.",
                },
                {
                  q: "What if I don't have a microphone or I'm in a noisy place?",
                  a: "Every interview type also works with typed answers. If audio isn't an option, practice in text — the interviewer still adapts to your answers and you still get a full report.",
                },
                {
                  q: "Is my audio recorded?",
                  a: "Audio is transcribed for the interviewer to respond to and is not stored as a recording unless the product explicitly adds recording with your consent. Your transcripts and data are encrypted.",
                },
              ],
            },
            {
              id: "data",
              title: "Accounts & privacy",
              items: [
                {
                  q: "What happens to my resume and interview data?",
                  a: "It's used to personalize your practice and generate your reports — nothing else. We never sell your data. See our Privacy policy for the full picture.",
                },
                {
                  q: "Can I delete my account and data?",
                  a: "Yes, at any time from your account settings. Deleting your account permanently removes your profile, resumes, transcripts, and interview history.",
                },
                {
                  q: "Where is my data stored and is it encrypted?",
                  a: "Data is encrypted in transit and at rest. Provider credentials stay server-side — nothing sensitive is ever exposed to your browser.",
                },
              ],
            },
            {
              id: "billing",
              title: "Billing & plans",
              items: [
                {
                  q: "What's included in the Free plan?",
                  a: "One voice practice interview per month, resume and job-description analysis, and a full feedback report — enough to experience the real thing before you upgrade.",
                },
                {
                  q: "What does Pro add?",
                  a: "Unlimited practice interviews, all interview types, progress tracking across sessions, communication metrics, and priority support. See the pricing page for the full comparison.",
                },
                {
                  q: "Do you offer student or education discounts?",
                  a: "Yes — verified students get a discount on Pro, and bootcamps, universities, and career services can reach out about Teams plans with bulk pricing.",
                },
                {
                  q: "Can I cancel anytime?",
                  a: "Yes. Cancel from your account settings and you'll keep access until the end of your billing period. New Pro accounts also come with a 14-day money-back guarantee.",
                },
              ],
            },
          ]}
        />
      </div>

      <div className="mt-14">
        <CtaCard
          title="Question not answered here?"
          body="Email us and we'll get back to you within one business day — often much faster."
          ctaLabel="Email support"
          href="/contact"
        />
      </div>
    </div>
  );
}
