// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  HandleMissingProtectionPermissions,
  ProtectionPermissionsChange,
  RoomMessageSender,
  Task,
} from "matrix-protection-suite";
import {
  renderRoomPill,
  sendMatrixEventsFromDeadDocument,
} from "@the-draupnir-project/mps-interface-adaptor";
import {
  StringRoomID,
  MatrixRoomReference,
} from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import { Result } from "@gnuxie/typescript-result";

function renderPermissions(
  title: DocumentNode,
  permissions: string[]
): DocumentNode {
  return permissions.length === 0 ? (
    <fragment></fragment>
  ) : (
    <fragment>
      {title}
      <ul>
        {permissions.map((permission) => (
          <li>
            <code>{permission}</code>
          </li>
        ))}
      </ul>
    </fragment>
  );
}

function missingPermissionsTotal(change: ProtectionPermissionsChange): number {
  return (
    change.permissionsChange.missingEventPermissions.length +
    change.permissionsChange.missingPermissions.length +
    change.permissionsChange.missingStatePermissions.length
  );
}

function renderMissingProtectionPermissions(
  protectionPermissions: ProtectionPermissionsChange
): DocumentNode {
  return (
    <details>
      <summary>
        The <code>{protectionPermissions.protection.description.name}</code> is
        missing the following permissions (
        {missingPermissionsTotal(protectionPermissions)}):
      </summary>
      {renderPermissions(
        <fragment>Missing permissions:</fragment>,
        protectionPermissions.permissionsChange.missingPermissions
      )}
      {renderPermissions(
        <fragment>Missing state permissions:</fragment>,
        protectionPermissions.permissionsChange.missingStatePermissions
      )}
      {renderPermissions(
        <fragment>Missing event permissions:</fragment>,
        protectionPermissions.permissionsChange.missingEventPermissions
      )}
    </details>
  );
}

function renderMissingProtectionsPermissions(
  roomID: StringRoomID,
  protectionPermissions: ProtectionPermissionsChange[]
): DocumentNode {
  return (
    <fragment>
      There are protections with missing permissions within the room{" "}
      {renderRoomPill(MatrixRoomReference.fromRoomID(roomID, []))}.
      <ul>
        {protectionPermissions.map((details) => (
          <li>{renderMissingProtectionPermissions(details)}</li>
        ))}
      </ul>
    </fragment>
  );
}

export function makeHandleMissingProtectionPermissions(
  roomMessageSender: RoomMessageSender,
  managementRoomID: StringRoomID
): HandleMissingProtectionPermissions {
  return function (roomID, protectionPermissions) {
    void Task(
      sendMatrixEventsFromDeadDocument(
        roomMessageSender,
        managementRoomID,
        <root>
          {renderMissingProtectionsPermissions(roomID, protectionPermissions)}
        </root>,
        {}
      ) as Promise<Result<undefined>>
    );
  };
}
