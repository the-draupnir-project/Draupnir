// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import * as request from "request";
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
  bots: string[];
}

export class DraupnirWebAPIClient {
  private constructor(
    private readonly openIDToken: string,
    private readonly baseURL: string
  ) {}

  public static async makeClient(
    client: MatrixClient,
    baseUrl: string
  ): Promise<DraupnirWebAPIClient> {
    const token = await getOpenIDToken(client);
    return new DraupnirWebAPIClient(token, baseUrl);
  }

  public async provisionDraupnir(
    roomsToProtect: string[] = []
  ): Promise<ProvisionDraupnirResponse> {
    const body: ProvisionDraupnirResponse = await new Promise(
      (resolve, reject) => {
        request.post(
          `${this.baseURL}/api/1/appservice/provision`,
          {
            headers: {
              Authorization: `Bearer ${this.openIDToken}`,
            },
            json: {
              protectedRooms: roomsToProtect,
            },
          },
          (error, response) => {
            if (error === null || error === undefined) {
              resolve(response.body);
            } else if (error instanceof Error) {
              reject(error);
            } else {
              reject(
                new TypeError(`Someone is throwing things that aren't errors`)
              );
            }
          }
        );
      }
    );
    return body;
  }

  public async getBotsForUser(
    onlyOwner: boolean = true
  ): Promise<GetBotsForUserResponse> {
    const body: GetBotsForUserResponse = await new Promise(
      (resolve, reject) => {
        request.get(
          `${this.baseURL}/api/1/appservice/list?onlyOwner=${onlyOwner}`,
          {
            headers: {
              Authorization: `Bearer ${this.openIDToken}`,
            },
          },
          (error, response) => {
            if (error === null || error === undefined) {
              resolve(JSON.parse(response.body));
            } else if (error instanceof Error) {
              reject(error);
            } else {
              reject(
                new TypeError(`Someone is throwing things that aren't errors`)
              );
            }
          }
        );
      }
    );
    return body;
  }
}
