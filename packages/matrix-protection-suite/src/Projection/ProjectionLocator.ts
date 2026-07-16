// SPDX-FileCopyrightText: 2026 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok, Result, ResultError, isError } from "@gnuxie/typescript-result";
import {
  AnyProjectionDescription,
  ProjectionPartition,
  describeProjection,
} from "./ProjectionDescription";
import { ExtractProjectionNode, Projection } from "./Projection";
import { ProjectionNode } from "./ProjectionNode";
import { Disposable } from "../Interface/Lifetime";
import { SemanticType } from "../Interface/SemanticType";

export type DisposableProjection<TProjection extends Projection = Projection> =
  TProjection & Disposable;

export type ProjectionDescriptionFor<TProjection extends Projection> =
  ExtractProjectionNode<TProjection> extends ProjectionNode<infer TDescription>
    ? TDescription
    : never;

export type ProjectionLocation<
  TProjectionDescription extends AnyProjectionDescription =
    AnyProjectionDescription,
> = {
  readonly description: TProjectionDescription;
  readonly partition: ProjectionPartition<TProjectionDescription>;
};

export type ProjectionProviderDescription<
  Context = unknown,
  TProjectionDescription extends AnyProjectionDescription =
    AnyProjectionDescription,
  TProjection extends Projection = Projection,
> = {
  readonly projectionDescription: TProjectionDescription;
  factory(
    context: Context,
    location: ProjectionLocation<TProjectionDescription>
  ): Result<TProjection>;
};

// FIXME: We need to be able to attenuate locators to specific
// draupnir instances for internal code/security defence in depth (mostly
// to prevent mistakes).
export interface ProjectionLocator<Context = unknown> {
  registerProjection<TProjection extends Projection>(
    provider: ProjectionProviderDescription<
      Context,
      ProjectionDescriptionFor<TProjection>,
      TProjection
    >
  ): this;

  locate<TProjection extends Projection>(
    location: ProjectionLocation<ProjectionDescriptionFor<TProjection>>
  ): Result<TProjection>;
}

export const ProjectionLocator = SemanticType<ProjectionLocator>(
  "ProjectionLocator"
)
  .declare({
    location: {
      what: "locator can locate registered projections and return them",
      why: "allows the orchestrator to own projections rather than draupnir instances",
    },
    failWhenNotLocated: {
      what: "locating a projection that is unregistered fails early and errors",
      why: "prevents mistakes where the wrong projection is sought or registration code is forgotten",
    },
    partitionIsEssential: {
      what: "locating a projection requires the partition information to be provided",
      why: "prevents leaking projections to the wrong code and catches bugs early",
    },
    failWhenUnexpectedPartition: {
      what: "locating a projection fails if extra or unexpected partition data is provided",
      why: "prevents accidentally leaking projections to the wrong code (security issue) and catches the problem early",
    },
  })
  .verify({
    async location(makeSubject) {
      const locator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticTestProjection",
        partitionKeys: ["roomID"],
      }).build();
      type TestProjection = Projection<ProjectionNode<typeof description>>;
      const projection = {} as TestProjection;
      locator.registerProjection<TestProjection>({
        projectionDescription: description,
        factory(_context, location) {
          expect(location.partition.roomID).toBe("!room:example.org");
          return Ok(projection);
        },
      });
      const result = locator.locate<TestProjection>({
        description,
        partition: {
          roomID: "!room:example.org",
        },
      });
      expect(result.expect("Projection location should succeed")).toBe(
        projection
      );
    },
    async failWhenNotLocated(makeSubject) {
      const locator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticTestProjection",
        partitionKeys: ["roomID"],
      }).build();
      type TestProjection = Projection<ProjectionNode<typeof description>>;
      const result = locator.locate<TestProjection>({
        description,
        partition: {
          roomID: "!room:example.org",
        },
      });
      expect(isError(result)).toBe(true);
    },
    async partitionIsEssential(makeSubject) {
      const locator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticTestProjection",
        partitionKeys: ["roomID"],
      }).build();
      type TestProjection = Projection<ProjectionNode<typeof description>>;
      const result = locator.locate<TestProjection>({
        description,
        partition: {},
      } as never);
      expect(isError(result)).toBe(true);
    },
    async failWhenUnexpectedPartition(makeSubject) {
      const locator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticTestProjection",
        partitionKeys: ["roomID"],
      }).build();
      type TestProjection = Projection<ProjectionNode<typeof description>>;
      const result = locator.locate<TestProjection>({
        description,
        partition: {
          roomID: "!room:example.org",
          unknownKey: "value",
        },
      } as never);
      expect(isError(result)).toBe(true);
    },
  });

type AnyProjectionProviderDescription<Context> =
  ProjectionProviderDescription<Context>;

function validateProjectionLocation(
  location: ProjectionLocation
): Result<void> {
  const expectedKeys = new Set(location.description.partitionKeys);
  const unexpectedKey = Object.keys(location.partition).find(
    (key) => !expectedKeys.has(key)
  );
  if (unexpectedKey !== undefined) {
    return ResultError.Result(
      `Projection location for ${location.description.name} has unexpected partition key ${unexpectedKey}`
    );
  }
  const missingKey = location.description.partitionKeys.find(
    (key) => location.partition[key] === undefined
  );
  if (missingKey !== undefined) {
    return ResultError.Result(
      `Projection location for ${location.description.name} is missing partition key ${missingKey}`
    );
  }
  return Ok(undefined);
}

export class StandardProjectionLocator<
  Context = unknown,
> implements ProjectionLocator<Context> {
  private readonly providers = new Map<
    string,
    AnyProjectionProviderDescription<Context>
  >();

  public constructor(
    private readonly context: Context,
    providers: readonly AnyProjectionProviderDescription<Context>[] = []
  ) {
    for (const provider of providers) {
      this.registerProjection(provider);
    }
  }

  public registerProjection<TProjection extends Projection>(
    provider: ProjectionProviderDescription<
      Context,
      ProjectionDescriptionFor<TProjection>,
      TProjection
    >
  ): this {
    if (this.providers.has(provider.projectionDescription.name)) {
      throw new TypeError(
        `There is already a projection registered with the name ${provider.projectionDescription.name}`
      );
    }
    this.providers.set(
      provider.projectionDescription.name,
      provider as unknown as AnyProjectionProviderDescription<Context>
    );
    return this;
  }

  public locate<TProjection extends Projection>(
    location: ProjectionLocation<ProjectionDescriptionFor<TProjection>>
  ): Result<TProjection> {
    const validationResult = validateProjectionLocation(location);
    if (isError(validationResult)) {
      return validationResult;
    }
    const provider = this.providers.get(location.description.name);
    if (provider === undefined) {
      return ResultError.Result(
        `No projection registered with the name ${location.description.name}`
      );
    }
    return provider.factory(this.context, location) as Result<TProjection>;
  }
}
