// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { MatrixAuth } from "@vector-im/matrix-bot-sdk";
import type { IStorageProvider } from "@vector-im/matrix-bot-sdk";
import type { IConfig } from "./config";

const ZERO_TOUCH_ACCESS_TOKEN_KEY = "zero_touch_access_token";

type ZeroTouchLogin = (
  homeserverUrl: string,
  username: string,
  password: string
) => Promise<string>;

const defaultZeroTouchLogin: ZeroTouchLogin = async (
  homeserverUrl,
  username,
  password
) => {
  const auth = new MatrixAuth(homeserverUrl);
  const client = await auth.passwordLogin(username, password);
  return client.accessToken;
};

export async function getZeroTouchDeploymentAccessToken(
  config: Pick<IConfig, "homeserverUrl" | "zeroTouchDeploymentSelfLogin">,
  storage: IStorageProvider,
  zeroTouchLogin: ZeroTouchLogin = defaultZeroTouchLogin
): Promise<string> {
  const storedToken = await Promise.resolve(
    storage.readValue(ZERO_TOUCH_ACCESS_TOKEN_KEY)
  );
  if (storedToken) {
    return storedToken;
  }

  const accessToken = await zeroTouchLogin(
    config.homeserverUrl,
    config.zeroTouchDeploymentSelfLogin.username,
    config.zeroTouchDeploymentSelfLogin.password
  );
  await Promise.resolve(
    storage.storeValue(ZERO_TOUCH_ACCESS_TOKEN_KEY, accessToken)
  );
  return accessToken;
}
