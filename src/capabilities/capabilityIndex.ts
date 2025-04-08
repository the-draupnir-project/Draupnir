// Copyright 2022-2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import "../protections/HomeserverUserPolicyApplication/UserRestrictionCapability";
import "../protections/HomeserverUserPolicyApplication/UserRestrictionCapabilityRenderer";
import "../protections/HomeserverUserPolicyApplication/UserSuspensionCapability";
import "./StandardEventConsequencesRenderer";
import "./ServerACLConsequencesRenderer";
import "./StandardUserConsequencesRenderer";
import "./RoomTakedownCapability";
import "./RoomTakedownCapabilityRenderer";
import "./SynapseAdminRoomTakedown/SynapseAdminRoomTakedown";
