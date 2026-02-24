// SPDX-FileCopyrightText: 2022 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-basic-types
// https://github.com/the-draupnir-project/matrix-basic-types
// </text>

import { Ok, Result, ResultError, isError } from "@gnuxie/typescript-result";
import {
  StringEventID,
  StringRoomAlias,
  StringRoomID,
  isStringRoomAlias,
  isStringRoomID,
  roomAliasServerName,
} from "../StringlyTypedMatrix";
import { Permalinks } from "./Permalinks";
import { StringServerName } from "../StringlyTypedMatrix/StringServerName";

/**
 * Some servers can return a huge list of via servers for a room which can
 * cause some pretty serious problems for message rendering.
 */
function limitViaServers(viaServers: string[]): string[] {
  if (viaServers.length > 5) {
    return viaServers.slice(0, 5);
  } else {
    return viaServers;
  }
}

export type MatrixRoomReference = MatrixRoomID | MatrixRoomAlias;

// we disable this warning because it's not relevant, we're not making a module
// we're trying to add generic functions to a type.
// Comes at a cost that anyone actually using this from JS and not TS is
// going to be confused.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace MatrixRoomReference {
  export function fromAlias(alias: StringRoomAlias): MatrixRoomReference {
    return new MatrixRoomAlias(alias);
  }

  export function fromRoomID(
    roomId: StringRoomID,
    viaServers: string[] = []
  ): MatrixRoomID {
    return new MatrixRoomID(roomId, viaServers);
  }

  /**
   * Create a `MatrixRoomReference` from a room ID or a room alias.
   * @param roomIDOrAlias The room ID or the room alias.
   * @param viaServers If a room ID is being provided, then these server names
   * can be used to find the room.
   */
  export function fromRoomIDOrAlias(
    roomIDOrAlias: StringRoomID | StringRoomAlias,
    viaServers: string[] = []
  ): MatrixRoomReference {
    if (roomIDOrAlias.startsWith("!")) {
      return new MatrixRoomID(roomIDOrAlias, viaServers);
    } else {
      return new MatrixRoomAlias(roomIDOrAlias, viaServers);
    }
  }

  export function fromPermalink(link: string): Result<MatrixRoomReference> {
    const partsResult = Permalinks.parseUrl(link);
    if (isError(partsResult)) {
      return partsResult;
    }
    const parts = partsResult.ok;
    if (parts.roomID !== undefined) {
      return Ok(new MatrixRoomID(parts.roomID, parts.viaServers));
    } else if (parts.roomAlias !== undefined) {
      return Ok(new MatrixRoomAlias(parts.roomAlias, parts.viaServers));
    } else {
      return ResultError.Result(
        `There isn't a reference to a room in the URL: ${link}`
      );
    }
  }

  /**
   * Try parse a roomID, roomAlias or a permalink.
   */
  export function fromString(string: string): Result<MatrixRoomReference> {
    if (isStringRoomID(string)) {
      return Ok(MatrixRoomReference.fromRoomID(string));
    } else if (isStringRoomAlias(string)) {
      return Ok(MatrixRoomReference.fromRoomIDOrAlias(string));
    } else {
      return MatrixRoomReference.fromPermalink(string);
    }
  }
}
/**
 * This is a universal reference for a matrix room.
 * This is really useful because there are at least 3 ways of referring to a Matrix room,
 * and some of them require extra steps to be useful in certain contexts (aliases, permalinks).
 */
abstract class AbstractMatrixRoomReference {
  private readonly viaServers: string[];
  protected constructor(
    protected readonly reference: StringRoomID | StringRoomAlias,
    viaServers: string[] = []
  ) {
    this.viaServers = limitViaServers(viaServers);
  }

  public toPermalink(): string {
    return Permalinks.forRoom(this.reference, this.viaServers);
  }

  /**
   * We don't include a `toRoomId` that uses `forceResolveAlias` as this would erase `viaServers`,
   * which will be necessary to use if our homeserver hasn't joined the room yet.
   * @returns A string representing a room id or alias.
   */
  public toRoomIDOrAlias(): StringRoomID | StringRoomAlias {
    return this.reference;
  }

  public getViaServers(): string[] {
    // don't want them mutating the viaServers in this reference.
    return [...this.viaServers];
  }

  public toString(): string {
    return this.toPermalink();
  }
}

/**
 * A concrete `MatrixRoomReference` that represents only a room ID.
 * @see {@link MatrixRoomReference}.
 */
export class MatrixRoomID extends AbstractMatrixRoomReference {
  public constructor(reference: string, viaServers: string[] = []) {
    if (!isStringRoomID(reference)) {
      throw new TypeError(`invalid reference for roomID ${reference}`);
    }
    super(reference, viaServers);
  }

  public toRoomIDOrAlias(): StringRoomID {
    return this.reference as StringRoomID;
  }
}

/**
 * A concrete `MatrixRoomReference` the represents only a room alias.
 * @see {@link MatrixRoomReference}.
 */
export class MatrixRoomAlias extends AbstractMatrixRoomReference {
  public constructor(reference: string, viaServers: string[] = []) {
    if (!isStringRoomAlias(reference)) {
      throw new TypeError(`invalid reference for RoomAlias ${reference}`);
    }
    super(reference, viaServers);
  }

  public toRoomIDOrAlias(): StringRoomAlias {
    return this.reference as StringRoomAlias;
  }

  public get serverName(): StringServerName {
    return roomAliasServerName(this.reference as StringRoomAlias);
  }
}

export type MatrixEventReference = MatrixEventViaRoomID | MatrixEventViaAlias;

// we disable this warning because it's not relevant, we're not making a module
// we're trying to add generic functions to a type.
// Comes at a cost that anyone actually using this from JS and not TS is
// going to be confused.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace MatrixEventReference {
  export function fromPermalink(link: string): Result<MatrixEventReference> {
    const partsResult = Permalinks.parseUrl(link);
    if (isError(partsResult)) {
      return partsResult;
    }
    const parts = partsResult.ok;
    if (parts.roomID !== undefined && parts.eventID !== undefined) {
      return Ok(
        new MatrixEventViaRoomID(
          new MatrixRoomID(parts.roomID, parts.viaServers),
          parts.eventID
        )
      );
    } else if (parts.roomAlias !== undefined && parts.eventID !== undefined) {
      return Ok(
        new MatrixEventViaAlias(
          new MatrixRoomAlias(parts.roomAlias, parts.viaServers),
          parts.eventID
        )
      );
    } else {
      return ResultError.Result(
        `There isn't a reference to an event in the URL: ${link}`
      );
    }
  }
}

export class MatrixEventViaRoomID {
  public constructor(
    public readonly room: MatrixRoomID,
    public readonly eventID: StringEventID
  ) {
    // nothing to do.
  }

  public get reference() {
    return this.room;
  }

  public toPermalink(): string {
    return `${this.room.toPermalink()}/${encodeURIComponent(this.eventID)}`;
  }
}

export class MatrixEventViaAlias {
  public constructor(
    public readonly alias: MatrixRoomAlias,
    public readonly eventID: StringEventID
  ) {
    // nothing to do.
  }

  public get reference() {
    return this.alias;
  }

  public toPermalink(): string {
    return `${this.alias.toPermalink()}/${encodeURIComponent(this.eventID)}`;
  }
}
