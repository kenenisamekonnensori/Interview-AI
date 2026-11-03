/**
 * Fixed interviewer copy for the silence ladder. These lines are deterministic
 * server templates, never generated content: a nudge must be instant and must
 * never invent interview material, and the closing line must be honest about
 * why the interview is ending.
 */

const nudgeLines: Record<string, { 1: string; 2: string }> = {
  en: {
    1: "Take your time — I'm here whenever you're ready.",
    2: "No rush at all. Would you like to pause here, or shall we move to the next question?",
  },
  es: {
    1: "Tómese su tiempo — estoy aquí cuando quiera continuar.",
    2: "Sin prisa. ¿Quiere hacer una pausa aquí o pasamos a la siguiente pregunta?",
  },
  de: {
    1: "Lassen Sie sich Zeit — ich bin hier, sobald Sie bereit sind.",
    2: "Kein Stress. Möchten Sie hier pausieren oder zur nächsten Frage übergehen?",
  },
  fr: {
    1: "Prenez votre temps — je suis là quand vous êtes prêt.",
    2: "Aucune hâte. Souhaitez-vous marquer une pause ou passer à la question suivante ?",
  },
  nl: {
    1: "Neem uw tijd — ik ben er zodra u er klaar voor bent.",
    2: "Geen haast. Wilt u hier pauzeren of naar de volgende vraag gaan?",
  },
};

const closingLines: Record<string, string> = {
  en: "It seems now isn't a good time to continue, so I'll close the interview here. Everything you shared is saved, and your feedback will be ready when you are.",
  es: "Parece que ahora no es un buen momento para continuar, así que cerraré la entrevista aquí. Todo lo que compartió queda guardado y su evaluación estará lista cuando quiera.",
  de: "Wie es aussieht, passt es gerade nicht, also beende ich das Interview hier. Alles, was Sie geteilt haben, ist gespeichert, und Ihre Auswertung ist bereit, wenn Sie so weit sind.",
  fr: "Il semble que ce ne soit pas le bon moment, je clos donc l'entretien ici. Tout ce que vous avez partagé est enregistré et votre bilan sera prêt quand vous le souhaiterez.",
  nl: "Het lijkt erop dat dit geen goed moment is, dus ik sluit het interview hier af. Alles wat u heeft gedeeld is opgeslagen en uw feedback staat klaar wanneer u wilt.",
};

export function silenceNudgeText(language: string, strike: number): string {
  const texts = nudgeLines[language] ?? nudgeLines.en!;
  return strike >= 2 ? texts[2] : texts[1];
}

export function silenceClosingText(language: string): string {
  return closingLines[language] ?? closingLines.en!;
}
