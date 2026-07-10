// SPDX-FileCopyrightText: 2026 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

declare const ProjectionDescriptionShape: unique symbol;

export type ProjectionPartitionKeys = readonly string[];

export interface ProjectionDescription<
  TInputs extends readonly unknown[] = readonly unknown[],
  TDownstreamDeltaShape = unknown,
  TAccessMixin = Record<never, never>,
  TPartitionKeys extends ProjectionPartitionKeys = ProjectionPartitionKeys,
> {
  readonly name: string;
  readonly partitionKeys: TPartitionKeys;
  readonly [ProjectionDescriptionShape]?: {
    readonly inputs: TInputs;
    readonly downstreamDeltaShape: TDownstreamDeltaShape;
    readonly accessMixin: TAccessMixin;
  };
}

export type AnyProjectionDescription = ProjectionDescription;

type ProjectionDescriptionRuntime<
  TName extends string,
  TPartitionKeys extends ProjectionPartitionKeys,
> = {
  readonly name: TName;
  readonly partitionKeys: TPartitionKeys;
};

export type ProjectionDescriptionBuilder<
  TName extends string,
  TPartitionKeys extends ProjectionPartitionKeys,
  TInputs extends readonly unknown[] = readonly unknown[],
  TDownstreamDeltaShape = unknown,
  TAccessMixin = Record<never, never>,
> = {
  withInputs<
    TNextInputs extends readonly unknown[],
  >(): ProjectionDescriptionBuilder<
    TName,
    TPartitionKeys,
    TNextInputs,
    TDownstreamDeltaShape,
    TAccessMixin
  >;
  withDownstreamDeltaShape<
    TNextDownstreamDeltaShape,
  >(): ProjectionDescriptionBuilder<
    TName,
    TPartitionKeys,
    TInputs,
    TNextDownstreamDeltaShape,
    TAccessMixin
  >;
  withAccessMixin<TNextAccessMixin>(): ProjectionDescriptionBuilder<
    TName,
    TPartitionKeys,
    TInputs,
    TDownstreamDeltaShape,
    TNextAccessMixin
  >;
  build(): ProjectionDescription<
    TInputs,
    TDownstreamDeltaShape,
    TAccessMixin,
    TPartitionKeys
  > & {
    readonly name: TName;
  };
};

function makeProjectionDescriptionBuilder<
  TName extends string,
  TPartitionKeys extends ProjectionPartitionKeys,
  TInputs extends readonly unknown[] = readonly unknown[],
  TDownstreamDeltaShape = unknown,
  TAccessMixin = Record<never, never>,
>(
  description: ProjectionDescriptionRuntime<TName, TPartitionKeys>
): ProjectionDescriptionBuilder<
  TName,
  TPartitionKeys,
  TInputs,
  TDownstreamDeltaShape,
  TAccessMixin
> {
  return {
    withInputs<TNextInputs extends readonly unknown[]>() {
      return makeProjectionDescriptionBuilder<
        TName,
        TPartitionKeys,
        TNextInputs,
        TDownstreamDeltaShape,
        TAccessMixin
      >(description);
    },
    withDownstreamDeltaShape<TNextDownstreamDeltaShape>() {
      return makeProjectionDescriptionBuilder<
        TName,
        TPartitionKeys,
        TInputs,
        TNextDownstreamDeltaShape,
        TAccessMixin
      >(description);
    },
    withAccessMixin<TNextAccessMixin>() {
      return makeProjectionDescriptionBuilder<
        TName,
        TPartitionKeys,
        TInputs,
        TDownstreamDeltaShape,
        TNextAccessMixin
      >(description);
    },
    build() {
      return description;
    },
  };
}

export function describeProjection<
  const TName extends string,
  const TPartitionKeys extends ProjectionPartitionKeys,
>({
  name,
  partitionKeys,
}: {
  readonly name: TName;
  readonly partitionKeys: TPartitionKeys;
}): ProjectionDescriptionBuilder<TName, TPartitionKeys> {
  return makeProjectionDescriptionBuilder<TName, TPartitionKeys>({
    name,
    partitionKeys,
  });
}

export type ExtractProjectionDescriptionInputs<
  TDescription extends AnyProjectionDescription,
> =
  TDescription extends ProjectionDescription<
    infer TInputs,
    infer _TDownstreamDeltaShape,
    infer _TAccessMixin,
    infer _TPartitionKeys
  >
    ? TInputs
    : never;

export type ExtractProjectionDescriptionDeltaShape<
  TDescription extends AnyProjectionDescription,
> =
  TDescription extends ProjectionDescription<
    infer _TInputs,
    infer TDownstreamDeltaShape,
    infer _TAccessMixin,
    infer _TPartitionKeys
  >
    ? TDownstreamDeltaShape
    : never;

export type ExtractProjectionDescriptionAccessMixin<
  TDescription extends AnyProjectionDescription,
> =
  TDescription extends ProjectionDescription<
    infer _TInputs,
    infer _TDownstreamDeltaShape,
    infer TAccessMixin,
    infer _TPartitionKeys
  >
    ? TAccessMixin
    : never;

export type ExtractProjectionDescriptionPartitionKeys<
  TDescription extends AnyProjectionDescription,
> =
  TDescription extends ProjectionDescription<
    infer _TInputs,
    infer _TDownstreamDeltaShape,
    infer _TAccessMixin,
    infer TPartitionKeys
  >
    ? TPartitionKeys
    : never;

export type ProjectionPartition<
  TDescription extends AnyProjectionDescription = AnyProjectionDescription,
> = {
  readonly [Key in ExtractProjectionDescriptionPartitionKeys<TDescription>[number]]: string;
};
