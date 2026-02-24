// SPDX-FileCopyrightText: 2023 Gnuxie <Gnuxie@protonmail.com>
// SPDX-FileCopyrightText: 2018 - 2022 Travis Ralston
//
// SPDX-License-Identifier: MIT
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-bot-sdk
// https://github.com/turt2live/matrix-bot-sdk
// </text>

import {
  StringUserID,
  userLocalpart,
  userServerName,
} from "../StringlyTypedMatrix";
import { StringServerName } from "../StringlyTypedMatrix/StringServerName";
import { Permalinks } from "./Permalinks";

export class MatrixUserID {
  public constructor(private readonly userID: StringUserID) {
    // nothing to do.
  }

  public static fromUserID(userID: StringUserID): MatrixUserID {
    return new MatrixUserID(userID);
  }

  public toString(): StringUserID {
    return this.userID;
  }

  public toPermalink(): string {
    return Permalinks.forUser(this.userID);
  }

  public get localpart(): string {
    return userLocalpart(this.userID);
  }

  public get serverName(): StringServerName {
    return userServerName(this.userID);
  }

  public isContainingGlobCharacters(): boolean {
    return /[*?]/.test(this.userID);
  }
}
