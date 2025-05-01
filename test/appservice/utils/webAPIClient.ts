// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { MatrixClient } from "matrix-bot-sdk";

interface OpenIDTokenInfo {
  access_token: string;
  expires_in: number;
  matrix_server_name: string;
  token_type: string;
}

async function getOpenIDToken(client: MatrixClient): Promise<string> {
  const tokenInfo: OpenIDTokenInfo = await client.doRequest(
    "POST",
    `/_matrix/client/v3/user/${await client.getUserId()}/openid/request_token`,
    undefined,
    {}
  );
  return tokenInfo.access_token;
}

export interface ProvisionDraupnirResponse {
  managementRoom: string;
  botID: string;
  ownerID: string;
}

export interface GetBotsForUserResponse {
  bots: {
    id: string;
    ownerID: string;
    managementRoom: string;
    displayName: string;
  }[];
}

export class DraupnirWebAPIClient {
  private constructor(
    private readonly openIDToken: string,
    private readonly baseURL: string,
    private readonly userID: string
  ) {}

  public static async makeClient(
    client: MatrixClient,
    baseUrl: string,
    userID: string
  ): Promise<DraupnirWebAPIClient> {
    const token = await getOpenIDToken(client);
    return new DraupnirWebAPIClient(token, baseUrl, userID);
  }

  public async provisionDraupnir(
    roomsToProtect: string[] = []
  ): Promise<ProvisionDraupnirResponse> {
    const resp = await fetch(`${this.baseURL}/api/1/appservice/provision`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openIDToken}`,
        "X-Draupnir-UserID": this.userID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        protectedRooms: roomsToProtect,
      }),
    });
    if (!resp.ok) {
      throw new Error(
        `Failed to provision draupnir: ${resp.status} ${resp.statusText}`
      );
    }
    const body: ProvisionDraupnirResponse = await resp.json();
    return body;
  }

  public async getBotsForUser(
    onlyOwner: boolean = true
  ): Promise<GetBotsForUserResponse> {
    const resp = await fetch(
      `${this.baseURL}/api/1/appservice/list?onlyOwner=${onlyOwner}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.openIDToken}`,
          "X-Draupnir-UserID": this.userID,
        },
      }
    );
    if (!resp.ok) {
      throw new Error(
        `Failed to get bots for user: ${resp.status} ${resp.statusText}`
      );
    }
    const body: GetBotsForUserResponse = await resp.json();
    return body;
  }
}
