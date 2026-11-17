import HttpStatus from "http-status-codes";
import AuthModel from "../model/Auth/auth.js";
import { statusError } from "./records.js";

/**
 * Rejects an email or phone number already used by another live account, naming which one
 * ("Email already exists" / "Phone number already exists", the same wording as sign-up).
 * Pass `excludeId` when updating so the account's own details don't count as a duplicate.
 */
export const assertUniqueContact = async (
  contact: { email?: string; countryCode?: string; phoneNumber?: string },
  excludeId?: unknown,
) => {
  const base: Record<string, unknown> = { isDeleted: false };
  if (excludeId) base._id = { $ne: excludeId };
  if (contact.email && await AuthModel.exists({ ...base, email: contact.email })) {
    throw statusError("Email already exists", HttpStatus.CONFLICT);
  }
  if (contact.phoneNumber && await AuthModel.exists({ ...base, countryCode: contact.countryCode, phoneNumber: contact.phoneNumber })) {
    throw statusError("Phone number already exists", HttpStatus.CONFLICT);
  }
};
