// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import {
  MatrixEventReference,
  MatrixEventViaAlias,
  MatrixEventViaRoomID,
  MatrixRoomAlias,
  MatrixRoomID,
  MatrixUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { Presentation, definePresentationType } from "../Command/Presentation";
import { Keyword } from "../Command/Keyword";
import { TextPresentationRenderer } from "./TextPresentationRenderer";
import { union } from "../Command/PresentationSchema";

/**
 * If you are wondering why commands specify on presentation type and not
 * their actual type, then imagine that you have a a presentation type
 * for a person's name, and you render that in handwriting.
 * The person's name is really just a string, and it'd be wrong to be able to
 * get any string with that command as a name. OTOH, I don't really see the
 * point in that? WHy not just make a real type for a person's name?
 */

export const StringPresentationType = definePresentationType({
  name: "string",
  validator: function (value): value is string {
    return typeof value === "string";
  },
  wrap(string: string): Presentation<string> {
    return Object.freeze({
      object: string,
      presentationType: StringPresentationType,
    });
  },
});

TextPresentationRenderer.registerPresentationRenderer<string>(
  StringPresentationType,
  function (presentation) {
    return presentation.object;
  }
);

export const NumberPresentationType = definePresentationType({
  name: "number",
  validator: function (value): value is number {
    return typeof value === "number";
  },
  wrap(number: number): Presentation<number> {
    return Object.freeze({
      object: number,
      presentationType: NumberPresentationType,
    });
  },
});

TextPresentationRenderer.registerPresentationRenderer<number>(
  NumberPresentationType,
  function (presentation) {
    return presentation.object.toString();
  }
);

export const BooleanPresentationType = definePresentationType({
  name: "boolean",
  validator: function (value): value is boolean {
    return typeof value === "boolean";
  },
  wrap(boolean: boolean): Presentation<boolean> {
    return Object.freeze({
      object: boolean,
      presentationType: BooleanPresentationType,
    });
  },
});

TextPresentationRenderer.registerPresentationRenderer<boolean>(
  BooleanPresentationType,
  function (presentation) {
    return presentation.object ? "true" : "false";
  }
);

export const KeywordPresentationType = definePresentationType({
  name: "Keyword",
  validator: function (value): value is Keyword {
    return value instanceof Keyword;
  },
  wrap(keyword: Keyword): Presentation<Keyword> {
    return Object.freeze({
      object: keyword,
      presentationType: KeywordPresentationType,
    });
  },
});

TextPresentationRenderer.registerPresentationRenderer<Keyword>(
  KeywordPresentationType,
  function (presetnation) {
    return `--${presetnation.object.designator}`;
  }
);

export const MatrixRoomIDPresentationType = definePresentationType({
  name: "MatrixRoomID",
  validator: function (value): value is MatrixRoomID {
    return value instanceof MatrixRoomID;
  },
  wrap(roomID: MatrixRoomID): Presentation<MatrixRoomID> {
    return Object.freeze({
      object: roomID,
      presentationType: MatrixRoomIDPresentationType,
    });
  },
});

TextPresentationRenderer.registerPresentationRenderer<MatrixRoomID>(
  MatrixRoomIDPresentationType,
  function (presentation) {
    return presentation.object.toRoomIDOrAlias();
  }
);

export const MatrixRoomAliasPresentationType = definePresentationType({
  name: "MatrixRoomAlias",
  validator: function (value): value is MatrixRoomAlias {
    return value instanceof MatrixRoomAlias;
  },
  wrap(alias: MatrixRoomAlias): Presentation<MatrixRoomAlias> {
    return Object.freeze({
      object: alias,
      presentationType: MatrixRoomAliasPresentationType,
    });
  },
});

TextPresentationRenderer.registerPresentationRenderer<MatrixRoomAlias>(
  MatrixRoomAliasPresentationType,
  function (presentation) {
    return presentation.object.toRoomIDOrAlias();
  }
);

export const MatrixRoomReferencePresentationSchema = union(
  MatrixRoomIDPresentationType,
  MatrixRoomAliasPresentationType
);

export const MatrixUserIDPresentationType = definePresentationType({
  name: "MatrixUserID",
  validator: function (value): value is MatrixUserID {
    return value instanceof MatrixUserID;
  },
  wrap(userID: MatrixUserID): Presentation<MatrixUserID> {
    return Object.freeze({
      object: userID,
      presentationType: MatrixUserIDPresentationType,
    });
  },
});

TextPresentationRenderer.registerPresentationRenderer<MatrixUserID>(
  MatrixUserIDPresentationType,
  function (presentation) {
    return presentation.object.toString();
  }
);

export const MatrixEventReferencePresentationType = definePresentationType({
  name: "MatrixEventReference",
  validator: function (value): value is MatrixEventReference {
    return (
      value instanceof MatrixEventViaAlias ||
      value instanceof MatrixEventViaRoomID
    );
  },
  wrap(event: MatrixEventReference): Presentation<MatrixEventReference> {
    return Object.freeze({
      object: event,
      presentationType: MatrixEventReferencePresentationType,
    });
  },
});

export function makeMatrixEventReferencePresentation(
  value: MatrixEventReference
): Presentation<MatrixEventReference> {
  return Object.freeze({
    object: value,
    presentationType: MatrixEventReferencePresentationType,
  });
}

TextPresentationRenderer.registerPresentationRenderer<MatrixEventReference>(
  MatrixEventReferencePresentationType,
  function (presentation) {
    return `${presentation.object.reference.toPermalink()}/${presentation.object.eventID}`;
  }
);
