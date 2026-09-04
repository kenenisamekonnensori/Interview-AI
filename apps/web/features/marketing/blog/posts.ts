import type { RichBlock } from "../components/rich-text";

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  authorRole: string;
  date: string;
  readTime: string;
  featured?: boolean;
  blocks: RichBlock[];
};

export const posts: BlogPost[] = [
  {
    slug: "structure-your-answer-tell-me-about-yourself",
    title: "How to structure your answer to “Tell me about yourself”",
    excerpt:
      "The most common opening question in any interview — and the one most people wing. Here's a repeatable structure that sounds natural and lands in under ninety seconds.",
    category: "Behavioral",
    author: "The Interviewer AI Team",
    authorRole: "Interviewer AI",
    date: "2026-09-02",
    readTime: "6 min read",
    featured: true,
    blocks: [
      {
        type: "p",
        text: "“Tell me about yourself” is usually the first real question in an interview, and it sets the tone for everything that follows. Yet most candidates either recite their resume in chronological order or improvise and ramble. Both are missed opportunities: this is the one moment where you control the narrative.",
      },
      {
        type: "h2",
        text: "Why this question is harder than it looks",
      },
      {
        type: "p",
        text: "The interviewer isn't asking for your life story. They're asking three quieter questions at once: Can you communicate clearly under a little pressure? Does your background line up with what this role needs? And will you be easy to work with? Your answer should serve all three — which means it needs structure, not length.",
      },
      {
        type: "h2",
        text: "The present → past → future framework",
      },
      {
        type: "p",
        text: "A proven structure is to move from where you are now, to how you got here, to where you're going — finishing on the job you're interviewing for.",
      },
      {
        type: "h3",
        text: "1. Present: who you are professionally",
      },
      {
        type: "p",
        text: "One or two sentences that define you at work today. Name your role, your core strength, and the kind of problems you solve. For example: “I'm a frontend engineer who cares about making complex products feel simple, and for the last three years I've led the design-system work at my current company.”",
      },
      {
        type: "h3",
        text: "2. Past: the thread that led here",
      },
      {
        type: "p",
        text: "Pick one or two career moves that explain why you're the person in sentence one — not a timeline of every job. A pivot, a hard project, or a skill you deliberately built all work, as long as they connect to the present you just described.",
      },
      {
        type: "h3",
        text: "3. Future: why this role, why now",
      },
      {
        type: "p",
        text: "Close by connecting your direction to the company and role. Be specific enough that it couldn't be pasted into any interview: mention the team, the product, or the problem the company is solving that excites you.",
      },
      {
        type: "quote",
        text: "A great answer doesn't tell the interviewer everything about you. It tells them exactly what they need to know and makes them want to ask more.",
      },
      {
        type: "h2",
        text: "Three mistakes to avoid",
      },
      {
        type: "ul",
        items: [
          "Reciting your resume. They already read it. Add what a resume can't show: judgment, motivation, and how you think.",
          "Running long. Aim for 60–90 seconds. If you're still talking at two minutes, you've lost the room.",
          "Ending with “so yeah, that's me.” Land on a forward-looking sentence that hands the conversation to your interviewer.",
        ],
      },
      {
        type: "h2",
        text: "Practice it out loud",
      },
      {
        type: "p",
        text: "An answer that reads well on paper can sound rehearsed or rushed when spoken. Practice the structure out loud — not a word-for-word script, but the three beats — until the shape feels like yours. Say it into a voice practice session, record yourself, and listen for filler words and pacing.",
      },
      {
        type: "tip",
        text: "Interviewer AI turns this exact question into a live voice practice session with follow-ups, so you can test your structure under realistic pressure and get feedback on clarity and delivery.",
      },
    ],
  },
  {
    slug: "star-method-beyond-the-acronym",
    title: "The STAR method, beyond the acronym",
    excerpt:
      "Situation, Task, Action, Result — you know the acronym. The difference between a passable and a memorable behavioral answer lives in how you handle each letter.",
    category: "Behavioral",
    author: "The Interviewer AI Team",
    authorRole: "Interviewer AI",
    date: "2026-08-24",
    readTime: "7 min read",
    blocks: [
      {
        type: "p",
        text: "Every behavioral question — “tell me about a time you disagreed with your manager,” “describe a conflict on your team” — is really asking the same thing: give me proof of how you behave when it matters. STAR is the standard answer shape, but most candidates use it as a box-ticking exercise. Here's how to make each part actually work.",
      },
      {
        type: "h2",
        text: "Situation: set the scene in two sentences",
      },
      {
        type: "p",
        text: "Interviewers need context, not a documentary. Give the setting, the stakes, and your role in it — briefly. “We were two weeks from shipping a major release and a critical dependency had no owner” tells me everything I need. “In Q3 of 2022, at a Series B company of about 140 people…” tells me you're about to ramble.",
      },
      {
        type: "h2",
        text: "Task: make the problem yours",
      },
      {
        type: "p",
        text: "State what you personally owned. This is where many answers go wrong: candidates describe what the team did. Use “I” deliberately. The interviewer is hiring you, not your old team.",
      },
      {
        type: "h2",
        text: "Action: spend most of your time here",
      },
      {
        type: "p",
        text: "As a rule of thumb, half of your answer should be the Action. Interviewers are evaluating your judgment, and judgment shows up in the decisions you made along the way: the options you considered, the trade-offs you weighed, the moment you changed course. A strong action section reads like a short story of decisions, not a list of tasks.",
      },
      {
        type: "ul",
        items: [
          "Name the fork in the road: “I could either rebuild the pipeline or patch the failure — I chose to patch it first because…”",
          "Include a genuine constraint — time, budget, people — and how it shaped your choice.",
          "If you made a mistake mid-way, own it and show the adjustment. It makes the whole story believable.",
        ],
      },
      {
        type: "h2",
        text: "Result: quantify, then reflect",
      },
      {
        type: "p",
        text: "Give the outcome with numbers where you can — “we cut setup time from four hours to twenty minutes” — and then add the reflection that numbers can't capture: what you learned, what you'd repeat, what you'd do differently. That reflection is often what separates senior from junior answers.",
      },
      {
        type: "quote",
        text: "The best STAR stories don't end at the result. They end one beat later, with what the story taught you about how you work.",
      },
      {
        type: "h2",
        text: "Choosing the right story bank",
      },
      {
        type: "p",
        text: "You can't invent a good STAR answer mid-interview. Before you practice, build a small bank of five to seven stories that each prove a different strength: leading through ambiguity, handling conflict, recovering from failure, influencing without authority, and delivering under deadline. Map interview questions to stories instead of memorizing question-specific answers.",
      },
      {
        type: "tip",
        text: "Practice each story out loud until you can tell it in under two minutes without a script. Voice practice with live follow-up questions is the fastest way to find the stories that collapse under pressure.",
      },
    ],
  },
  {
    slug: "what-interviewers-actually-listen-for",
    title: "What interviewers actually listen for",
    excerpt:
      "Beyond the content of your answers, interviewers are tracking a handful of communication signals — often unconsciously. Here's what they are and how to sharpen them.",
    category: "Communication",
    author: "The Interviewer AI Team",
    authorRole: "Interviewer AI",
    date: "2026-08-11",
    readTime: "6 min read",
    blocks: [
      {
        type: "p",
        text: "Two candidates can give the same factual answer and leave completely different impressions. The difference is rarely the facts — it's the communication signals running underneath. Interviewers may not name them, but they're scoring them the whole conversation.",
      },
      {
        type: "h2",
        text: "1. Structure: the shape of your thinking",
      },
      {
        type: "p",
        text: "The single strongest signal is whether you can organize an answer on the spot. Candidates who front-load a conclusion (“I'd start by reproducing the bug, then…”), use signposts (“two things matter here”), and land a clear ending read as clearer thinkers. Rambling reads as fuzzy thinking, even when the content is good.",
      },
      {
        type: "p",
        text: "You don't need a perfect outline before you speak. You need a first sentence that buys you structure: “There are two parts to this — here's the first.”",
      },
      {
        type: "h2",
        text: "2. Conciseness: respect for their time",
      },
      {
        type: "p",
        text: "Interviewers notice when an answer could have been half as long. Conciseness signals confidence: you trust that the key point landed and don't need to pad it. The easiest lever is to answer the question that was asked before adding context — most padding is context no one asked for.",
      },
      {
        type: "h2",
        text: "3. Composure under pressure",
      },
      {
        type: "p",
        text: "Interviews are a stress test by design. How you handle a question you didn't expect — do you stall, over-explain, deflect, or say “good question, let me think for a second”? — tells an interviewer how you'll handle the same moment on the job. Saying “let me think” and actually thinking for ten seconds is a genuinely strong move that most candidates are too nervous to use.",
      },
      {
        type: "h2",
        text: "4. Honesty and calibration",
      },
      {
        type: "p",
        text: "Interviewers hear a lot of polished answers, which is why calibrated honesty stands out. Admitting what you don't know — and what you'd do to find out — builds more trust than bluffing. A candidate who says “I haven't used that, but here's how I'd approach it” sounds like someone safe to put on a real project.",
      },
      {
        type: "h2",
        text: "5. Energy and listening",
      },
      {
        type: "p",
        text: "Interviews are conversations, and conversations require actually hearing the other person. Candidates who pick up on the interviewer's cues — a shorter answer when the interviewer seems pressed for time, a deeper one when they lean in — signal social awareness. So do candidates who ask one or two real questions of their own.",
      },
      {
        type: "quote",
        text: "The question isn't only “can you answer this?” It's “is this someone I'd want in a room full of hard problems?”",
      },
      {
        type: "h2",
        text: "How to train the signals",
      },
      {
        type: "p",
        text: "These signals are trainable, but only if you can hear yourself. Record a practice session and listen for one thing at a time: filler-word rate, answer length, whether you state a conclusion before details. Most people are surprised by how often they hedge (“I think,” “kind of”) when they're unsure — and fixing that one habit does more than any new content.",
      },
      {
        type: "tip",
        text: "A voice interview that records your answers and scores communication quality is the fastest feedback loop for these signals. Practice once a week and compare sessions to see the trend.",
      },
    ],
  },
  {
    slug: "why-practice-out-loud",
    title: "Why you should practice interviews out loud",
    excerpt:
      "Reading about answers and speaking them are different skills. Voice-first practice targets the gap where most interview prep fails — and research on speaking anxiety explains why.",
    category: "Practice",
    author: "The Interviewer AI Team",
    authorRole: "Interviewer AI",
    date: "2026-07-29",
    readTime: "5 min read",
    blocks: [
      {
        type: "p",
        text: "There's a reason most interview prep feels incomplete: candidates prepare with their eyes and are tested with their mouths. You read articles, write bullet points, maybe review questions — then in the interview you have to speak fluently, in real time, with someone watching. Practicing out loud is the only way to close that gap.",
      },
      {
        type: "h2",
        text: "Speaking is a different skill than knowing",
      },
      {
        type: "p",
        text: "Answering a question in your head is free of all the hard parts: pacing, filler words, finding the right word mid-sentence, staying coherent for ninety seconds straight. Speaking out loud introduces all of them at once. That's why candidates who “knew the answer” freeze or ramble — knowing and saying are different performances, and only one of them was rehearsed.",
      },
      {
        type: "h2",
        text: "Practice lowers the stakes of the first attempt",
      },
      {
        type: "p",
        text: "Anxiety peaks at the start of an interview and fades as you get into a rhythm. Practice replicates that curve: the first answer of any practice session is usually your worst, and by the third or fourth you're in flow. Candidates who have felt that arc before are less rattled by it on the day.",
      },
      {
        type: "ul",
        items: [
          "Start sessions cold, the way a real interview starts — no warm-up read-through.",
          "Practice full answers, not bullet points. Bullet points let you skip the transitions that are actually hard.",
          "Recover out loud. When you fumble, finish the answer anyway. Training the recovery is as valuable as training the answer.",
        ],
      },
      {
        type: "h2",
        text: "Listen to what you can't hear while speaking",
      },
      {
        type: "p",
        text: "When you're speaking, you can't hear your own filler words, pacing, or where you trail off. Recording changes that. Most people are surprised by what they find: the sentence they never finished, the “um” density, the point they buried in the middle. Once you can hear a habit, you can fix it in a session or two.",
      },
      {
        type: "quote",
        text: "You don't rise to the level of your preparation — you fall to the level of your practice. If you've never practiced speaking, that's the level you'll perform at.",
      },
      {
        type: "h2",
        text: "Make the practice feel like the real thing",
      },
      {
        type: "p",
        text: "The closer practice gets to the real conditions — speaking to someone who responds, who asks follow-ups, who doesn't wait while you gather your thoughts — the more it transfers. Talking to a wall tests your memory; talking to a live interviewer tests your communication. Those are different muscles, and interviews use the second one.",
      },
      {
        type: "tip",
        text: "Start with a five-minute voice session answering the questions you're most afraid of. Realistic practice with an AI interviewer that asks follow-ups is the closest thing to the real conditions — without burning a real opportunity to learn it.",
      },
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((post) => post.slug === slug);
}

export function getFeaturedPost(): BlogPost | undefined {
  return posts.find((post) => post.featured) ?? posts[0];
}

export function getRelatedPosts(current: BlogPost, limit = 3): BlogPost[] {
  return posts.filter((post) => post.slug !== current.slug).slice(0, limit);
}

export function formatPostDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
