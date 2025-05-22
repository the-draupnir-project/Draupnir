// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  LogLevel,
  LogService,
  MatrixGlob,
  getRequestFn,
  setRequestFn,
  MatrixError,
} from "matrix-bot-sdk";
import { ClientRequest, IncomingMessage } from "http";
import * as Sentry from "@sentry/node";
import ManagementRoomOutput from "./managementroom/ManagementRoomOutput";
import { IConfig } from "./config";
import { Gauge } from "prom-client";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { Logger, RoomEvent } from "matrix-protection-suite";

const log = new Logger("utils");

export function htmlEscape(input: string): string {
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  return input.replace(/[<&"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
}

export function setToArray<T>(set: Set<T>): T[] {
  const arr: T[] = [];
  for (const v of set) {
    arr.push(v);
  }
  return arr;
}

/**
 * This increments a prometheus gauge. Used in the Appservice MjolnirManager.
 *
 * The ts-ignore is mandatory since we access a private method due to lack of a public one.
 *
 * See https://github.com/Gnuxie/Draupnir/pull/70#discussion_r1299188922
 *
 * @param gauge The Gauge to be modified
 * @param status The status value that should be modified
 * @param uuid The UUID of the instance. (Usually the localPart)
 */
export function incrementGaugeValue(
  gauge: Gauge<"status" | "uuid">,
  status: "offline" | "disabled" | "online",
  uuid: string
) {
  // @ts-expect-error we access a private method due to lack of a public one.
  if (!gauge._getValue({ status: status, uuid: uuid })) {
    gauge.inc({ status: status, uuid: uuid });
  }
}

/**
 * This decrements a prometheus gauge. Used in the Appservice MjolnirManager.
 *
 * The ts-ignore is mandatory since we access a private method due to lack of a public one.
 *
 * See https://github.com/Gnuxie/Draupnir/pull/70#discussion_r1299188922
 *
 * @param gauge The Gauge to be modified
 * @param status The status value that should be modified
 * @param uuid The UUID of the instance. (Usually the localPart)
 */
export function decrementGaugeValue(
  gauge: Gauge<"status" | "uuid">,
  status: "offline" | "disabled" | "online",
  uuid: string
) {
  // @ts-expect-error we access a private method due to lack of a public one.
  if (gauge._getValue({ status: status, uuid: uuid })) {
    gauge.dec({ status: status, uuid: uuid });
  }
}

/**
 * Redact a user's messages in a set of rooms.
 * See `getMessagesByUserIn`.
 *
 * @param client Client to redact the messages with.
 * @param managementRoom Management room to log messages back to.
 * @param userIdOrGlob A mxid or a glob which is applied to the whole sender field of events in the room, which will be redacted if they match.
 * See `MatrixGlob` in matrix-bot-sdk.
 * @param targetRoomIds Rooms to redact the messages from.
 * @param limit The number of messages to redact from most recent first. If the limit is reached then no further messages will be redacted.
 * @param noop Whether to operate in noop mode.
 */
export async function redactUserMessagesIn(
  client: MatrixSendClient,
  managementRoom: ManagementRoomOutput,
  userIdOrGlob: string,
  targetRoomIds: string[],
  limit = 1000,
  noop = false
) {
  for (const targetRoomId of targetRoomIds) {
    log.debug(
      `Fetching sent messages for ${userIdOrGlob} in ${targetRoomId} to redact...`,
      targetRoomId
    );

    try {
      await getMessagesByUserIn(
        client,
        userIdOrGlob,
        targetRoomId,
        limit,
        async (eventsToRedact) => {
          for (const victimEvent of eventsToRedact) {
            log.debug(
              `Redacting ${victimEvent["event_id"]} in ${targetRoomId}`,
              targetRoomId
            );
            if (!noop) {
              await client
                .redactEvent(targetRoomId, victimEvent["event_id"])
                .catch((error: unknown) => {
                  log.error(
                    `Error while trying to redact messages for ${userIdOrGlob} in ${targetRoomId}:`,
                    error,
                    targetRoomId
                  );
                });
            } else {
              await managementRoom.logMessage(
                LogLevel.WARN,
                "utils#redactUserMessagesIn",
                `Tried to redact ${victimEvent["event_id"]} in ${targetRoomId} but Draupnir is running in no-op mode`,
                targetRoomId
              );
            }
          }
        }
      );
    } catch (error) {
      await managementRoom.logMessage(
        LogLevel.ERROR,
        "utils#redactUserMessagesIn",
        `Error while trying to redact messages for ${userIdOrGlob} in ${targetRoomId}: ${error}`,
        targetRoomId
      );
    }
  }
}

/**
 * Gets all the events sent by a user (or users if using wildcards) in a given room ID, since
 * the time they joined.
 * @param {MatrixSendClient} client The client to use.
 * @param {string} sender The sender. A matrix user id or a wildcard to match multiple senders e.g. *.example.com.
 * Can also be used to generically search the sender field e.g. *bob* for all events from senders with "bob" in them.
 * See `MatrixGlob` in matrix-bot-sdk.
 * @param {string} roomId The room ID to search in.
 * @param {number} limit The maximum number of messages to search. Defaults to 1000. This will be a greater or equal
 * number of events that are provided to the callback if a wildcard is used, as not all events paginated
 * will match the glob. The reason the limit is calculated this way is so that a caller cannot accidentally
 * traverse the entire room history.
 * @param {function} cb Callback function to handle the events as they are received.
 * The callback will only be called if there are any relevant events.
 * @returns {Promise<void>} Resolves when either: the limit has been reached, no relevant events could be found or there is no more timeline to paginate.
 */
export async function getMessagesByUserIn(
  client: MatrixSendClient,
  sender: string,
  roomId: string,
  limit: number,
  cb: (events: RoomEvent[]) => Promise<void> | void
): Promise<void> {
  const isGlob = sender.includes("*");
  const roomEventFilter = {
    rooms: [roomId],
    ...(isGlob ? {} : { senders: [sender] }),
  };

  const matcher = new MatrixGlob(sender);

  function testUser(userId: string): boolean {
    if (isGlob) {
      return matcher.test(userId);
    } else {
      return userId === sender;
    }
  }

  /**
   * The response returned from `backfill`
   * See https://spec.matrix.org/latest/client-server-api/#get_matrixclientv3roomsroomidmessages
   * for what the fields mean in detail. You have to read the spec even with the summary.
   * The `chunk` contains the events in reverse-chronological order.
   * The `end` is a token for the end of the `chunk` (where the older events are).
   * The `start` is a token for the beginning of the `chunk` (where the most recent events are).
   */
  interface BackfillResponse {
    chunk?: RoomEvent[];
    end?: string;
    start: string;
  }

  /**
   * Call `/messages` "backwards".
   * @param from a token that was returned previously from this API to start paginating from or
   * if `null`, start from the most recent point in the timeline.
   * @returns The response part of the `/messages` API, see `BackfillResponse`.
   */
  async function backfill(from: string | null): Promise<BackfillResponse> {
    const qs = {
      filter: JSON.stringify(roomEventFilter),
      dir: "b",
      ...(from ? { from } : {}),
    };
    LogService.info("utils", "Backfilling with token: ", from);
    return client.doRequest(
      "GET",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages`,
      qs
    );
  }

  let processed = 0;
  /**
   * Filter events from the timeline to events that are from a matching sender and under the limit that can be processed by the callback.
   * @param events Events from the room timeline.
   * @returns Events that can safely be processed by the callback.
   */
  function filterEvents(events: RoomEvent[]) {
    const messages: RoomEvent[] = [];
    for (const event of events) {
      if (processed >= limit) return messages; // we have provided enough events.
      processed++;

      if (testUser(event["sender"])) messages.push(event);
    }
    return messages;
  }
  // We check that we have the token because rooms/messages is not required to provide one
  // and will not provide one when there is no more history to paginate.
  let token: string | null = null;
  do {
    const bfMessages: BackfillResponse = await backfill(token);
    const previousToken: string | null = token;
    token = bfMessages["end"] ?? null;
    const events = filterEvents(bfMessages["chunk"] || []);
    // If we are using a glob, there may be no relevant events in this chunk.
    if (events.length > 0) {
      await cb(events);
    }
    // This check exists only because of a Synapse compliance bug https://github.com/matrix-org/synapse/issues/12102.
    // We also check after processing events as the `previousToken` can be 'null' if we are at the start of the steam
    // and `token` can also be 'null' as we have paginated the entire timeline, but there would be unprocessed events in the
    // chunk that was returned in this request.
    if (previousToken === token) {
      LogService.debug(
        "utils",
        "Backfill returned same end token - returning early."
      );
      return;
    }
  } while (token && processed < limit);
}

let isMatrixClientPatchedForConciseExceptions = false;

// The fact that MatrixHttpClient logs every http error as error
// is unacceptable really.
// We will provide our own utility for logging outgoing requests as debug.
LogService.muteModule("MatrixHttpClient");

function isMatrixError(path: string): boolean {
  return /^\/_matrix/.test(path);
}

interface RequestOptions {
  method?: string | undefined;
  uri: string | undefined;
  [k: string]: unknown;
}

type RequestError =
  | {
      body?: {
        [key: string]: unknown;
      };
      [key: string]: unknown;
    }
  | undefined;
type RequestResponse =
  | { statusCode: number; [key: string]: unknown }
  | undefined;

/**
 * Patch `MatrixClient` into something that throws concise exceptions.
 *
 * By default, instances of `MatrixClient` throw instances of `IncomingMessage`
 * in case of many errors. Unfortunately, these instances are unusable:
 *
 * - they are logged as ~800 *lines of code*;
 * - there is no error message;
 * - they offer no stack.
 *
 * This method configures `MatrixClient` to ensure that methods that may throw
 * instead throws more reasonable instances of `Error`.
 */
function patchMatrixClientForConciseExceptions() {
  if (isMatrixClientPatchedForConciseExceptions) {
    return;
  }
  const originalRequestFn = getRequestFn();
  setRequestFn((params: RequestOptions, cb: typeof originalRequestFn) => {
    // Store an error early, to maintain *some* semblance of stack.
    // We'll only throw the error if there is one.
    const error = new Error("STACK CAPTURE");
    originalRequestFn(
      params,
      function conciseExceptionRequestFn(
        err: RequestError,
        response: RequestResponse,
        resBody: unknown
      ) {
        if (
          !err &&
          response !== undefined &&
          (response.statusCode < 200 || response.statusCode >= 300)
        ) {
          // Normally, converting HTTP Errors into rejections is done by the caller
          // of `requestFn` within matrix-bot-sdk. However, this always ends up rejecting
          // with an `IncomingMessage` - exactly what we wish to avoid here.
          err = response;

          // Safety note: In the calling code within matrix-bot-sdk, if we return
          // an IncomingMessage as an error, we end up logging an unredacted response,
          // which may include tokens, passwords, etc. This could be a grave privacy
          // leak. The matrix-bot-sdk typically handles this by sanitizing the data
          // before logging it but, by converting the HTTP Error into a rejection
          // earlier than expected by the matrix-bot-sdk, we skip this step of
          // sanitization.
          //
          // However, since the error we're creating is an `IncomingMessage`, we
          // rewrite it into an `Error` ourselves in this function. Our `Error`
          // is even more sanitized (we only include the URL, HTTP method and
          // the error response) so we are NOT causing a privacy leak.
          if (!(err instanceof IncomingMessage)) {
            // Safety check.
            throw new TypeError(
              "Internal error: at this stage, the error should be an IncomingMessage"
            );
          }
        }
        if (!(err instanceof IncomingMessage)) {
          // In most cases, we're happy with the result.
          return cb(err, response, resBody);
        }
        // However, MatrixClient has a tendency of throwing
        // instances of `IncomingMessage` instead of instances
        // of `Error`. The former take ~800 lines of log and
        // provide no stack trace, which makes them typically
        // useless.
        const method: string | undefined = err.method
          ? err.method
          : "req" in err && err.req instanceof ClientRequest
            ? err.req.method
            : params.method;
        const path: string = err.url
          ? err.url
          : "req" in err && err.req instanceof ClientRequest
            ? err.req.path
            : (params.uri ?? "");
        let body: unknown = null;
        if ("body" in err) {
          body = err.body;
        }
        // Calling code may use `body` to check for errors, so let's
        // make sure that we're providing it.
        if (typeof body === "string") {
          try {
            body = JSON.parse(body, jsonReviver);
          } catch (ex) {
            // Not JSON.
          }
        }
        const message = `Error during MatrixClient request ${method} ${path}: ${err.statusCode} ${err.statusMessage} -- ${JSON.stringify(body)}`;
        error.message = message;
        if (body) {
          // Define the property but don't make it visible during logging.
          Object.defineProperty(error, "body", {
            value: body,
            enumerable: false,
          });
        }
        // Calling code may use `statusCode` to check for errors, so let's
        // make sure that we're providing it.
        if ("statusCode" in err) {
          // Define the property but don't make it visible during logging.
          Object.defineProperty(error, "statusCode", {
            value: err.statusCode,
            enumerable: false,
          });
        }
        // matrix-appservice-bridge depends on errors being matrix-bot-sdk's MatrixError.
        // Since https://github.com/turt2live/matrix-bot-sdk/blob/836c2da7145668b20af7e0d75094b6162164f3dc/src/http.ts#L109
        // we wrote this, matrix-bot-sdk has updated so that there is now a MatrixError that is thrown
        // when there are errors in the response.
        if (isMatrixError(path)) {
          const matrixError = new MatrixError(
            body as MatrixError["body"],
            err.statusCode as number,
            err.headers as Record<string, string>
          );
          if (error.stack !== undefined) {
            matrixError.stack = error.stack;
          }
          return cb(matrixError, response, resBody);
        } else {
          return cb(error, response, resBody);
        }
      }
    );
  });
  isMatrixClientPatchedForConciseExceptions = true;
}

const MAX_REQUEST_ATTEMPTS = 15;
const REQUEST_RETRY_BASE_DURATION_MS = 100;

let isMatrixClientPatchedForRetryWhenThrottled = false;
/**
 * Patch instances of MatrixClient to make sure that it retries requests
 * in case of throttling.
 *
 * Note: As of this writing, we do not re-attempt requests that timeout,
 * only request that are throttled by the server. The rationale is that,
 * in case of DoS, we do not wish to make the situation even worse.
 */
function patchMatrixClientForRetry() {
  if (isMatrixClientPatchedForRetryWhenThrottled) {
    return;
  }
  const originalRequestFn = getRequestFn();
  setRequestFn(async (params: RequestOptions, cb: typeof originalRequestFn) => {
    let attempt = 1;
    while (true) {
      try {
        const result: [RequestError, RequestResponse, unknown] =
          await new Promise((resolve, reject) => {
            originalRequestFn(
              params,
              function requestFnWithRetry(
                err: RequestError,
                response: RequestResponse,
                resBody: unknown
              ) {
                // Note: There is no data race on `attempt` as we `await` before continuing
                // to the next iteration of the loop.
                if (
                  attempt < MAX_REQUEST_ATTEMPTS &&
                  err?.body?.errcode === "M_LIMIT_EXCEEDED"
                ) {
                  // We need to retry.
                  // We're not able to refactor away from this now, pretty unfortunately.
                  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                  reject(err);
                } else {
                  if (attempt >= MAX_REQUEST_ATTEMPTS) {
                    LogService.warn(
                      "Draupnir.client",
                      `Retried request ${params.method} ${params.uri} ${attempt} times, giving up.`
                    );
                  }
                  // No need-to-retry error? Lucky us!
                  // Note that this may very well be an error, just not
                  // one we need to retry.
                  resolve([err, response, resBody]);
                }
              }
            );
          });
        // This is our final result.
        // Pass result, whether success or error.
        return cb(...result);
      } catch (err) {
        // Need to retry.
        const retryAfterMs = (() => {
          if (err instanceof MatrixError && err.retryAfterMs !== undefined) {
            return err.retryAfterMs;
          } else {
            LogService.error(
              "Draupnir.client",
              "Unable to extract retry_after_ms from error, using fallback to create retry duration",
              err
            );
            return attempt * attempt * REQUEST_RETRY_BASE_DURATION_MS;
          }
        })();
        LogService.debug(
          "Draupnir.client",
          `Waiting ${retryAfterMs}ms before retrying ${params.method} ${params.uri}`
        );
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
        attempt += 1;
      }
    }
  });
  isMatrixClientPatchedForRetryWhenThrottled = true;
}

let isMatrixClientPatchedForPrototypePollution = false;

export function jsonReviver<T = unknown>(key: string, value: T): T | undefined {
  if (key === "__proto__" || key === "constructor") {
    return undefined;
  } else {
    return value;
  }
}

/**
 * https://github.com/turt2live/matrix-bot-sdk/blob/c7d16776502c26bbb547a3d667ec92eb50e7026c/src/http.ts#L77-L101 💀 fucking hell!!!!
 *
 * The following is an inefficient workaround, but you gotta do what you can.
 */
function patchMatrixClientForPrototypePollution() {
  if (isMatrixClientPatchedForPrototypePollution) {
    return;
  }
  const originalRequestFn = getRequestFn();
  setRequestFn((params: RequestOptions, cb: typeof originalRequestFn) => {
    originalRequestFn(
      params,
      function conciseExceptionRequestFn(
        error: RequestError,
        response: RequestResponse,
        resBody: unknown
      ) {
        // https://github.com/turt2live/matrix-bot-sdk/blob/c7d16776502c26bbb547a3d667ec92eb50e7026c/src/http.ts#L77-L101
        // bring forwards this step and do it safely.
        if (typeof resBody === "string") {
          try {
            resBody = JSON.parse(resBody, jsonReviver);
          } catch (e) {
            // we don't care if we fail to parse the JSON as it probably isn't JSON.
          }
        }

        if (typeof response?.body === "string") {
          try {
            response.body = JSON.parse(response.body, jsonReviver);
          } catch (e) {
            // we don't care if we fail to parse the JSON as it probably isn't JSON.
          }
        }
        return cb(error, response, resBody);
      }
    );
  });
  isMatrixClientPatchedForPrototypePollution = true;
}

/**
 * Perform any patching deemed necessary to MatrixClient.
 */
export function patchMatrixClient() {
  // Note that the order of patches is meaningful.
  //
  // - `patchMatrixClientForPrototypePollution` converts all JSON bodies to safe JSON before client code can
  //    parse and use the JSON inappropriately.
  // - `patchMatrixClientForConciseExceptions` converts all `IncomingMessage`
  //   errors into instances of `Error` handled as errors;
  // - `patchMatrixClientForRetry` expects that all errors are returned as
  //   errors.
  patchMatrixClientForPrototypePollution();
  patchMatrixClientForConciseExceptions();
  patchMatrixClientForRetry();
}

patchMatrixClient();

/**
 * Initialize Sentry for error monitoring and reporting.
 *
 * This method is idempotent. If `config` specifies that Sentry
 * should not be used, it does nothing.
 */
export function initializeSentry(config: IConfig) {
  if (sentryInitialized) {
    return;
  }
  if (config.health.sentry) {
    // Configure error monitoring with Sentry.
    const sentry = config.health.sentry;
    Sentry.init({
      dsn: sentry.dsn,
      tracesSampleRate: sentry.tracesSampleRate,
    });
    sentryInitialized = true;
  }
}
// Set to `true` once we have initialized `Sentry` to ensure
// that we do not attempt to initialize it more than once.
let sentryInitialized = false;
