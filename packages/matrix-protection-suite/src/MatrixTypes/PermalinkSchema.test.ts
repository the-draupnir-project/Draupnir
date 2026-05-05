// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  MatrixEventViaAlias,
  MatrixEventViaRoomID,
  MatrixRoomAlias,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { PermalinkSchema } from "./PermalinkSchema";
import { Value } from "../Interface/Value";

type AClass = { [Symbol.hasInstance]: (instance: unknown) => boolean };

function testLink(aClass: AClass, link: string) {
  const reference = Value.Decode(PermalinkSchema, link).expect(
    "Should be able to decode all these links"
  );
  expect(reference instanceof aClass).toBe(true);
}

test("PermalinkSchema works", function () {
  testLink(
    MatrixEventViaRoomID,
    "https://matrix.to/#/!yvVjpvDizjZrURyvZH:matrix.org/%2431MnLVoP_HR8muVkdEYsdd8Jc44X221nHpnHRqBOIeY?via=matrix.org&via=sosnowkadub.de&via=neko.dev"
  );
  testLink(
    MatrixEventViaRoomID,
    "https://matrix.to/#/!yvVjpvDizjZrURyvZH:matrix.org/$31MnLVoP_HR8muVkdEYsdd8Jc44X221nHpnHRqBOIeY?via=matrix.org&via=sosnowkadub.de&via=neko.dev"
  );
  testLink(MatrixRoomID, "https://matrix.to/#/!yvVjpvDizjZrURyvZH:matrix.org");
  testLink(
    MatrixRoomID,
    "https://matrix.to/#/!yvVjpvDizjZrURyvZH:matrix.org?via=matrix.org&via=sosnowkadub.de&via=neko.dev"
  );
  testLink(MatrixRoomAlias, "https://matrix.to/#/#foo:localhhost:9999");
  testLink(MatrixRoomAlias, "https://matrix.to/#/%23foo:localhhost:9999");
  testLink(
    MatrixEventViaAlias,
    "https://matrix.to/#/#yvVjpvDizjZrURyvZH:matrix.org/$31MnLVoP_HR8muVkdEYsdd8Jc44X221nHpnHRqBOIeY"
  );
});
