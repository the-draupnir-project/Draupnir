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
