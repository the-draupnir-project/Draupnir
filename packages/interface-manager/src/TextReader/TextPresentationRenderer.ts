// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import {
  Presentation,
  PresentationType,
  PresentationTypeWithoutWrap,
} from "../Command";

export type TextPresentationRenderFunction<ObjectType = unknown> = (
  presentation: Presentation<ObjectType>
) => string;

export type TextPresentationRenderer = {
  registerPresentationRenderer<ObjectType>(
    type: PresentationType<ObjectType>,
    renderFunction: TextPresentationRenderFunction<ObjectType>
  ): TextPresentationRenderer;
  findPresentationRenderer(
    type: PresentationType
  ): TextPresentationRenderFunction | undefined;
  render(presentation: Presentation): string;
  // Technically we should have a present method like this:
  // `present<ObjectType = unknown>(type: PresentationType<ObjectType>, object: ObjectType): Presentation<ObjectType>;`
  // rather than the constructors found in `TextPresentationTypes.ts`.
};

const TEXT_PRESENTATION_RENDERERS = new Map<
  PresentationTypeWithoutWrap,
  TextPresentationRenderFunction
>();

export const TextPresentationRenderer: TextPresentationRenderer = Object.freeze(
  {
    registerPresentationRenderer<ObjectType>(
      type: PresentationType<ObjectType>,
      renderFunction: TextPresentationRenderFunction<ObjectType>
    ) {
      if (TEXT_PRESENTATION_RENDERERS.has(type as PresentationType)) {
        throw new TypeError(
          `There is already a text renderer registered for the presentation type ${type.name}`
        );
      }
      TEXT_PRESENTATION_RENDERERS.set(
        type as PresentationType,
        renderFunction as TextPresentationRenderFunction
      );
      return this;
    },
    findPresentationRenderer(
      type: PresentationTypeWithoutWrap
    ): TextPresentationRenderFunction | undefined {
      return TEXT_PRESENTATION_RENDERERS.get(type);
    },
    render(presentation: Presentation): string {
      const renderer = this.findPresentationRenderer(
        presentation.presentationType
      );
      if (renderer === undefined) {
        throw new TypeError(
          `Render is being called for the presentation type ${presentation.presentationType.name} but no renderer has been registered for this type`
        );
      }
      return renderer(presentation);
    },
  }
);
