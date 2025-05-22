// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { DocumentNode } from "@the-draupnir-project/interface-manager";
import { RoomBasicDetails } from "matrix-protection-suite";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";

export function renderDiscoveredRoom(details: RoomBasicDetails): DocumentNode {
  return (
    <fragment>
      <h4>Room Discovered</h4>
      <details>
        <summary>
          <code>{details.room_id}</code>
        </summary>
        <ul>
          <li>
            name: <code>{details.name ?? "Unnamed room"}</code>
          </li>
          <li>
            member count: <code>{details.joined_members ?? "unknown"}</code>
          </li>
          <li>
            room ID: <code>{details.room_id}</code>
          </li>
          <li>
            creator: <code>{details.creator ?? "unknown"}</code>
          </li>
          <li>
            topic: <pre>{details.topic ?? "unknown"}</pre>
          </li>
        </ul>
      </details>
    </fragment>
  );
}
