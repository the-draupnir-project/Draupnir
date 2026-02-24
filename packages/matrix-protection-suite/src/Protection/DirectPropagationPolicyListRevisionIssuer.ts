// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { EventEmitter } from "events";
import { PolicyListRevisionIssuer } from "../PolicyList/PolicyListRevisionIssuer";
import { PolicyListRevision } from "../PolicyList/PolicyListRevision";
import { StandardPolicyListRevision } from "../PolicyList/StandardPolicyListRevision";
import {
  PolicyRuleChange,
  PolicyRuleChangeType,
} from "../PolicyList/PolicyRuleChange";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";

export interface DirectPropagationPolicyListRevisionIssuer extends PolicyListRevisionIssuer {
  addIssuer(issuer: PolicyListRevisionIssuer): void;
  removeIssuer(issuer: PolicyListRevisionIssuer): void;
  unregisterListeners(): void;
  readonly references: MatrixRoomID[];
}

export type PolicyFilter = (change: PolicyRuleChange) => boolean;

export class StandardDirectPropagationPolicyListRevisionIssuer
  extends EventEmitter
  implements DirectPropagationPolicyListRevisionIssuer
{
  private revision = StandardPolicyListRevision.blankRevision();
  private revisionListener = this.handleRevision.bind(this);
  private readonly policyListRevisionIssuers =
    new Set<PolicyListRevisionIssuer>();
  public constructor(
    issuers: PolicyListRevisionIssuer[],
    private readonly filter?: PolicyFilter | undefined
  ) {
    super();
    this.addIssuers(issuers);
  }

  private filterChanges(changes: PolicyRuleChange[]): PolicyRuleChange[] {
    const filter = this.filter; // narrowing isn't working for some reason.
    return filter ? changes.filter((change) => filter(change)) : changes;
  }

  public handleRevision(
    _newRevision: PolicyListRevision,
    unfilteredChanges: PolicyRuleChange[]
  ) {
    const changes = this.filterChanges(unfilteredChanges);
    if (changes.length > 0) {
      const oldRevision = this.revision;
      this.revision = this.revision.reviseFromChanges(
        this.filterChanges(changes)
      );
      this.emit("revision", this.revision, changes, oldRevision);
    }
  }

  public get currentRevision() {
    return this.revision;
  }
  unregisterListeners(): void {
    for (const issuer of this.policyListRevisionIssuers) {
      issuer.off("revision", this.revisionListener);
    }
  }

  public get references(): MatrixRoomID[] {
    const references: MatrixRoomID[] = [];
    for (const issuer of this.policyListRevisionIssuers) {
      // i don't like this adhoc structural typing, but we don't really have a choice.
      if ("room" in issuer && issuer.room instanceof MatrixRoomID) {
        references.push(issuer.room);
      }
    }
    return references;
  }

  public previewIncorperationOfRevision(
    revision: PolicyListRevision
  ): PolicyRuleChange[] {
    const changes: PolicyRuleChange[] = [];
    for (const policy of revision.allRules()) {
      changes.push({
        changeType: PolicyRuleChangeType.Added,
        event: policy.sourceEvent,
        sender: policy.sourceEvent.sender,
        rule: policy,
      });
    }
    return changes;
  }

  public previewRemovalOfRevision(
    revision: PolicyListRevision
  ): PolicyRuleChange[] {
    const changes: PolicyRuleChange[] = [];
    for (const policy of revision.allRules()) {
      changes.push({
        changeType: PolicyRuleChangeType.Removed,
        event: policy.sourceEvent,
        sender: policy.sourceEvent.sender,
        rule: policy,
        previousRule: policy,
      });
    }
    return changes;
  }

  private addIssuers(issuers: PolicyListRevisionIssuer[]): void {
    let changes: PolicyRuleChange[] = [];
    for (const issuer of issuers) {
      this.policyListRevisionIssuers.add(issuer);
      issuer.on("revision", this.revisionListener);
      changes = changes.concat(
        this.previewIncorperationOfRevision(issuer.currentRevision)
      );
    }
    this.handleRevision(this.revision, changes);
  }

  public addIssuer(issuer: PolicyListRevisionIssuer): void {
    this.addIssuers([issuer]);
  }

  public removeIssuer(issuer: PolicyListRevisionIssuer): void {
    issuer.off("revision", this.revisionListener);
    this.policyListRevisionIssuers.delete(issuer);
    const changes = this.previewRemovalOfRevision(issuer.currentRevision);
    this.handleRevision(this.revision, changes);
  }
}
