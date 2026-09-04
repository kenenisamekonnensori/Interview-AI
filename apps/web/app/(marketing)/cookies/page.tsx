import type { Metadata } from "next";
import { LegalDoc } from "../../../features/marketing/components/legal-doc";
import { LEGAL_UPDATED, SUPPORT_EMAIL } from "../../../features/marketing/site";

export const metadata: Metadata = { title: "Cookie policy" };

export default function CookiesPage() {
  return (
    <LegalDoc
      title="Cookie policy"
      description="A plain-language explanation of the cookies and similar technologies Interviewer AI uses, and how you can control them."
      updated={LEGAL_UPDATED}
      sections={[
        {
          id: "what-are-cookies",
          heading: "What cookies are",
          paragraphs: [
            "Cookies are small text files stored on your device when you visit a website. They let a site recognize your browser, remember your preferences, and understand how the site is used. We also use similar technologies such as local storage for the same purposes.",
            "We keep the use of cookies deliberately small: the Service is a tool you use signed in, and most of what it needs can be handled with a handful of purpose-limited cookies.",
          ],
        },
        {
          id: "cookies-we-use",
          heading: "Cookies we use",
          paragraphs: [
            "Essential cookies. Required for the Service to work — they keep you signed in, protect your session from tampering, and remember security choices. These are always active, because without them you couldn't sign in or hold a practice session.",
            "Preference cookies. Remember choices you make, such as your language or theme, so you don't have to set them again on every visit. These are active only where you've made a choice.",
            "Analytics cookies. Help us understand how the Service is used in aggregate — which pages people visit, where sessions stall, which features get used. This data is used to improve the product and is not used to build profiles about you or to advertise to you.",
          ],
        },
        {
          id: "third-party",
          heading: "Third-party cookies",
          paragraphs: [
            "Some analytics and infrastructure providers may set their own cookies or similar technologies when you use the Service. These providers use the data only on our behalf, under our instructions, and in line with our Privacy policy. We do not permit advertising networks on the Service.",
          ],
        },
        {
          id: "managing-cookies",
          heading: "Managing cookies",
          paragraphs: [
            "You can control cookies through your browser settings — most browsers let you view, block, or delete cookies per site. Blocking essential cookies will prevent you from signing in and using the core Service, so we recommend leaving those enabled.",
            "Because preferences can be stored in cookies, clearing your cookies may reset choices like your theme. You can make these choices again at any time.",
          ],
        },
        {
          id: "changes",
          heading: "Changes to this policy",
          paragraphs: [
            "If the cookies we use change materially — for example, if we add a new category — we'll update this page and, where appropriate, ask for your consent before enabling the new technology.",
          ],
        },
        {
          id: "contact",
          heading: "Contact",
          paragraphs: [
            `Questions about cookies or this policy? Email ${SUPPORT_EMAIL}.`,
          ],
        },
      ]}
    />
  );
}