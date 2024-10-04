// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2021 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { HmacSHA1 } from "crypto-js";
import {
  getRequestFn,
  LogService,
  MatrixClient,
  MemoryStorageProvider,
  PantalaimonClient,
} from "matrix-bot-sdk";
import "../../src/utils"; // we need this for the patches to matrix-bot-sdk's `getRequestFn`.
import {
  NoticeMessageContent,
  RoomMessage,
  Value,
} from "matrix-protection-suite";

const REGISTRATION_ATTEMPTS = 10;
const REGISTRATION_RETRY_BASE_DELAY_MS = 100;

/**
 * Register a user using the synapse admin api that requires the use of a registration secret rather than an admin user.
 * This should only be used by test code and should not be included from any file in the source directory
 * either by explicit imports or copy pasting.
 *
 * @param username The username to give the user.
 * @param displayname The displayname to give the user.
 * @param password The password to use.
 * @param admin True to make the user an admin, false otherwise.
 * @returns The response from synapse.
 */
export async function registerUser(
  homeserver: string,
  username: string,
  displayname: string,
  password: string,
  admin: boolean
): Promise<void> {
  const registerUrl = `${homeserver}/_synapse/admin/v1/register`;
  const nonce: string = await new Promise((resolve, reject) => {
    getRequestFn()(
      { uri: registerUrl, method: "GET", timeout: 60000 },
      (error: unknown, _response: unknown, resBody: unknown) => {
        if (error) {
          if (error instanceof Error) {
            reject(error);
          } else {
            throw new TypeError(`Something is throwing absoloute garbage`);
          }
        } else if (
          typeof resBody === "object" &&
          resBody !== null &&
          "nonce" in resBody &&
          typeof resBody.nonce === "string"
        ) {
          resolve(resBody.nonce);
        } else {
          reject(
            new TypeError(
              `Don't know what to do with response body ${JSON.stringify(resBody)}`
            )
          );
        }
      }
    );
  });
  const mac = HmacSHA1(
    `${nonce}\0${username}\0${password}\0${admin ? "admin" : "notadmin"}`,
    "REGISTRATION_SHARED_SECRET"
  );
  for (let i = 1; i <= REGISTRATION_ATTEMPTS; ++i) {
    try {
      const params = {
        uri: registerUrl,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce,
          username,
          displayname,
          password,
          admin,
          mac: mac.toString(),
        }),
        timeout: 60000,
      };
      await new Promise((resolve, reject) => {
        getRequestFn()(params, (error: unknown) => {
          error !== undefined
            ? error instanceof Error
              ? reject(error)
              : resolve(new TypeError(`something is throwing garbage`))
            : resolve(undefined);
        });
      });
      return;
    } catch (ex) {
      // In case of timeout or throttling, backoff and retry.
      if (
        ex?.code === "ESOCKETTIMEDOUT" ||
        ex?.code === "ETIMEDOUT" ||
        ex?.body?.errcode === "M_LIMIT_EXCEEDED"
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, REGISTRATION_RETRY_BASE_DELAY_MS * i * i)
        );
        continue;
      }
      throw ex;
    }
  }
  throw new Error(
    `Retried registration ${REGISTRATION_ATTEMPTS} times, is Draupnir or Synapse misconfigured?`
  );
}

export type RegistrationOptions = {
  /**
   * If specified and true, make the user an admin.
   */
  isAdmin?: boolean;
  /**
   * If `exact`, use the account with this exact name, attempting to reuse
   * an existing account if possible.
   *
   * If `contains` create a new account with a name that contains this
   * specific string.
   */
  name: { exact: string } | { contains: string };
  /**
   * If specified and true, throttle this user.
   */
  isThrottled?: boolean;
};

/**
 * Register a new test user.
 *
 * @returns A string that is both the username and password of a new user.
 */
async function registerNewTestUser(
  homeserver: string,
  options: RegistrationOptions
) {
  while (true) {
    let username;
    if ("exact" in options.name) {
      username = options.name.exact;
    } else {
      username = `mjolnir-test-user-${options.name.contains}${Math.floor(Math.random() * 100000)}`;
    }
    try {
      await registerUser(
        homeserver,
        username,
        username,
        username,
        Boolean(options.isAdmin)
      );
      return username;
    } catch (e) {
      if (e?.body?.errcode === "M_USER_IN_USE") {
        if ("exact" in options.name) {
          LogService.debug(
            "test/clientHelper",
            `${username} already registered, reusing`
          );
          return username;
        } else {
          LogService.debug(
            "test/clientHelper",
            `${username} already registered, trying another`
          );
        }
      } else {
        console.error(`failed to register user ${e}`);
        throw e;
      }
    }
  }
}

/**
 * Registers a test user and returns a `MatrixClient` logged in and ready to use.
 *
 * @returns A new `MatrixClient` session for a unique test user.
 */
export async function newTestUser(
  homeserver: string,
  options: RegistrationOptions
): Promise<MatrixClient> {
  const username = await registerNewTestUser(homeserver, options);
  const pantalaimon = new PantalaimonClient(
    homeserver,
    new MemoryStorageProvider()
  );
  const client = await pantalaimon.createClientWithCredentials(
    username,
    username
  );
  if (!options.isThrottled) {
    const userId = await client.getUserId();
    await overrideRatelimitForUser(homeserver, userId);
  }
  return client;
}

let _globalAdminUser: MatrixClient | undefined;

/**
 * Get a client that can perform synapse admin API actions.
 * @returns A client logged in with an admin user.
 */
async function getGlobalAdminUser(homeserver: string): Promise<MatrixClient> {
  // Initialize global admin user if needed.
  if (_globalAdminUser === undefined) {
    const USERNAME = "mjolnir-test-internal-admin-user";
    try {
      await registerUser(homeserver, USERNAME, USERNAME, USERNAME, true);
    } catch (e) {
      if (e?.body?.errcode === "M_USER_IN_USE") {
        // Then we've already registered the user in a previous run and that is ok.
      } else {
        throw e;
      }
    }
    _globalAdminUser = await new PantalaimonClient(
      homeserver,
      new MemoryStorageProvider()
    ).createClientWithCredentials(USERNAME, USERNAME);
  }
  return _globalAdminUser;
}

/**
 * Disable ratelimiting for this user in Synapse.
 * @param userId The user to disable ratelimiting for, has to include both the server part and local part.
 */
export async function overrideRatelimitForUser(
  homeserver: string,
  userId: string
) {
  await (
    await getGlobalAdminUser(homeserver)
  ).doRequest(
    "POST",
    `/_synapse/admin/v1/users/${userId}/override_ratelimit`,
    null,
    {
      messages_per_second: 0,
      burst_count: 0,
    }
  );
}

/**
 * Put back the default ratelimiting for this user in Synapse.
 * @param userId The user to use default ratelimiting for, has to include both the server part and local part.
 */
export async function resetRatelimitForUser(
  homeserver: string,
  userId: string
) {
  await (
    await getGlobalAdminUser(homeserver)
  ).doRequest(
    "DELETE",
    `/_synapse/admin/v1/users/${userId}/override_ratelimit`,
    null
  );
}

/**
 * Utility to create an event listener for m.notice msgtype m.room.messages.
 * @param targetRoomdId The roomId to listen into.
 * @param cb The callback when a m.notice event is found in targetRoomId.
 * @returns The callback to pass to `MatrixClient.on('room.message', cb)`
 */
export function noticeListener(
  targetRoomdId: string,
  cb: (
    event: Omit<RoomMessage, "content"> & { content: NoticeMessageContent }
  ) => void
) {
  return (roomId: string, event: unknown) => {
    if (roomId !== targetRoomdId) {
      return;
    }
    if (
      Value.Check(RoomMessage, event) &&
      Value.Check(NoticeMessageContent, event.content)
    ) {
      cb(
        event as Omit<RoomMessage, "content"> & {
          content: NoticeMessageContent;
        }
      );
      return;
    }
  };
}
