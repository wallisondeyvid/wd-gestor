import { UserProfileRepository } from '#modules/gestor/app/repositories/UserProfileRepository.js';

export async function findUserByIdForProfile({ unitScope, userId }) {
  const repo = new UserProfileRepository({ unitScope });
  return repo.findByIdForProfile(userId);
}

export async function findUserByEmailForProfile({ unitScope, email }) {
  const repo = new UserProfileRepository({ unitScope });
  return repo.findByEmailForProfile(email);
}
