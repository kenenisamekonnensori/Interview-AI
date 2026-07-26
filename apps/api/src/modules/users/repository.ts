import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { UserProfileUpdate } from "./schema.js";

export class UserProfileRepository {
  constructor(private readonly database: PrismaClient) {}
  get(userId: string) {
    return this.database.userProfile.upsert({ where: { userId }, create: { userId }, update: {} });
  }
  update(userId: string, input: UserProfileUpdate) {
    const data = profileData(input);
    return this.database.userProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}

function profileData(input: UserProfileUpdate) {
  return {
    ...(input.preferredName !== undefined ? { preferredName: input.preferredName } : {}),
    ...(input.profession !== undefined ? { profession: input.profession } : {}),
    ...(input.targetRole !== undefined ? { targetRole: input.targetRole } : {}),
    ...(input.seniority !== undefined ? { seniority: input.seniority } : {}),
    ...(input.yearsOfExperience !== undefined
      ? { yearsOfExperience: input.yearsOfExperience }
      : {}),
    ...(input.preferredLanguage !== undefined
      ? { preferredLanguage: input.preferredLanguage }
      : {}),
    ...(input.defaultInterviewDuration !== undefined
      ? { defaultInterviewDuration: input.defaultInterviewDuration }
      : {}),
    ...(input.defaultDifficulty !== undefined
      ? { defaultDifficulty: input.defaultDifficulty }
      : {}),
    ...(input.voicePreference !== undefined ? { voicePreference: input.voicePreference } : {}),
    ...(input.accessibilityPreferences !== undefined
      ? { accessibilityPreferences: input.accessibilityPreferences }
      : {}),
  };
}
