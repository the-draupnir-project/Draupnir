// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  Ok,
  RoomMessageSender,
  RoomUpdateError,
  isError,
} from "matrix-protection-suite";
import { sendMatrixEventsFromDeadDocument } from "../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { Result } from "@gnuxie/typescript-result";

function renderErrorItem(error: RoomUpdateError): DocumentNode {
  return (
    <li>
      <a href={error.room.toPermalink()}>{error.room.toRoomIDOrAlias()}</a> -{" "}
      {error.message}
    </li>
  );
}

/**
 * Render a message to show to the user after taking an action in a room or a set of rooms.
 * @param client A matrix client.
 * @param errors Any errors associated with the action.
 * @param options.title To give context about what the action was, shown when there are errors.
 * @param options.noErrorsText To show when there are no errors.
 * @param options.skipNoErrors is ineffective and does nothing, it is an option for the accompanying `printActionResult`.
 * @returns A `DocumentNode` fragment that can be sent to Matrix or incorporated into another message.
 */
export async function renderActionResult(
  errors: RoomUpdateError[],
  {
    title = "There were errors updating protected rooms.",
    noErrorsText = "Done updating rooms - no errors.",
  }: { title?: string; noErrorsText?: string } = {}
): Promise<DocumentNode> {
  if (errors.length === 0) {
    return (
      <fragment>
        <font color="#00cc00">{noErrorsText}</font>
      </fragment>
    );
  }
  return (
    <fragment>
      <font color="#ff0000">
        {title}
        <br />
      </font>
      <details>
        <summary>
          <font color="#ff0000">
            <b>{errors.length} errors updating protected rooms!</b>
            <br />
          </font>
        </summary>
        <ul>{errors.map((error) => renderErrorItem(error))}</ul>
      </details>
    </fragment>
  );
}

/**
 * Render a message to represent the outcome of an action in an update.
 * @param client A matrix client to send a notice with.
 * @param roomID The room to send the notice to.
 * @param errors Any errors that are a result of the action.
 * @param options.title To give context about what the action was, shown when there are errors.
 * @param options.noErrorsText To show when there are no errors.
 * @returns
 */
export async function printActionResult(
  messageSender: RoomMessageSender,
  roomID: StringRoomID,
  errors: RoomUpdateError[],
  renderOptions: { title?: string; noErrorsText?: string } = {}
): Promise<Result<void>> {
  const sendResult = await sendMatrixEventsFromDeadDocument(
    messageSender,
    roomID,
    <root>{await renderActionResult(errors, renderOptions)}</root>,
    {}
  );
  if (isError(sendResult)) {
    return sendResult.elaborate(
      "Could not printActionResult to the management room."
    );
  }
  return Ok(undefined);
}
