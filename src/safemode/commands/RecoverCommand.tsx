// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok, Result, ResultError, isError } from "@gnuxie/typescript-result";
import {
  DeadDocumentJSX,
  StringPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { SafeModeDraupnir } from "../DraupnirSafeMode";
import { SafeModeReason } from "../SafeModeCause";
import {
  ConfigRecoverableError,
  ConfigRecoveryOption,
} from "matrix-protection-suite";
import { SafeModeInterfaceAdaptor } from "./SafeModeAdaptor";

export const SafeModeRecoverCommand = describeCommand({
  summary: "Select an availale recovery option to enact.",
  parameters: tuple({
    name: "recovery option",
    acceptor: StringPresentationType,
    description: "The recovery option to enact, e.g. 1.",
  }),
  async executor(
    safeModeDraupnir: SafeModeDraupnir,
    _info,
    _keywords,
    _rest,
    optionDesignator
  ): Promise<Result<ConfigRecoveryOption>> {
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
    const options =
      safeModeDraupnir.cause.reason === SafeModeReason.ByRequest
        ? []
        : safeModeDraupnir.cause.error instanceof ConfigRecoverableError
          ? safeModeDraupnir.cause.error.recoveryOptions
          : [];
    const selectedOption = options[optionNumber.ok - 1];
    if (selectedOption === undefined) {
      return ResultError.Result(
        `No recovery option with the number ${optionNumber.ok} exists.`
      );
    }
    const recoveryResult = await selectedOption.recover();
    if (isError(recoveryResult)) {
      return recoveryResult;
    }
    return Ok(selectedOption);
  },
});

SafeModeInterfaceAdaptor.describeRenderer(SafeModeRecoverCommand, {
  JSXRenderer(result) {
    if (isError(result)) {
      return Ok(undefined);
    }
    return Ok(
      <root>
        <fragment>
          The recovery following recovery option has sucessfully been applied:
          <br />
          {result.ok.description}
          <br />
          You may now restart Draupnir with <code>!draupnir restart</code>
        </fragment>
      </root>
    );
  },
});
