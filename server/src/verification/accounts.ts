export type PublicAccountRole = "client" | "company" | "professional";

export function initialVerificationStatus(role: PublicAccountRole): "verified" | "pending" {
  return "verified";
}
