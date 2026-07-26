import type { PrismaClient } from "../../../prisma/generated/client.js";
import { UserProfileRepository } from "./repository.js";
import type { UserProfileUpdate } from "./schema.js";

export class UserProfileService {
  readonly repository: UserProfileRepository;
  constructor(database: PrismaClient) {
    this.repository = new UserProfileRepository(database);
  }
  get(userId: string) {
    return this.repository.get(userId);
  }
  update(userId: string, input: UserProfileUpdate) {
    return this.repository.update(userId, input);
  }
}
