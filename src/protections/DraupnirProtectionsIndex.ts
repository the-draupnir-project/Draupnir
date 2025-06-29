// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

/**
 * This file exists as a way to register all protections.
 * In future, we should maybe try to dogfood the dynamic plugin load sytem
 * instead. For now that system doesn't even exist.
 */

// import capability renderers and glue too.
import "../capabilities/capabilityIndex";

// keep alphabetical please.
import "./BanPropagation";
import "./BasicFlooding";
import "./FirstMessageIsImage";
import "./HomeserverUserPolicyApplication/HomeserverUserPolicyProtection";
import "./InvalidEventProtection";
import "./JoinWaveShortCircuit";
import "./RedactionSynchronisation";
import "./MembershipChangeProtection";
import "./MentionLimitProtection";
import "./MessageIsMedia";
import "./MessageIsVoice";
import "./NewJoinerProtection";
import "./PolicyChangeNotification";
import "./ProtectedRooms/RoomsSetBehaviourProtection";
import "./TrustedReporters";
import "./WordList";
