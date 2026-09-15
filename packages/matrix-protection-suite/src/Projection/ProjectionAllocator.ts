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
import {
  AllocatableLifetime,
  Disposable,
  StandardLifetime,
} from "../Interface/Lifetime";
import { SemanticType } from "../Interface/SemanticType";

export type DisposableProjection<TProjection extends Projection = Projection> =
  TProjection & Disposable;

export type ProjectionDescriptionFor<TProjection extends Projection> =
  ExtractProjectionNode<TProjection> extends ProjectionNode<infer TDescription>
    ? TDescription
    : never;

/**
 * Constructs registered projections and allocates them against a supplied lifetime.
 *
 * The allocator exists because currently we can't make a global orchestrator
 * own projections while there are context specific dependencies required by
 * the projection, specifically dependencies that are't invariant between protected
 * room set instances, such as legacy revision issuers, as opposed to the draupnir
 * user ID.
 */
export interface ProjectionAllocator<Context = unknown> {
  registerProjection<TProjection extends DisposableProjection>(
    description: ProjectionDescriptionFor<TProjection>,
    factory: (
      context: Context,
      partition: ProjectionPartition<ProjectionDescriptionFor<TProjection>>
    ) => Result<TProjection>
  ): this;

  allocate<TProjection extends DisposableProjection>(
    lifetime: AllocatableLifetime,
    context: Context,
    description: ProjectionDescriptionFor<TProjection>,
    partition: ProjectionPartition<ProjectionDescriptionFor<TProjection>>
  ): Result<TProjection>;
}

export const ProjectionAllocator = SemanticType<ProjectionAllocator>(
  "ProjectionAllocator"
)
  .declare({
    allocation: {
      what: "allocator can allocate registered projections",
      why: "allows callers to construct projections without depending on their concrete implementations",
    },
    lifetimeOwnership: {
      what: "allocated projections are owned by the supplied lifetime",
      why: "ensures projection resources are disposed with their caller",
    },
    freshAllocation: {
      what: "each allocation invokes the registered projection factory",
      why: "keeps projection identity and ownership independent between callers",
    },
    failWhenLifetimeInDisposal: {
      what: "allocation fails without invoking the projection factory when the supplied lifetime is in disposal",
      why: "prevents projections from being created without an owner that can dispose them",
    },
    canonicalDescription: {
      what: "only the projection description registered with a factory can be used to allocate that projection",
      why: "prevents a different description with the same name from selecting a factory with an incompatible partition schema",
    },
    factoryFailure: {
      what: "an error returned by a projection factory is returned by allocation",
      why: "allows callers to handle projection construction failures without receiving a partially allocated projection",
    },
    failWhenNotRegistered: {
      what: "allocating a projection that is unregistered fails early and errors",
      why: "prevents mistakes where the wrong projection is requested or registration code is forgotten",
    },
    partitionIsEssential: {
      what: "allocating a projection requires its partition information",
      why: "prevents leaking projections to the wrong code and catches bugs early",
    },
    failWhenUnexpectedPartition: {
      what: "allocating a projection fails if extra or unexpected partition data is provided",
      why: "prevents accidentally leaking projections to the wrong code and catches the problem early",
    },
  })
  .verify({
    async allocation(makeSubject) {
      const allocator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticTestProjection",
        partitionKeys: ["roomID"],
      }).build();
      type TestProjection = DisposableProjection<
        Projection<ProjectionNode<typeof description>>
      >;
      const projection = {
        [Symbol.dispose]() {
          // nothing to dispose.
        },
      } as TestProjection;
      const context = { source: "semantic context" };
      allocator.registerProjection<TestProjection>(
        description,
        (factoryContext, partition) => {
          expect(factoryContext).toBe(context);
          expect(partition.roomID).toBe("!room:example.org");
          return Ok(projection);
        }
      );
      await using lifetime = new StandardLifetime();
      const result = allocator.allocate<TestProjection>(
        lifetime,
        context,
        description,
        {
          roomID: "!room:example.org",
        }
      );
      expect(result.expect("Projection allocation should succeed")).toBe(
        projection
      );
    },
    async lifetimeOwnership(makeSubject) {
      const allocator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticLifetimeProjection",
        partitionKeys: [],
      }).build();
      type TestProjection = DisposableProjection<
        Projection<ProjectionNode<typeof description>>
      >;
      let disposalCount = 0;
      allocator.registerProjection<TestProjection>(description, () => {
        return Ok({
          [Symbol.dispose]() {
            disposalCount += 1;
          },
        } as TestProjection);
      });
      {
        await using lifetime = new StandardLifetime();
        allocator
          .allocate<TestProjection>(lifetime, {}, description, {})
          .expect("Projection allocation should succeed");
      }
      expect(disposalCount).toBe(1);
    },
    async freshAllocation(makeSubject) {
      const allocator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticFreshProjection",
        partitionKeys: [],
      }).build();
      type TestProjection = DisposableProjection<
        Projection<ProjectionNode<typeof description>>
      >;
      let allocationCount = 0;
      allocator.registerProjection<TestProjection>(description, () => {
        allocationCount += 1;
        return Ok({ [Symbol.dispose]() {} } as TestProjection);
      });
      await using lifetime = new StandardLifetime();
      const first = allocator
        .allocate<TestProjection>(lifetime, {}, description, {})
        .expect("First projection allocation should succeed");
      const second = allocator
        .allocate<TestProjection>(lifetime, {}, description, {})
        .expect("Second projection allocation should succeed");
      expect(first).not.toBe(second);
      expect(allocationCount).toBe(2);
    },
    async failWhenLifetimeInDisposal(makeSubject) {
      const allocator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticDisposedLifetimeProjection",
        partitionKeys: [],
      }).build();
      type TestProjection = DisposableProjection<
        Projection<ProjectionNode<typeof description>>
      >;
      let factoryInvocations = 0;
      allocator.registerProjection<TestProjection>(description, () => {
        factoryInvocations += 1;
        return Ok({ [Symbol.dispose]() {} } as TestProjection);
      });
      const lifetime = new StandardLifetime();
      await lifetime[Symbol.asyncDispose]();
      const result = allocator.allocate<TestProjection>(
        lifetime,
        {},
        description,
        {}
      );
      expect(isError(result)).toBe(true);
      expect(factoryInvocations).toBe(0);
    },
    async canonicalDescription(makeSubject) {
      const allocator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticCanonicalProjection",
        partitionKeys: ["roomID"],
      }).build();
      const equivalentDescription = describeProjection({
        name: "SemanticCanonicalProjection",
        partitionKeys: ["roomID"],
      }).build();
      type TestProjection = DisposableProjection<
        Projection<ProjectionNode<typeof description>>
      >;
      allocator.registerProjection<TestProjection>(description, () =>
        Ok({ [Symbol.dispose]() {} } as TestProjection)
      );
      await using lifetime = new StandardLifetime();
      const result = allocator.allocate<TestProjection>(
        lifetime,
        {},
        equivalentDescription,
        { roomID: "!room:example.org" }
      );
      expect(isError(result)).toBe(true);
    },
    async factoryFailure(makeSubject) {
      const allocator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticFailingFactoryProjection",
        partitionKeys: [],
      }).build();
      type TestProjection = DisposableProjection<
        Projection<ProjectionNode<typeof description>>
      >;
      const factoryError = ResultError.Result("Projection creation failed");
      allocator.registerProjection<TestProjection>(
        description,
        () => factoryError
      );
      await using lifetime = new StandardLifetime();
      const result = allocator.allocate<TestProjection>(
        lifetime,
        {},
        description,
        {}
      );
      expect(result).toBe(factoryError);
    },
    async failWhenNotRegistered(makeSubject) {
      const allocator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticUnregisteredProjection",
        partitionKeys: ["roomID"],
      }).build();
      type TestProjection = DisposableProjection<
        Projection<ProjectionNode<typeof description>>
      >;
      await using lifetime = new StandardLifetime();
      const result = allocator.allocate<TestProjection>(
        lifetime,
        {},
        description,
        {
          roomID: "!room:example.org",
        }
      );
      expect(isError(result)).toBe(true);
    },
    async partitionIsEssential(makeSubject) {
      const allocator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticRequiredPartitionProjection",
        partitionKeys: ["roomID"],
      }).build();
      type TestProjection = DisposableProjection<
        Projection<ProjectionNode<typeof description>>
      >;
      await using lifetime = new StandardLifetime();
      const result = allocator.allocate<TestProjection>(
        lifetime,
        {},
        description,
        {} as never
      );
      expect(isError(result)).toBe(true);
    },
    async failWhenUnexpectedPartition(makeSubject) {
      const allocator = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const description = describeProjection({
        name: "SemanticUnexpectedPartitionProjection",
        partitionKeys: ["roomID"],
      }).build();
      type TestProjection = DisposableProjection<
        Projection<ProjectionNode<typeof description>>
      >;
      await using lifetime = new StandardLifetime();
      const result = allocator.allocate<TestProjection>(
        lifetime,
        {},
        description,
        {
          roomID: "!room:example.org",
          unknownKey: "value",
        } as never
      );
      expect(isError(result)).toBe(true);
    },
  });

type AnyProjectionFactory<Context> = (
  context: Context,
  partition: ProjectionPartition
) => Result<DisposableProjection>;

function validateProjectionPartition(
  description: AnyProjectionDescription,
  partition: ProjectionPartition
): Result<void> {
  const expectedKeys = new Set(description.partitionKeys);
  const unexpectedKey = Object.keys(partition).find(
    (key) => !expectedKeys.has(key)
  );
  if (unexpectedKey !== undefined) {
    return ResultError.Result(
      `Partition for projection ${description.name} has unexpected key ${unexpectedKey}`
    );
  }
  const missingKey = description.partitionKeys.find(
    (key) => partition[key] === undefined
  );
  if (missingKey !== undefined) {
    return ResultError.Result(
      `Partition for projection ${description.name} is missing key ${missingKey}`
    );
  }
  return Ok(undefined);
}

export class StandardProjectionAllocator<
  Context = unknown,
> implements ProjectionAllocator<Context> {
  private readonly factories = new Map<
    AnyProjectionDescription,
    AnyProjectionFactory<Context>
  >();
  private readonly registeredNames = new Set<string>();

  public registerProjection<TProjection extends DisposableProjection>(
    description: ProjectionDescriptionFor<TProjection>,
    factory: (
      context: Context,
      partition: ProjectionPartition<ProjectionDescriptionFor<TProjection>>
    ) => Result<TProjection>
  ): this {
    if (this.registeredNames.has(description.name)) {
      throw new TypeError(
        `There is already a projection registered with the name ${description.name}`
      );
    }
    this.registeredNames.add(description.name);
    this.factories.set(
      description,
      factory as unknown as AnyProjectionFactory<Context>
    );
    return this;
  }

  public allocate<TProjection extends DisposableProjection>(
    lifetime: AllocatableLifetime,
    context: Context,
    description: ProjectionDescriptionFor<TProjection>,
    partition: ProjectionPartition<ProjectionDescriptionFor<TProjection>>
  ): Result<TProjection> {
    return lifetime.allocateDisposable(() => {
      const validationResult = validateProjectionPartition(
        description,
        partition
      );
      if (isError(validationResult)) {
        return validationResult;
      }
      const factory = this.factories.get(description);
      if (factory === undefined) {
        return ResultError.Result(
          `No projection factory registered for the supplied ${description.name} description`
        );
      }
      return factory(context, partition) as Result<TProjection>;
    });
  }
}
