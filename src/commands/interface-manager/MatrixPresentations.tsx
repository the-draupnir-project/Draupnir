// Copyright 2022-2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { ReadItem } from "./CommandReader";
import {
  findPresentationType,
  makePresentationType,
  simpleTypeValidator,
} from "./ParameterParsing";
import { definePresentationRenderer } from "./DeadDocumentPresentation";
import { DeadDocumentJSX } from "./JSXFactory";
import { DocumentNode } from "./DeadDocument";
import {
  MatrixEventViaAlias,
  MatrixEventViaRoomID,
  MatrixRoomAlias,
  MatrixRoomID,
  MatrixRoomReference,
  MatrixUserID,
} from "@the-draupnir-project/matrix-basic-types";

makePresentationType({
  name: "MatrixUserID",
  validator: simpleTypeValidator(
    "MatrixUserID",
    (item: ReadItem) => item instanceof MatrixUserID
  ),
});

makePresentationType({
  name: "MatrixRoomReference",
  validator: simpleTypeValidator(
    "MatrixRoomReference",
    (item: ReadItem) =>
      item instanceof MatrixRoomID || item instanceof MatrixRoomAlias
  ),
});

definePresentationRenderer(
  findPresentationType("MatrixRoomReference"),
  function (presentation: MatrixRoomReference): DocumentNode {
    return (
      <a href={presentation.toPermalink()}>{presentation.toRoomIDOrAlias()}</a>
    );
  }
);

makePresentationType({
  name: "MatrixRoomID",
  validator: simpleTypeValidator(
    "MatrixRoomID",
    (item: ReadItem) => item instanceof MatrixRoomID
  ),
});

makePresentationType({
  name: "MatrixRoomAlias",
  validator: simpleTypeValidator(
    "MatrixRoomAlias",
    (item: ReadItem) => item instanceof MatrixRoomAlias
  ),
});

// Wouldn't this be better as a custom document node so that we could render the plain text version differently?
definePresentationRenderer(
  findPresentationType("MatrixUserID"),
  function (presentation: MatrixUserID): DocumentNode {
    return (
      <a href={`https://matrix.to/#/${presentation.toString()}`}>
        {presentation.toString()}
      </a>
    );
  }
);

makePresentationType({
  name: "MatrixEventReference",
  validator: simpleTypeValidator(
    "MatrixEventReference",
    (item) =>
      item instanceof MatrixEventViaAlias ||
      item instanceof MatrixEventViaRoomID
  ),
});
