// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { makeCommandNormaliser } from "./CommandDispatcher";

test("basic command dispatcher", function () {
  const normaliser = makeCommandNormaliser(
    "@draupnir:example.com" as StringUserID,
    {
      normalisedPrefix: "draupnir",
      symbolPrefixes: ["!"],
      getDisplayName() {
        return "My Draupnir bot that is fluffy";
      },
      isAllowedOnlySymbolPrefixes: false,
      additionalPrefixes: ["mjolnir"],
    }
  );
  expect(normaliser("!draupnir ban")).toBe("draupnir ban");
  expect(normaliser("draupnir ban")).toBe(undefined);
  expect(normaliser("My Draupnir bot that is fluffy ban")).toBe("draupnir ban");
  expect(normaliser("My Draupnir bot that is fluffy: ban")).toBe(
    "draupnir ban"
  );
  expect(
    normaliser(
      "[@draupnir:example.com](https://matrix.to/#/@draupnir:example.com) ban"
    )
  ).toBe("draupnir ban");
  expect(
    normaliser(
      "[@draupnir:example.com](https://matrix.to/#/@draupnir:example.com): ban"
    )
  ).toBe("draupnir ban");
  expect(normaliser("!mjolnir ban")).toBe("draupnir ban");
});

test("command normaliser that allows symbol prefixes", function () {
  const normaliser = makeCommandNormaliser(
    "@draupnir:example.com" as StringUserID,
    {
      normalisedPrefix: "draupnir",
      symbolPrefixes: ["."],
      getDisplayName() {
        return "Draupnir";
      },
      isAllowedOnlySymbolPrefixes: true,
      additionalPrefixes: ["mjolnir"],
    }
  );
  expect(normaliser(".draupnir ban")).toBe("draupnir ban");
  expect(normaliser(".ban @foo:localhost:9999 coc spam")).toBe(
    "draupnir ban @foo:localhost:9999 coc spam"
  );
  expect(normaliser(".mjolnir ban @foo:localhost:9999 coc spam")).toBe(
    "draupnir ban @foo:localhost:9999 coc spam"
  );
  expect(normaliser("Draupnir: ban")).toBe("draupnir ban");
  expect(normaliser(".list create coc coc")).toBe(
    "draupnir list create coc coc"
  );
});
