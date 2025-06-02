// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  describeCapabilityRenderer,
  DescriptionMeta,
  LiteralPolicyRule,
} from "matrix-protection-suite";
import { RendererMessageCollector } from "../../capabilities/RendererMessageCollector";
import { UserRestrictionCapability } from "./UserRestrictionCapability";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { isError, Result } from "@gnuxie/typescript-result";
import { AccountRestriction } from "matrix-protection-suite-for-matrix-bot-sdk";
import { renderFailedSingularConsequence } from "@the-draupnir-project/mps-interface-adaptor";
import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import { renderRuleClearText } from "../../commands/Rules";
import { Draupnir } from "../../Draupnir";

function renderRestrictionOptions(options: {
  rule: LiteralPolicyRule | null;
  sender: StringUserID;
}): DocumentNode {
  return (
    <ul>
      {options.rule ? (
        <li>rule: {renderRuleClearText(options.rule)}</li>
      ) : (
        <fragment></fragment>
      )}
      <li>
        sender: <code>{options.sender}</code>
      </li>
    </ul>
  );
}

function renderUserRestriction(
  userID: StringUserID,
  restriction: AccountRestriction,
  options: { rule: LiteralPolicyRule | null; sender: StringUserID }
): DocumentNode {
  return (
    <details>
      <summary>
        The resident user account <code>{userID}</code> has been restricted
        (restriction type: <code>{restriction}</code>)
      </summary>
      {renderRestrictionOptions(options)}
    </details>
  );
}

class StandardUserRestrictionCapabilityRenderer
  implements UserRestrictionCapability
{
  public readonly requiredEventPermissions =
    this.capability.requiredEventPermissions;
  public readonly requiredPermissions = this.capability.requiredPermissions;
  public readonly requiredStatePermissions =
    this.capability.requiredStatePermissions;
  public readonly isSimulated = Boolean(this.capability.isSimulated);
  constructor(
    private readonly description: DescriptionMeta,
    private readonly messageCollector: RendererMessageCollector,
    private readonly capability: UserRestrictionCapability
  ) {
    // nothing to do.
  }
  public async isUserRestricted(
    userID: StringUserID
  ): Promise<Result<boolean>> {
    // nothing to render here since this doesn't do anything.
    return await this.capability.isUserRestricted(userID);
  }
  public async restrictUser(
    userID: StringUserID,
    options: { rule: LiteralPolicyRule | null; sender: StringUserID }
  ): Promise<Result<AccountRestriction>> {
    const capabilityResult = await this.capability.restrictUser(
      userID,
      options
    );
    if (isError(capabilityResult)) {
      this.messageCollector.addOneliner(
        this.description,
        this.capability,
        renderFailedSingularConsequence(
          this.description,
          <span>
            Failed to restrict the user <code>{userID}</code>
          </span>,
          capabilityResult.error
        )
      );
      return capabilityResult;
    }
    this.messageCollector.addOneliner(
      this.description,
      this.capability,
      renderUserRestriction(userID, capabilityResult.ok, options)
    );
    return capabilityResult;
  }
  public async unrestrictUser(
    userID: StringUserID,
    sender: StringUserID
  ): Promise<Result<void>> {
    const capabilityResult = await this.capability.unrestrictUser(
      userID,
      sender
    );
    if (isError(capabilityResult)) {
      this.messageCollector.addOneliner(
        this.description,
        this.capability,
        renderFailedSingularConsequence(
          this.description,
          <span>
            Failed to unrestrict the user <code>{userID}</code>
          </span>,
          capabilityResult.error
        )
      );
      return capabilityResult;
    }
    this.messageCollector.addOneliner(
      this.description,
      this.capability,
      <span>
        The user <code>{userID}</code> has been unrestricted.
      </span>
    );
    return capabilityResult;
  }
}

describeCapabilityRenderer<UserRestrictionCapability, Draupnir>({
  name: StandardUserRestrictionCapabilityRenderer.name,
  description:
    "Renders capabilities supporting the UserRestrictionCapability interface",
  interface: "UserRestrictionCapability",
  isDefaultForInterface: true,
  factory(protectionDescription, draupnir, capability) {
    return new StandardUserRestrictionCapabilityRenderer(
      protectionDescription,
      draupnir.capabilityMessageRenderer,
      capability
    );
  },
});
