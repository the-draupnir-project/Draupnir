// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Result } from "@gnuxie/typescript-result";
import { Type, Static } from "@sinclair/typebox";

const RoomVersionStability = Type.Union(
  [Type.Literal("stable"), Type.Literal("unstable")],
  { title: "RoomVersionStability" }
);

const RoomVersionsCapability = Type.Object(
  {
    default: Type.String({
      description:
        "The default room version the server is using for new rooms.",
      example: "1",
    }),
    available: Type.Record(Type.String(), RoomVersionStability),
  },
  {
    description: "The room versions the server supports.",
    title: "RoomVersionsCapability",
  }
);

export type ClientCapabilities = Static<typeof ClientCapabilities>;
export const ClientCapabilities = Type.Object(
  {
    "m.change_password": Type.Object(
      {
        enabled: Type.Boolean(),
      },
      {
        description:
          "Capability to indicate if the user can change their password.",
      }
    ),

    "m.room_versions": RoomVersionsCapability,

    "m.set_displayname": Type.Object(
      {
        enabled: Type.Boolean(),
      },
      {
        description:
          "Capability to indicate if the user can change their display name.",
      }
    ),

    "m.set_avatar_url": Type.Object(
      {
        enabled: Type.Boolean(),
      },
      {
        description:
          "Capability to indicate if the user can change their avatar.",
      }
    ),

    "m.3pid_changes": Type.Object(
      {
        enabled: Type.Boolean(),
      },
      {
        description:
          "Capability to indicate if the user can change 3PID associations on their account.",
      }
    ),

    "m.get_login_token": Type.Object(
      {
        enabled: Type.Boolean(),
      },
      {
        description:
          "Capability to indicate if the user can generate tokens to log further clients into their account.",
      }
    ),
  },
  {
    additionalProperties: true,
  }
);

export type ClientCapabilitiesResponse = Static<
  typeof ClientCapabilitiesResponse
>;
export const ClientCapabilitiesResponse = Type.Object(
  {
    capabilities: ClientCapabilities,
  },
  {
    title: "ClientCapabilitiesResponse",
  }
);

export interface ClientCapabilitiesNegotiation {
  getClientCapabilities(): Promise<Result<ClientCapabilitiesResponse>>;
}
