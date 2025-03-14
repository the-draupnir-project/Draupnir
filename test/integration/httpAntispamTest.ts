// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import expect from "expect";
import { DraupnirTestContext } from "./mjolnirSetupUtils";
import {
  ActionException,
  isOk,
  MatrixException,
} from "matrix-protection-suite";
import { MatrixError } from "matrix-bot-sdk";

describe("Test for http antispam callbacks", function () {
  it("We can process check_event_for_spam", async function (
    this: DraupnirTestContext
  ) {
    const draupnir = this.draupnir;
    if (draupnir === undefined) {
      throw new TypeError(`setup code is wrong`);
    }
    const synapseHTTPAntispam = this.toggle?.synapseHTTPAntispam;
    if (synapseHTTPAntispam === undefined) {
      throw new TypeError("Setup code is wrong");
    }
    const promise = new Promise((resolve) => {
      synapseHTTPAntispam.checkEventForSpamHandles.registerNonBlockingHandle(
        (details) => {
          if (details.event.sender === draupnir.clientUserID) {
            resolve(undefined);
          }
        }
      );
    });
    (
      await draupnir.clientPlatform
        .toRoomMessageSender()
        .sendMessage(draupnir.managementRoomID, {
          body: "hello",
          msgtype: "m.text",
        })
    ).expect("should be able to send the message just fine");
    await promise;
    // now try blocking
    synapseHTTPAntispam.checkEventForSpamHandles.registerBlockingHandle(() => {
      return Promise.resolve({ errcode: "M_FORBIDDEN", error: "no." });
    });
    const sendResult = await draupnir.clientPlatform
      .toRoomMessageSender()
      .sendMessage(draupnir.managementRoomID, {
        body: "hello",
        msgtype: "m.text",
      });
    if (isOk(sendResult)) {
      throw new TypeError("We expect the result to be blocked");
    }
    if (!(sendResult.error instanceof ActionException)) {
      throw new TypeError(
        "We're trying to destructure this to get the MatrixError"
      );
    }
    // I'm pretty sure there are different versions of this being used in the code base
    // so instanceof fails :/ sucks balls mare
    // https://github.com/the-draupnir-project/Draupnir/issues/760
    // https://github.com/the-draupnir-project/Draupnir/issues/759
    if (sendResult.error instanceof MatrixException) {
      expect(sendResult.error.matrixErrorMessage).toBe("no.");
      expect(sendResult.error.matrixErrorCode).toBe("M_FORBIDDEN");
    } else {
      const matrixError = sendResult.error.exception as MatrixError;
      expect(matrixError.error).toBe("no.");
      expect(matrixError.errcode).toBe("M_FORBIDDEN");
    }
  } as unknown as Mocha.AsyncFunc);
});
