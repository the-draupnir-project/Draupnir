// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import expect from "expect";
import { describe, it } from "mocha";
import type { IStorageProvider } from "@vector-im/matrix-bot-sdk";
import type { IConfig } from "../../src/config";
import { getZeroTouchDeploymentAccessToken } from "../../src/zeroTouchDeploymentSelfLogin";

describe("zeroTouchDeploymentSelfLogin", function () {
  it("boots a client using the configured zero-touch credentials", async function () {
    const calls: Array<[string, string, string]> = [];
    const config = {
      homeserverUrl: "https://homeserver.example",
      zeroTouchDeploymentSelfLogin: {
        enabled: true,
        username: "bot-user",
        password: "bot-password",
      },
    } satisfies Pick<IConfig, "homeserverUrl" | "zeroTouchDeploymentSelfLogin">;
    const storage: IStorageProvider = {
      setSyncToken() {},
      getSyncToken() {
        return null;
      },
      setFilter() {},
      getFilter() {
        return null as never;
      },
      readValue() {
        return null;
      },
      storeValue() {},
    };

    const result = await getZeroTouchDeploymentAccessToken(
      config,
      storage,
      async (homeserverUrl, username, password) => {
        calls.push([homeserverUrl, username, password]);
        return "secret-token";
      }
    );

    expect(calls).toEqual([
      ["https://homeserver.example", "bot-user", "bot-password"],
    ]);
    expect(result).toEqual("secret-token");
  });
});
