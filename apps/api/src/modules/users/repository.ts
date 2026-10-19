import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { UserProfileUpdate } from "./schema.js";

export class UserProfileRepository {
  constructor(private readonly database: PrismaClient) {}
  async get(userId: string) {
    if (this.database.userProfile?.findUnique) {
      const existing = await this.database.userProfile.findUnique({ where: { userId } });
      if (existing) {
        if (!existing.preferredName && this.database.user?.findUnique) {
          const user = await this.database.user.findUnique({
            where: { id: userId },
            select: { name: true },
          });
          const defaultName = user?.name?.trim() || null;
          if (defaultName && this.database.userProfile.update) {
            return this.database.userProfile.update({
              where: { userId },
              data: { preferredName: defaultName },
            });
          }
        }
        return existing;
      }

      let defaultName: string | null = null;
      if (this.database.user?.findUnique) {
        const user = await this.database.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        defaultName = user?.name?.trim() || null;
      }
      if (this.database.userProfile.create) {
        return this.database.userProfile.create({
          data: {
            userId,
            preferredName: defaultName,
          },
        });
      }
    }

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
