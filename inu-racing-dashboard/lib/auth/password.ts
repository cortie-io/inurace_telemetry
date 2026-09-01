import { compare } from "bcrypt-ts";

// Dummy hash of a password nobody will ever type, compared against on unknown usernames so a
// login attempt for a nonexistent account takes roughly the same time as a wrong-password one
// (timing-attack mitigation) — same precedent as network-tutor-web's auth.
export const DUMMY_PASSWORD_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7C4/hM2XdG3iGGfE.pJcSGVKrx2Ubx6";

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return compare(plain, hash);
}
