import { isError, Ok, Result } from "@gnuxie/typescript-result";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { LiteralPolicyRule, Logger } from "matrix-protection-suite";
import { SynapseAdminClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { SuspensionType, UserAuditLog } from "./UserAuditLog";

const log = new Logger("deactivateUser");

export async function deactivateUser(
  userID: StringUserID,
  synapseAdminClient: SynapseAdminClient,
  userAuditLog: UserAuditLog,
  options: {
    rule: LiteralPolicyRule | null;
    sender: StringUserID;
  }
): Promise<Result<void>> {
  const userDetails = await synapseAdminClient.getUserDetails(userID);
  if (isError(userDetails)) {
    log.error("Unable to query user details", userID);
    return userDetails;
  }
  if (userDetails.ok?.deactivated) {
    log.debug("User is already deactivated");
    return Ok(undefined);
  }
  const deactivationResult = await synapseAdminClient.deactivateUser(userID, {
    erase: true,
  });
  if (isError(deactivationResult)) {
    return deactivationResult;
  }
  const auditResult = await userAuditLog.suspendUser(
    userID,
    SuspensionType.Deactivated,
    options
  );
  if (isError(auditResult)) {
    log.error("Unable to audit deactivation", userID);
  }
  return deactivationResult;
}
