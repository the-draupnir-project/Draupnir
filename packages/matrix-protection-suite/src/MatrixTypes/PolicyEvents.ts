// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Type } from "@sinclair/typebox";
import { EmptyContent, StateEvent } from "./Events";
import { Value } from "../Interface/Value";
import { EDStatic } from "../Interface/Static";

export enum PolicyRuleType {
  /// `entity` is to be parsed as a glob of users IDs
  User = "m.policy.rule.user",

  /// `entity` is to be parsed as a glob of room IDs/aliases
  Room = "m.policy.rule.room",

  /// `entity` is to be parsed as a glob of server names
  Server = "m.policy.rule.server",

  Unknown = "unknown",
}

// FIXME: I don't see how this is relevant. The obsoleting behavior is weird,
//        and they should just be seperate rules.
// README! The order here matters for determining whether a type is obsolete, most recent should be first.
// These are the current and historical types for each type of rule which were used while MSC2313 was being developed
// and were left as an artifact for some time afterwards.
// Most rules (as of writing) will have the prefix `m.room.rule.*` as this has been in use for roughly 2 years.
export const USER_RULE_TYPES = [
  PolicyRuleType.User,
  "m.room.rule.user",
  "org.matrix.mjolnir.rule.user",
];
export const ROOM_RULE_TYPES = [
  PolicyRuleType.Room,
  "m.room.rule.room",
  "org.matrix.mjolnir.rule.room",
];
export const SERVER_RULE_TYPES = [
  PolicyRuleType.Server,
  "m.room.rule.server",
  "org.matrix.mjolnir.rule.server",
];
export const ALL_RULE_TYPES = [
  ...USER_RULE_TYPES,
  ...ROOM_RULE_TYPES,
  ...SERVER_RULE_TYPES,
];

export function variantsForPolicyRuleType(type: PolicyRuleType): string[] {
  switch (type) {
    case PolicyRuleType.User:
      return USER_RULE_TYPES;
    case PolicyRuleType.Server:
      return SERVER_RULE_TYPES;
    case PolicyRuleType.Room:
      return ROOM_RULE_TYPES;
    default:
      throw new TypeError(`Unknown policy rule type ${type}`);
  }
}

export function normalisePolicyRuleType(type: string): PolicyRuleType {
  if (USER_RULE_TYPES.includes(type)) {
    return PolicyRuleType.User;
  } else if (SERVER_RULE_TYPES.includes(type)) {
    return PolicyRuleType.Server;
  } else if (ROOM_RULE_TYPES.includes(type)) {
    return PolicyRuleType.Room;
  } else {
    return PolicyRuleType.Unknown; // invalid/unknown
  }
}

export function isPolicyTypeObsolete(
  normalisedType: PolicyRuleType,
  existingType: string,
  candidateType: string
): boolean {
  switch (normalisedType) {
    case PolicyRuleType.User:
      return (
        USER_RULE_TYPES.indexOf(candidateType) >
        USER_RULE_TYPES.indexOf(existingType)
      );
    case PolicyRuleType.Server:
      return (
        SERVER_RULE_TYPES.indexOf(candidateType) >
        SERVER_RULE_TYPES.indexOf(existingType)
      );
    case PolicyRuleType.Room:
      return (
        ROOM_RULE_TYPES.indexOf(candidateType) >
        ROOM_RULE_TYPES.indexOf(existingType)
      );
    default:
      throw new TypeError(`unknown PolicyRuleType ${normalisedType}`);
  }
}

export const PlainTextPolicyContent = Type.Object({
  entity: Type.String({
    description:
      "The entity affected by this rule. Glob characters `*` and `?` can be used\nto match zero or more characters or exactly one character respectively.",
  }),
  recommendation: Type.String({
    description:
      "The suggested action to take. Currently only `m.ban` is specified.",
  }),
  reason: Type.Optional(
    Type.String({
      description: "The human-readable description for the `recommendation`.",
    })
  ),
});

export type HashedPolicyContent = EDStatic<typeof HashedPolicyContent>;
export const HashedPolicyContent = Type.Union([
  Type.Intersect([
    Type.Omit(PlainTextPolicyContent, ["entity"]),
    Type.Object({
      "org.matrix.msc4205.hashes": Type.Record(Type.String(), Type.String()),
    }),
  ]),
  Type.Intersect([
    Type.Omit(PlainTextPolicyContent, ["entity"]),
    Type.Object({
      hashes: Type.Record(Type.String(), Type.String()),
    }),
  ]),
]);

export type UnredactedPolicyContent = EDStatic<typeof UnredactedPolicyContent>;
export const UnredactedPolicyContent = Type.Union([
  Type.Union([PlainTextPolicyContent, HashedPolicyContent]),
]);

export type RedactablePolicyContent = EDStatic<typeof RedactablePolicyContent>;
export const RedactablePolicyContent = Type.Union([
  UnredactedPolicyContent,
  EmptyContent,
]);

export type GeneircPolicyRuleEvent = EDStatic<typeof PolicyRuleEvent>;
export const GeneircPolicyRuleEvent = StateEvent(RedactablePolicyContent);

export type PolicyRuleUser = EDStatic<typeof PolicyRuleUser>;
export const PolicyRuleUser = Type.Intersect([
  GeneircPolicyRuleEvent,
  Type.Object({
    state_key: Type.Optional(
      Type.String({
        description: "An arbitrary string decided upon by the sender.",
      })
    ),
    type: Type.Union(USER_RULE_TYPES.map((type) => Type.Literal(type))),
  }),
]);

export type PolicyRuleServer = EDStatic<typeof PolicyRuleServer>;
export const PolicyRuleServer = Type.Intersect([
  GeneircPolicyRuleEvent,
  Type.Object({
    state_key: Type.Optional(
      Type.String({
        description: "An arbitrary string decided upon by the sender.",
      })
    ),
    type: Type.Union(SERVER_RULE_TYPES.map((type) => Type.Literal(type))),
  }),
]);

export type PolicyRuleRoom = EDStatic<typeof PolicyRuleRoom>;
export const PolicyRuleRoom = Type.Intersect([
  GeneircPolicyRuleEvent,
  Type.Object({
    state_key: Type.Optional(
      Type.String({
        description: "An arbitrary string decided upon by the sender.",
      })
    ),
    type: Type.Union(ROOM_RULE_TYPES.map((type) => Type.Literal(type))),
  }),
]);

export type PolicyRuleEvent = EDStatic<typeof PolicyRuleEvent>;
export const PolicyRuleEvent = Type.Union([
  PolicyRuleUser,
  PolicyRuleServer,
  PolicyRuleRoom,
]);
Value.Compile(PolicyRuleEvent);

export function isPolicyRuleEvent(value: unknown): value is PolicyRuleEvent {
  return Value.Check(PolicyRuleEvent, value);
}
