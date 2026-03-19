// Copyright 2022 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { ActionResult } from "../Interface/Action";
import { RoomEvent } from "../MatrixTypes/Events";
import { PolicyListRevision } from "../PolicyList/PolicyListRevision";
import { PolicyRuleChange } from "../PolicyList/PolicyRuleChange";
import { EventReport } from "../Reporting/EventReport";
import { MembershipChange } from "../Membership/MembershipChange";
import { RoomMembershipRevision } from "../Membership/MembershipRevision";
import {
  RoomStateRevision,
  StateChange,
} from "../StateTracking/StateRevisionIssuer";
import { ProtectedRoomsSet } from "./ProtectedRoomsSet";
import {
  CapabilityInterfaceSet,
  CapabilityProviderSet,
  CapabilitySet,
  GenericCapabilityDescription,
  capabilitySetEventPermissions,
  capabilitySetPermissions,
  capabilitySetStatePermissions,
} from "./Capability/CapabilitySet";
import { findCapabilityInterfaceSet } from "./Capability/CapabilityInterface";
import { findCapabilityProviderSet } from "./Capability/CapabilityProvider";
import { PowerLevelPermission } from "../Client/PowerLevelsMirror";
import { MembershipEvent } from "../MatrixTypes/MembershipEvent";
import {
  MatrixRoomID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  ConfigDescription,
  StandardConfigDescription,
  UnknownConfig,
} from "../Config/ConfigDescription";
import { TObject, Type } from "@sinclair/typebox";
import { EDStatic } from "../Interface/Static";
import {
  SetMembershipDelta,
  SetMembershipRevision,
} from "../Membership/SetMembershipRevision";
import {
  MembershipPolicyRevisionDelta,
  SetMembershipPolicyRevision,
} from "../MembershipPolicies/MembershipPolicyRevision";
import { EventWithMixins } from "../SafeMatrixEvents/EventMixinExtraction/EventMixinExtraction";
import { AllocatableLifetime, OwnLifetime } from "../Interface/Lifetime";
import { Ok, Result } from "@gnuxie/typescript-result";
import { ExtractProjectionNode, Projection } from "../Projection/Projection";
import {
  AnyProjectionNode,
  ExtractDeltaShape,
} from "../Projection/ProjectionNode";

/**
 * @param description The description for the protection being constructed.
 * @param consequenceProvider The consequence provider that should be used for this protection.
 * @param protectedRoomsSet The protected rooms that the constructed protection will reside within
 * and be informed of events within.
 * @param context This is a client specified argument, for example the draupnir project
 * will use the Draupnir instance that the `ProtectedRoomsSet` resides within here.
 * Not necessary and use should be avoided.
 * @param settings The settings for this protection as fetched from a persistent store or
 * the description's default settings.
 * @param ownerLifetime A lifetime from the owner of the protection.
 */
export type ProtectionFactoryMethod<
  Context = unknown,
  TConfigSchema extends TObject = UnknownConfig,
  TCapabilitySet extends CapabilitySet = CapabilitySet,
> = (
  description: ProtectionDescription<Context, TConfigSchema, TCapabilitySet>,
  lifetime: OwnLifetime<
    Protection<ProtectionDescription<Context, TConfigSchema, TCapabilitySet>>
  >,
  protectedRoomsSet: ProtectedRoomsSet,
  context: Context,
  capabilities: TCapabilitySet,
  settings: EDStatic<TConfigSchema>
) => Promise<
  ActionResult<
    Protection<ProtectionDescription<Context, TConfigSchema, TCapabilitySet>>
  >
>;

/**
 * This is a description of a protection, which is used
 * to create protections in a factory method dynamically.
 */
export interface ProtectionDescription<
  Context = unknown,
  TConfigSchema extends TObject = UnknownConfig,
  TCapabilitySet extends CapabilitySet = CapabilitySet,
> {
  readonly name: string;
  readonly description: string;
  readonly capabilities: CapabilityInterfaceSet<TCapabilitySet>;
  readonly factory: ProtectionFactoryMethod<
    Context,
    TConfigSchema,
    TCapabilitySet
  >;
  readonly protectionSettings: ConfigDescription<TConfigSchema>;
  readonly defaultCapabilities: CapabilityProviderSet<TCapabilitySet>;
}

/**
 * Represents a protection mechanism of sorts. Protections are intended to be
 * event-based (ie: X messages in a period of time, or posting X events).
 *
 * Protections are guaranteed to be run before redaction handlers.
 */
export type Protection<
  TProtectionDescription,
  TIntentProjection extends Projection | undefined = undefined,
> = {
  readonly description: TProtectionDescription;
  readonly requiredEventPermissions: string[];
  readonly requiredStatePermissions: string[];
  readonly requiredPermissions: PowerLevelPermission[];

  /*
   * Handle a single timeline event from a protected room, to decide if we need to
   * respond to it. This should not be used to detect changes to room state,
   * for that see @see {@link Protection['handleStateChange']}.
   */
  handleTimelineEvent?(
    room: MatrixRoomID,
    event: RoomEvent
  ): Promise<ActionResult<void>>;

  /**
   * Handle a single timeline event from a protected room.
   * Rather than providing protections with the raw event,
   * media mixins (including text) are extracted from the event
   * for protections. This prevents parsing errors that would
   * enable evasion of protections.
   */
  handleTimelineEventMixins?(room: MatrixRoomID, event: EventWithMixins): void;

  handlePolicyChange?(
    revision: PolicyListRevision,
    changes: PolicyRuleChange[]
  ): Promise<ActionResult<void>>;

  handleMembershipChange?(
    revision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): Promise<ActionResult<void>>;

  /**
   * Handle a change to the room state within a protected room.
   * @param revision A RoomStateRevision with the current revision of all the room's state.
   * @param changes Any changes since the previous revision.
   */
  handleStateChange?(
    revision: RoomStateRevision,
    changes: StateChange[]
  ): Promise<ActionResult<void>>;

  handleEventReport?(report: EventReport): Promise<ActionResult<void>>;

  /**
   * Called when the permission requirements of the protection have been met
   * within a protected room. This includes if the room is a newly protected room.
   */
  handlePermissionRequirementsMet?(room: MatrixRoomID): void;

  /**
   * Handle an invitation, room join, kick, leave etc to a room that is external to the protected rooms set.
   * @param roomID The room the invitation is for.
   * @param event The invitation event itself.
   */
  handleExternalMembership?(roomID: StringRoomID, event: MembershipEvent): void;

  /**
   * This can be used to determine who are new to the overall protected rooms
   * set, and who has left every protected room.
   */
  handleSetMembershipChange?(
    revision: SetMembershipRevision,
    delta: SetMembershipDelta
  ): void;

  /**
   * Handle a change to the set of members who have matched policies.
   * So if a user joins the room with a matching policy, this will result in
   * the handle being called. Or a policy being created that matches existing users.
   * Or a policy being rescinded that previously matched users.
   */
  handleSetMembershipPolicyMatchesChange?(
    revision: SetMembershipPolicyRevision,
    delta: MembershipPolicyRevisionDelta
  ): void;

  [Symbol.asyncDispose](): Promise<void>;
} & (TIntentProjection extends undefined
  ? { readonly intentProjection?: Projection }
  : {
      /**
       * Used to view the state that the protection intends to make effectual via
       * capabilities.
       */
      readonly intentProjection: TIntentProjection;
    }) &
  (TIntentProjection extends undefined
    ? {
        handleIntentProjectionNode?(
          node: AnyProjectionNode,
          delta: unknown
        ): void;
      }
    : {
        handleIntentProjectionNode?(
          node: ExtractProjectionNode<TIntentProjection>,
          delta: ExtractDeltaShape<ExtractProjectionNode<TIntentProjection>>
        ): void;
      });

export class AbstractProtection<
  TProtectionDescription,
> implements Protection<TProtectionDescription> {
  private readonly clientEventPermissions: string[];
  private readonly clientPermissions: PowerLevelPermission[];
  private readonly clientStatePermissions: string[];
  protected constructor(
    public readonly description: TProtectionDescription,
    protected readonly lifetime: OwnLifetime<
      Protection<TProtectionDescription>
    >,
    protected readonly capabilitySet: CapabilitySet,
    protected readonly protectedRoomsSet: ProtectedRoomsSet,
    permissions: {
      requiredEventPermissions?: string[];
      requiredPermissions?: PowerLevelPermission[];
      requiredStatePermissions?: string[];
    }
  ) {
    this.clientEventPermissions = permissions.requiredEventPermissions ?? [];
    this.clientPermissions = permissions.requiredPermissions ?? [];
    this.clientStatePermissions = permissions.requiredStatePermissions ?? [];
  }

  public get requiredEventPermissions(): string[] {
    return [
      ...this.clientEventPermissions,
      ...capabilitySetEventPermissions(this.capabilitySet),
    ];
  }

  public get requiredPermissions(): PowerLevelPermission[] {
    return [
      ...this.clientPermissions,
      ...capabilitySetPermissions(this.capabilitySet),
    ];
  }

  public get requiredStatePermissions(): string[] {
    return [
      ...this.clientStatePermissions,
      ...capabilitySetStatePermissions(this.capabilitySet),
    ];
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.lifetime[Symbol.asyncDispose]();
  }
}

const PROTECTIONS = new Map<string, ProtectionDescription>();

export function registerProtection<
  Context = unknown,
  TConfigSchema extends TObject = UnknownConfig,
  TCapabilitySet extends CapabilitySet = CapabilitySet,
>(
  description: ProtectionDescription<Context, TConfigSchema, TCapabilitySet>
): ProtectionDescription<Context, TConfigSchema, TCapabilitySet> {
  if (PROTECTIONS.has(description.name)) {
    throw new TypeError(
      `There is already a protection registered with the name ${description.name}`
    );
  }
  PROTECTIONS.set(
    description.name,
    description as unknown as ProtectionDescription
  );
  return description;
}

export function findProtection(
  name: string
): ProtectionDescription | undefined {
  return PROTECTIONS.get(name);
}

export function describeProtection<
  TCapabilitySet extends CapabilitySet = CapabilitySet,
  Context = unknown,
  TConfigSchema extends TObject = UnknownConfig,
>({
  name,
  description,
  capabilityInterfaces,
  defaultCapabilities,
  factory,
  configSchema,
}: {
  name: string;
  description: string;
  factory: ProtectionDescription<
    Context,
    TConfigSchema,
    TCapabilitySet
  >["factory"];
  capabilityInterfaces: GenericCapabilityDescription<TCapabilitySet>;
  defaultCapabilities: GenericCapabilityDescription<TCapabilitySet>;
  configSchema?: TConfigSchema;
}): ProtectionDescription<Context, TConfigSchema, TCapabilitySet> {
  const capabilityInterfaceSet =
    findCapabilityInterfaceSet(capabilityInterfaces);
  const defaultCapabilitySet = findCapabilityProviderSet(defaultCapabilities);
  const protectionDescription = {
    name,
    description,
    capabilities: capabilityInterfaceSet,
    defaultCapabilities: defaultCapabilitySet,
    factory,
    protectionSettings: new StandardConfigDescription(
      configSchema ?? Type.Object({})
    ),
  };
  registerProtection(protectionDescription as unknown as ProtectionDescription);
  return protectionDescription as unknown as ProtectionDescription<
    Context,
    TConfigSchema,
    TCapabilitySet
  >;
}

export function getAllProtections(): IterableIterator<ProtectionDescription> {
  return PROTECTIONS.values();
}

/**
 * Simple compatibility helper to help the migration to lifetimes.
 * @deprecated Use lifetimes directly.
 */
export function allocateProtection<T>(
  lifetime: AllocatableLifetime,
  protection: T & { handleProtectionDisable(): void }
): Result<T> {
  return lifetime.allocateResource(
    () => Ok(protection),
    (protection) => protection.handleProtectionDisable.bind(protection)
  );
}
