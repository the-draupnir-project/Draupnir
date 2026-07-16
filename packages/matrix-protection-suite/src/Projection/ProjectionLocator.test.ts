// SPDX-FileCopyrightText: 2026 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok } from "@gnuxie/typescript-result";
import { Projection } from "./Projection";
import { describeProjection } from "./ProjectionDescription";
import {
  ProjectionLocator,
  StandardProjectionLocator,
} from "./ProjectionLocator";
import { ProjectionNode } from "./ProjectionNode";

const TestProjectionDescription = describeProjection({
  name: "TestProjection",
  partitionKeys: ["roomID"],
}).build();

type TestProjectionDescription = typeof TestProjectionDescription;
type TestProjectionNode = ProjectionNode<TestProjectionDescription>;
type TestProjection = Projection<TestProjectionNode>;

test("ProjectionLocator semantics are implemented by the standard locator", async () => {
  await ProjectionLocator.check(async () => {
    return Ok(new StandardProjectionLocator({}));
  });
});

test("passes the constructor context to the projection provider", () => {
  const context = { source: "context" };
  const projection = {} as TestProjection;
  const locator = new StandardProjectionLocator(
    context
  ).registerProjection<TestProjection>({
    projectionDescription: TestProjectionDescription,
    factory(providerContext, location) {
      expect(providerContext).toBe(context);
      expect(location.partition.roomID).toBe("!room:example.org");
      return Ok(projection);
    },
  });
  const result = locator.locate<TestProjection>({
    description: TestProjectionDescription,
    partition: {
      roomID: "!room:example.org",
    },
  });
  expect(result.expect("Projection location should succeed")).toBe(projection);
});
