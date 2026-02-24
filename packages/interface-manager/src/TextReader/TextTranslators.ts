// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describeTranslator } from "../Command/PresentationTypeTranslator";
import { TextPresentationRenderer } from "./TextPresentationRenderer";
import {
  BooleanPresentationType,
  MatrixEventReferencePresentationType,
  MatrixRoomAliasPresentationType,
  MatrixRoomIDPresentationType,
  MatrixUserIDPresentationType,
  NumberPresentationType,
  StringPresentationType,
} from "./TextPresentationTypes";

export const StringFromNumberTranslator = describeTranslator(
  StringPresentationType,
  NumberPresentationType,
  function (from) {
    return StringPresentationType.wrap(from.object.toString());
  }
);

export const StringfromBooleanTranslator = describeTranslator(
  StringPresentationType,
  BooleanPresentationType,
  function (from) {
    return StringPresentationType.wrap(TextPresentationRenderer.render(from));
  }
);

export const StringFromMatrixRoomIDTranslator = describeTranslator(
  StringPresentationType,
  MatrixRoomIDPresentationType,
  function (from) {
    return StringPresentationType.wrap(from.object.toString());
  }
);

export const StringFromMatrixRoomAliasTranslator = describeTranslator(
  StringPresentationType,
  MatrixRoomAliasPresentationType,
  function (from) {
    return StringPresentationType.wrap(from.object.toString());
  }
);

export const StringFromMatrixUserIDTranslator = describeTranslator(
  StringPresentationType,
  MatrixUserIDPresentationType,
  function (from) {
    return StringPresentationType.wrap(from.object.toString());
  }
);

export const StringFromMatrixEventReferenceTranslator = describeTranslator(
  StringPresentationType,
  MatrixEventReferencePresentationType,
  function (from) {
    return StringPresentationType.wrap(
      `${from.object.reference.toPermalink()}/${from.object.eventID}`
    );
  }
);
