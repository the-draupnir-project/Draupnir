// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok, Result, ResultError, isError } from "@gnuxie/typescript-result";
import {
  DeadDocumentJSX,
  DocumentNode,
  StringPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { SafeModeDraupnir } from "../DraupnirSafeMode";
import { SafeModeReason } from "../SafeModeCause";
import {
  ConfigRecoverableError,
  ConfigRecoveryOption,
  RoomEvent,
} from "matrix-protection-suite";
import { SafeModeInterfaceAdaptor } from "./SafeModeAdaptor";
import {
  PersistentConfigStatus,
  StandardPersistentConfigEditor,
} from "../PersistentConfigEditor";
import { StandardPersistentConfigRenderer } from "../PersistentConfigRenderer";
import {
  ARGUMENT_PROMPT_LISTENER,
  MatrixReactionHandler,
  sendMatrixEventsFromDeadDocument,
} from "@the-draupnir-project/mps-interface-adaptor";

export type SafeModeRecoverEffectInfo = {
  readonly configStatus: PersistentConfigStatus[];
  readonly recoveryOption: ConfigRecoveryOption;
};

export const SafeModeRecoverCommand = describeCommand({
  summary: "Select an availale recovery option to enact.",
  parameters: tuple({
    name: "recovery option",
    acceptor: StringPresentationType,
    description: "The recovery option to enact, e.g. 1.",
  }),
  keywords: {
    keywordDescriptions: {
      "no-confirm": {
        description: "Do not prompt for confirmation.",
        isFlag: true,
      },
    },
  },
  async executor(
    safeModeDraupnir: SafeModeDraupnir,
    _info,
    keywords,
    _rest,
    optionDesignator
  ): Promise<Result<SafeModeRecoverEffectInfo>> {
    const optionNumber = (() => {
      try {
        return Ok(parseInt(optionDesignator));
      } catch {
        return ResultError.Result(
          `Unable to parse the recovery option from ${optionDesignator}`
        );
      }
    })();
    if (isError(optionNumber)) {
      return optionNumber;
    }
    const options = getRecoveryOptions(safeModeDraupnir);
    const selectedOption = options[optionNumber.ok - 1];
    if (selectedOption === undefined) {
      return ResultError.Result(
        `No recovery option with the number ${optionNumber.ok} exists.`
      );
    }
    if (!keywords.getKeywordValue<boolean>("no-confirm", false)) {
      return Ok({
        recoveryOption: selectedOption,
        configStatus: [],
      });
    }
    const recoveryResult = await selectedOption.recover();
    if (isError(recoveryResult)) {
      return recoveryResult;
    }
    // Now we're going to get the config again to show the user the outcome of recovery.
    const editor = new StandardPersistentConfigEditor(safeModeDraupnir.client);
    const configStatus = await editor.requestConfigStatus();
    if (isError(configStatus)) {
      return configStatus.elaborate(
        "The recovery option has been applied successfully. There was an error when trying to fetch the status of the persistent config."
      );
    }
    return Ok({
      configStatus: configStatus.ok,
      recoveryOption: selectedOption,
    });
  },
});

SafeModeInterfaceAdaptor.describeRenderer(SafeModeRecoverCommand, {
  confirmationPromptJSXRenderer(result) {
    if (isError(result)) {
      return Ok(undefined);
    }
    const { recoveryOption } = result.ok;
    return Ok(
      <root>
        <h4>You are about to use the following recovery option:</h4>
        <p>{recoveryOption.description}</p>
        <p>Please confirm that you wish to proceed.</p>
      </root>
    );
  },
  JSXRenderer(result) {
    if (isError(result)) {
      return Ok(undefined);
    }
    const { configStatus, recoveryOption } = result.ok;
    return Ok(
      <root>
        <fragment>
          The following recovery option has been applied successfully:
          <br />
          {recoveryOption.description}
          <br />
          {StandardPersistentConfigRenderer.renderAdaptorStatus(configStatus)}
          <br />
          You may now restart Draupnir with <code>!draupnir restart</code>
        </fragment>
      </root>
    );
  },
});

export function getRecoveryOptions(
  safeModeDraupnir: SafeModeDraupnir
): ConfigRecoveryOption[] {
  return safeModeDraupnir.cause.reason === SafeModeReason.ByRequest
    ? []
    : safeModeDraupnir.cause.error instanceof ConfigRecoverableError
      ? safeModeDraupnir.cause.error.recoveryOptions
      : [];
}

export async function sendAndAnnotateWithRecoveryOptions(
  safeModeDraupnir: SafeModeDraupnir,
  document: DocumentNode,
  { replyToEvent }: { replyToEvent?: RoomEvent }
): Promise<Result<void>> {
  const reactionMap = MatrixReactionHandler.createItemizedReactionMap(
    getRecoveryOptions(safeModeDraupnir).map((_option, index) =>
      String(index + 1)
    )
  );
  const sendResult = await sendMatrixEventsFromDeadDocument(
    safeModeDraupnir.clientPlatform.toRoomMessageSender(),
    safeModeDraupnir.commandRoomID,
    document,
    {
      replyToEvent,
      additionalContent: safeModeDraupnir.reactionHandler.createAnnotation(
        ARGUMENT_PROMPT_LISTENER,
        reactionMap,
        {
          command_designator: ["draupnir", "recover"],
          read_items: [],
        }
      ),
    }
  );
  if (isError(sendResult)) {
    return sendResult;
  }
  if (sendResult.ok[0] === undefined) {
    throw new TypeError(`Something is really wrong with the code`);
  }
  await safeModeDraupnir.reactionHandler.addReactionsToEvent(
    safeModeDraupnir.commandRoomID,
    sendResult.ok[0],
    reactionMap
  );
  return Ok(undefined);
}
