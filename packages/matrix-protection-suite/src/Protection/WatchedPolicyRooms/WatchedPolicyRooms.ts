// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  PolicyListRevision,
  PolicyRoomRevision,
} from "../../PolicyList/PolicyListRevision";
import { Result } from "@gnuxie/typescript-result";
import { PropagationType } from "../PolicyListConfig/PolicyListConfig";
import { PolicyListRevisionIssuer } from "../../PolicyList/PolicyListRevisionIssuer";

export type WatchedPolicyRoom = {
  readonly room: MatrixRoomID;
  readonly propagation: PropagationType;
  readonly revision: PolicyRoomRevision;
};

export interface WatchedPolicyRooms {
  readonly currentRevision: PolicyListRevision;
  readonly revisionIssuer: PolicyListRevisionIssuer;
  watchPolicyRoomDirectly(room: MatrixRoomID): Promise<Result<void>>;
  unwatchPolicyRoom(room: MatrixRoomID): Promise<Result<void>>;
  unregisterListeners(): void;
  readonly allRooms: WatchedPolicyRoom[];
  findPolicyRoomFromShortcode(shortcode: string): WatchedPolicyRoom | undefined;
}
