// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Result, ResultError } from "@gnuxie/typescript-result";
import {
  DeadDocumentJSX,
  DocumentNode,
  describeCommand,
} from "@the-draupnir-project/interface-manager";
import { ActionException, Ok, isError } from "matrix-protection-suite";
import { SafeModeDraupnir } from "../DraupnirSafeMode";
import { SafeModeCause, SafeModeReason } from "../SafeModeCause";
import {
  DOCUMENTATION_URL,
  PACKAGE_JSON,
  SOFTWARE_VERSION,
} from "../../config";
import { SafeModeInterfaceAdaptor } from "./SafeModeAdaptor";
import { renderRecoveryOptions } from "../RecoveryOptions";
import { sendAndAnnotateWithRecoveryOptions } from "./RecoverCommand";
import {
  PersistentConfigStatus,
  StandardPersistentConfigEditor,
} from "../PersistentConfigEditor";
import { StandardPersistentConfigRenderer } from "../PersistentConfigRenderer";

export function safeModeHeader(): DocumentNode {
  return (
    <fragment>
      <span>⚠️ Draupnir is in safe mode (see status command) ⚠️</span>
      <br />
    </fragment>
  );
}

function renderSafeModeCauseError(error: ResultError): DocumentNode {
  if (error instanceof ActionException) {
    return (
      <fragment>
        <p>Draupnir is in safe mode because Draupnir failed to start.</p>
        <details>
          <summary>
            <code>{error.mostRelevantElaboration}</code>
          </summary>
          Details can be found by providing the reference{" "}
          <code>{error.uuid}</code>
          to an administrator.
          <pre>{error.toReadableString()}</pre>
        </details>
      </fragment>
    );
  } else {
    return (
      <fragment>
        Draupnir is in safe mode because Draupnir failed to start.
        <details>
          <summary>
            <code>{error.mostRelevantElaboration}</code>
          </summary>
          <pre>{error.toReadableString()}</pre>
        </details>
      </fragment>
    );
  }
}
function renderSafeModeCause(safeModeCause: SafeModeCause): DocumentNode {
  if (safeModeCause.reason === SafeModeReason.ByRequest) {
    return (
      <fragment>
        Draupnir is in safe mode by request of {safeModeCause.user}.
      </fragment>
    );
  } else {
    return renderSafeModeCauseError(safeModeCause.error);
  }
}

export interface SafeModeStatusInfo {
  safeModeCause: SafeModeCause;
  configStatus: PersistentConfigStatus[];
  documentationURL: string;
  version: string;
  repository: string;
}

export function renderSafeModeStatusInfo(
  info: SafeModeStatusInfo,
  { showDocumentationURL = true }: { showDocumentationURL?: boolean } = {}
): DocumentNode {
  return (
    <fragment>
      <h3>
        ⚠️ <b>Draupnir is in safe mode</b> ⚠️
      </h3>
      {renderSafeModeCause(info.safeModeCause)}
      {renderRecoveryOptions(info.safeModeCause)}
      <hr />
      {StandardPersistentConfigRenderer.renderAdaptorStatus(info.configStatus)}
      <b>Version: </b>
      <code>{info.version}</code>
      <br />
      <b>Repository: </b>
      <code>{info.repository}</code>
      <br />
      {showDocumentationURL ? (
        <fragment>
          <b>Documentation: </b>{" "}
          <a href={info.documentationURL}>{info.documentationURL}</a>
        </fragment>
      ) : (
        <fragment></fragment>
      )}
      <br />
      <br />
      To attempt to restart, use <code>!draupnir restart</code>.
    </fragment>
  );
}

export function safeModeStatusInfo(
  cause: SafeModeCause,
  configStatus: PersistentConfigStatus[]
): SafeModeStatusInfo {
  return {
    safeModeCause: cause,
    configStatus,
    documentationURL: DOCUMENTATION_URL,
    version: SOFTWARE_VERSION,
    repository: PACKAGE_JSON["repository"] ?? "Unknown",
  };
}

export const SafeModeStatusCommand = describeCommand({
  summary:
    "Display the status of safe mode, including the reason Draupnir started in safe mode.",
  parameters: [],
  async executor(
    safeModeDraupnir: SafeModeDraupnir
  ): Promise<Result<SafeModeStatusInfo>> {
    const editor = new StandardPersistentConfigEditor(safeModeDraupnir.client);
    const configStatus = await editor.supplementStatusWithSafeModeCause(
      safeModeDraupnir.cause
    );
    if (isError(configStatus)) {
      return configStatus;
    }
    return Ok(safeModeStatusInfo(safeModeDraupnir.cause, configStatus.ok));
  },
});

SafeModeInterfaceAdaptor.describeRenderer(SafeModeStatusCommand, {
  async arbritraryRenderer(context, eventContext, commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    }
    return await sendAndAnnotateWithRecoveryOptions(
      context,
      <root>{renderSafeModeStatusInfo(commandResult.ok)}</root>,
      { replyToEvent: eventContext.event }
    );
  },
});
