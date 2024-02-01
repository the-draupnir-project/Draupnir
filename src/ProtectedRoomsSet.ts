/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019, 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 */

import { LogLevel, MatrixGlob, UserID } from "matrix-bot-sdk";
import { CommandExceptionKind } from "./commands/interface-manager/CommandException";
import { IConfig } from "./config";
import ManagementRoomOutput from "./ManagementRoomOutput";
import { MatrixSendClient } from "./MatrixEmitter";
import AccessControlUnit, { Access } from "./models/AccessControlUnit";
import { RULE_ROOM, RULE_SERVER, RULE_USER } from "./models/ListRule";
import PolicyList, { ListRuleChange, Revision } from "./models/PolicyList";
import { printActionResult, IRoomUpdateError, RoomUpdateException } from "./models/RoomUpdateError";
import { ProtectionManager } from "./protections/ProtectionManager";
import { EventRedactionQueue, RedactUserInRoom } from "./queues/EventRedactionQueue";
import { ProtectedRoomActivityTracker } from "./queues/ProtectedRoomActivityTracker";
import { htmlEscape } from "./utils";

/**
 * This class aims to synchronize `m.ban` rules in a set of policy lists with
 * a set of rooms by applying member bans and server ACL to them.
 *
 * It is important to understand that the use of `m.ban` in the lists that `ProtectedRooms` watch
 * are interpreted to be the final decision about whether to ban a user and are a synchronization tool.
 * This is different to watching a community curated list to be informed about reputation information and then making
 * some sort of decision and is not the purpose of this class (as of writing, Mjolnir does not have a way to do this, we want it to).
 * The outcome of that decision process (which should take place in other components)
 * will likely be whether or not to create an `m.ban` rule in a list watched by
 * your protected rooms.
 *
 * It is also important not to tie this to the one group of rooms that a mjolnir may watch
 * as in future we might want to borrow this class to represent a space https://github.com/matrix-org/mjolnir/issues/283.
 */
export class ProtectedRoomsSet {

    private protectedRooms = new Set</* room id */string>();

    /**
     * These are the `m.bans` we want to synchronize across this set of rooms.
     */
    private policyLists: PolicyList[] = [];

    /**
     * Tracks the rooms so that the most recently active rooms can be synchronized first.
     */
    private protectedRoomActivityTracker: ProtectedRoomActivityTracker;

    /**
     * This is a queue for redactions to process after mjolnir
     * has finished applying ACL and bans when syncing.
     */
    private readonly eventRedactionQueue = new EventRedactionQueue();

    /**
     * These are globs sourced from `config.automaticallyRedactForReasons` that are matched against the reason of an
     * `m.ban` recommendation against a user.
     * If a rule matches a user in a room, and a glob from here matches that rule's reason, then we will redact
     * all of the messages from that user.
     */
    private automaticRedactionReasons: MatrixGlob[] = [];

    /**
     * Used to provide mutual exclusion when synchronizing rooms with the state of a policy list.
     * This is because requests operating with rules from an older version of the list that are slow
     * could race & give the room an inconsistent state. An example is if we add multiple m.policy.rule.server rules,
     * which would cause several requests to a room to send a new m.room.server_acl event.
     * These requests could finish in any order, which has left rooms with an inconsistent server_acl event
     * until Mjolnir synchronises the room with its policy lists again, which can be in the region of hours.
     */
    private aclChain: Promise<void> = Promise.resolve();

    /**
     * A utility to test the access that users have in the set of protected rooms according to the policies of the watched lists.
     */
    private readonly accessControlUnit = new AccessControlUnit([]);

    /**
     * Intended to be `this.syncWithUpdatedPolicyList` so we can add it in `this.watchList` and remove it in `this.unwatchList`.
     * Otherwise we would risk being informed about lists we no longer watch.
     */
    private readonly listUpdateListener: (list: PolicyList, changes: ListRuleChange[], revision: Revision) => void;

    /**
     * The revision of a each watched list that we have applied to protected rooms.
     */
    private readonly listRevisions = new Map<PolicyList, /** The last revision we used to sync protected rooms. */ Revision>();

    constructor(
        private readonly client: MatrixSendClient,
        private readonly clientUserId: string,
        private readonly managementRoomId: string,
        private readonly managementRoomOutput: ManagementRoomOutput,
        /**
         * The protection manager is only used to verify the permissions
         * that the protection manager requires are correct for this set of rooms.
         * The protection manager is not really compatible with this abstraction yet
         * because of a direct dependency on the protection manager in Mjolnir commands.
         */
        private readonly protectionManager: ProtectionManager,
        private readonly config: IConfig,
    ) {
        for (const reason of this.config.automaticallyRedactForReasons) {
            this.automaticRedactionReasons.push(new MatrixGlob(reason.toLowerCase()));
        }

        // Setup room activity watcher
        this.protectedRoomActivityTracker = new ProtectedRoomActivityTracker();
        this.listUpdateListener = this.syncWithUpdatedPolicyList.bind(this);
    }

    /**
     * Queue a user's messages in a room for redaction once we have stopped synchronizing bans
     * over the protected rooms.
     *
     * @param userId The user whose messages we want to redact.
     * @param roomId The room we want to redact them in.
     */
    public redactUser(userId: string, roomId: string) {
        this.eventRedactionQueue.add(new RedactUserInRoom(userId, roomId));
    }

    /**
     * These are globs sourced from `config.automaticallyRedactForReasons` that are matched against the reason of an
     * `m.ban` recommendation against a user.
     * If a rule matches a user in a room, and a glob from here matches that rule's reason, then we will redact
     * all of the messages from that user.
     */
    public get automaticRedactGlobs(): Readonly<MatrixGlob[]> {
        return this.automaticRedactionReasons;
    }

    public getProtectedRooms () {
        return [...this.protectedRooms.keys()]
    }

    public isProtectedRoom(roomId: string): boolean {
        return this.protectedRooms.has(roomId);
    }

    public watchList(policyList: PolicyList): void {
        if (!this.policyLists.includes(policyList)) {
            this.policyLists.push(policyList);
            this.accessControlUnit.watchList(policyList);
            policyList.on('PolicyList.update', this.listUpdateListener);
        }
    }

    public unwatchList(policyList: PolicyList): void {
        this.policyLists = this.policyLists.filter(list => list.roomId !== policyList.roomId);
        this.accessControlUnit.unwatchList(policyList);
        policyList.off('PolicyList.update', this.listUpdateListener)
    }

    /**
     * Process all queued redactions, this is usually called at the end of the sync process,
     * after all users have been banned and ACLs applied.
     * If a redaction cannot be processed, the redaction is skipped and removed from the queue.
     * We then carry on processing the next redactions.
     * @param roomId Limit processing to one room only, otherwise process redactions for all rooms.
     * @returns The list of errors encountered, for reporting to the management room.
     */
    public async processRedactionQueue(roomId?: string): Promise<IRoomUpdateError[]> {
        return await this.eventRedactionQueue.process(this.client, this.managementRoomOutput, roomId);
    }

    /**
     * @returns The protected rooms ordered by the most recently active first.
     */
    public protectedRoomsByActivity(): string[] {
        return this.protectedRoomActivityTracker.protectedRoomsByActivity();
    }

    public async handleEvent(roomId: string, event: any) {
        if (event['sender'] === this.clientUserId) {
            throw new TypeError("`ProtectedRooms::handleEvent` should not be used to inform about events sent by mjolnir.");
        }
        if (!this.protectedRooms.has(roomId)) {
            return; // We're not protecting this room.
        }
        this.protectedRoomActivityTracker.handleEvent(roomId, event);
        if (event['type'] === 'm.room.power_levels' && event['state_key'] === '') {
            await this.managementRoomOutput.logMessage(LogLevel.DEBUG, "Mjolnir", `Power levels changed in ${roomId} - checking permissions...`, roomId);
            const errors = await this.protectionManager.verifyPermissionsIn(roomId);
            await this.printActionResult(errors, { title: "There were errors verifying permissions.", noErrorsText: "All permissions look OK."});
            return;
        } else if (event['type'] === "m.room.member") {
            // The reason we have to apply bans on each member change is because
            // we cannot eagerly ban users (that is to ban them when they have never been a member)
            // as they can be force joined to a room they might not have known existed.
            // Only apply bans and then redactions in the room we are currently looking at.
            const errors = [
                await this.applyUserBans([roomId]),
                await this.processRedactionQueue(roomId),
            ].flat();
            if (errors.length > 0) {
                await this.printActionResult(errors, { title: 'There were errors updating member bans.' });
            }
        }
    }

    /**
     * Synchronize all the protected rooms with all of the policies described in the watched policy lists.
     */
    private async syncRoomsWithPolicies() {
        const syncErrors = (
            await Promise.all([
                this.applyServerAcls(this.policyLists, this.protectedRoomsByActivity()),
                this.applyUserBans(this.protectedRoomsByActivity()),
            ])
        ).flat();
        // The redaction queue has to be processed after both serverACLS and applyUserBans has been processed,
        // otherwise you risk adding users to the queue after this call to process them.
        const redactionErrors = await this.processRedactionQueue();
        await this.printActionResult(
            [...syncErrors, ...redactionErrors],
            { title: "There were errors synchronising the protected rooms." }
        );
    }

    /**
     * Update each watched list and then synchronize all the protected rooms with all the policies described in the watched lists,
     * banning and applying any changed ACLS via `syncRoomsWithPolicies`.
     */
    public async syncLists() {
        for (const list of this.policyLists) {
            const { revision } = await list.updateList();
            const previousRevision = this.listRevisions.get(list);
            if (previousRevision === undefined || revision.supersedes(previousRevision)) {
                this.listRevisions.set(list, revision);
                // we rely on `this.listUpdateListener` to print the changes to the list.
            }
        }
        await this.syncRoomsWithPolicies();
    }

    public addProtectedRoom(roomId: string): void {
        if (this.protectedRooms.has(roomId)) {
            // we need to protect ourselves form syncing all the lists unnecessarily
            // as Mjolnir does call this method repeatedly.
            return;
        }
        this.protectedRooms.add(roomId);
        this.protectedRoomActivityTracker.addProtectedRoom(roomId);
    }

    public removeProtectedRoom(roomId: string): void {
        this.protectedRoomActivityTracker.removeProtectedRoom(roomId);
        this.protectedRooms.delete(roomId);
    }

    /**
     * Updates all protected rooms with those any changes that have been made to a policy list.
     * Does not fail if there are errors updating the room, these are reported to the management room.
     * Do not use directly as a listener, use `this.listUpdateListener`.
     * @param policyList The `PolicyList` which we will check for changes and apply them to all protected rooms.
     * @returns When all of the protected rooms have been updated.
     */
    private async syncWithUpdatedPolicyList(policyList: PolicyList, changes: ListRuleChange[], revision: Revision): Promise<void> {
        // avoid resyncing the rooms if we have already done so for the latest revision of this list.
        const previousRevision = this.listRevisions.get(policyList);
        if (previousRevision === undefined || revision.supersedes(previousRevision)) {
            this.listRevisions.set(policyList, revision);
            await this.syncRoomsWithPolicies();
        }
        // This can fail if the change is very large and it is much less important than applying bans, so do it last.
        // We always print changes because we make this listener responsible for doing it.
        await this.printBanlistChanges(changes, policyList);
    }

    /**
     * Applies the server ACLs represented by the ban lists to the provided rooms, returning the
     * room IDs that could not be updated and their error.
     * Does not update the banLists before taking their rules to build the server ACL.
     * @param {PolicyList[]} lists The lists to construct ACLs from.
     * @param {string[]} roomIds The room IDs to apply the ACLs in.
     * @param {Mjolnir} mjolnir The Mjolnir client to apply the ACLs with.
     */
    private async applyServerAcls(lists: PolicyList[], roomIds: string[]): Promise<IRoomUpdateError[]> {
        // we need to provide mutual exclusion so that we do not have requests updating the m.room.server_acl event
        // finish out of order and therefore leave the room out of sync with the policy lists.
        if (this.config.disableServerACL) {
            return [];
        }
        return new Promise((resolve, reject) => {
            this.aclChain = this.aclChain
                .then(() => this._applyServerAcls(lists, roomIds))
                .then(resolve, reject);
        });
    }

    private async _applyServerAcls(lists: PolicyList[], roomIds: string[]): Promise<IRoomUpdateError[]> {
        const serverName: string = new UserID(await this.client.getUserId()).domain;

        // Construct a server ACL first
        const acl = this.accessControlUnit.compileServerAcl(serverName);
        const finalAcl = acl.safeAclContent();

        if (this.config.verboseLogging) {
            // We specifically use sendNotice to avoid having to escape HTML
            await this.client.sendNotice(this.managementRoomId, `Constructed server ACL:\n${JSON.stringify(finalAcl, null, 2)}`);
        }

        const errors: IRoomUpdateError[] = [];
        for (const roomId of roomIds) {
            try {
                await this.managementRoomOutput.logMessage(LogLevel.DEBUG, "ApplyAcl", `Checking ACLs for ${roomId}`, roomId);

                try {
                    const currentAcl = await this.client.getRoomStateEvent(roomId, "m.room.server_acl", "");
                    if (acl.matches(currentAcl)) {
                        await this.managementRoomOutput.logMessage(LogLevel.DEBUG, "ApplyAcl", `Skipping ACLs for ${roomId} because they are already the right ones`, roomId);
                        continue;
                    }
                } catch (e) {
                    // ignore - assume no ACL
                }

                // We specifically use sendNotice to avoid having to escape HTML
                await this.managementRoomOutput.logMessage(LogLevel.DEBUG, "ApplyAcl", `Applying ACL in ${roomId}`, roomId);

                if (!this.config.noop) {
                    await this.client.sendStateEvent(roomId, "m.room.server_acl", "", finalAcl);
                } else {
                    await this.managementRoomOutput.logMessage(LogLevel.WARN, "ApplyAcl", `Tried to apply ACL in ${roomId} but Mjolnir is running in no-op mode`, roomId);
                }
            } catch (e) {
                const message = e.message || (e.body ? e.body.error : '<no message>');
                const kind = message && message.includes("You don't have permission to post that to the room") ? CommandExceptionKind.Known : CommandExceptionKind.Unknown;
                errors.push(new RoomUpdateException(roomId, kind, e, message))
            }
        }
        return errors;
    }

    /**
    * Applies the member bans represented by the ban lists to the provided rooms, returning the
     * room IDs that could not be updated and their error.
     * @param {string[]} roomIds The room IDs to apply the bans in.
     * @param {Mjolnir} mjolnir The Mjolnir client to apply the bans with.
     */
    private async applyUserBans(roomIds: string[]): Promise<IRoomUpdateError[]> {
        // We can only ban people who are not already banned, and who match the rules.
        const errors: IRoomUpdateError[] = [];

        const addErrorToReport = (roomId: string, e: any) => {
            const message = e.message || (e.body ? e.body.error : '<no message>');
            errors.push(new RoomUpdateException(
                roomId,
                message && message.includes("You don't have permission to ban") ? CommandExceptionKind.Known : CommandExceptionKind.Unknown,
                e,
                message
            ));
        };

        for (const roomId of roomIds) {
            try {
                // We specifically use sendNotice to avoid having to escape HTML
                await this.managementRoomOutput.logMessage(LogLevel.DEBUG, "ApplyBan", `Updating member bans in ${roomId}`, roomId);

                let members: { userId: string, membership: string }[];

                if (this.config.fasterMembershipChecks) {
                    const memberIds = await this.client.getJoinedRoomMembers(roomId);
                    members = memberIds.map(u => {
                        return { userId: u, membership: "join" };
                    });
                } else {
                    const state = await this.client.getRoomState(roomId);
                    members = state.filter(s => s['type'] === 'm.room.member' && !!s['state_key']).map(s => {
                        return { userId: s['state_key'], membership: s['content'] ? s['content']['membership'] : 'leave' };
                    });
                }

                for (const member of members) {
                    if (member.membership === 'ban') {
                        continue; // user already banned
                    }

                    // We don't want to ban people based on server ACL as this would flood the room with bans.
                    const memberAccess = this.accessControlUnit.getAccessForUser(member.userId, "IGNORE_SERVER");
                    if (memberAccess.outcome === Access.Banned) {
                        const reason = memberAccess.rule ? memberAccess.rule.reason : '<no reason supplied>';
                        // We specifically use sendNotice to avoid having to escape HTML
                        await this.managementRoomOutput.logMessage(LogLevel.INFO, "ApplyBan", `Banning ${member.userId} in ${roomId} for: ${reason}`, roomId);

                        if (!this.config.noop) {
                            try {
                                await this.client.banUser(member.userId, roomId, memberAccess.rule!.reason);
                                if (this.automaticRedactGlobs.find(g => g.test(reason.toLowerCase()))) {
                                    this.redactUser(member.userId, roomId);
                                }
                            } catch (e) {
                                addErrorToReport(roomId, e);
                            }
                        } else {
                            await this.managementRoomOutput.logMessage(LogLevel.WARN, "ApplyBan", `Tried to ban ${member.userId} in ${roomId} but Mjolnir is running in no-op mode`, roomId);
                        }
                    }
                }
            } catch (e) {
                addErrorToReport(roomId, e)
            }
        }

        return errors;
    }

    /**
     * Print the changes to a banlist to the management room.
     * @param changes A list of changes that have been made to a particular ban list.
     * @returns true if the message was sent, false if it wasn't (because there there were no changes to report).
     */
    private async printBanlistChanges(changes: ListRuleChange[], list: PolicyList): Promise<boolean> {
        if (changes.length <= 0) return false;

        let html = "";
        let text = "";

        const changesInfo = `updated with ${changes.length} ` + (changes.length === 1 ? 'change:' : 'changes:');
        const shortcodeInfo = list.listShortcode ? ` (shortcode: ${htmlEscape(list.listShortcode)})` : '';

        html += `<a href="${htmlEscape(list.roomRef)}">${htmlEscape(list.roomId)}</a>${shortcodeInfo} ${changesInfo}<br/><ul>`;
        text += `${list.roomRef}${shortcodeInfo} ${changesInfo}:\n`;

        for (const change of changes) {
            const rule = change.rule;
            let ruleKind: string = rule.kind;
            if (ruleKind === RULE_USER) {
                ruleKind = 'user';
            } else if (ruleKind === RULE_SERVER) {
                ruleKind = 'server';
            } else if (ruleKind === RULE_ROOM) {
                ruleKind = 'room';
            }
            html += `<li><a href="https://matrix.to/#/${htmlEscape(change.sender)}">${htmlEscape(change.sender)}</a> ${change.changeType} ${htmlEscape(ruleKind)} (<code>${htmlEscape(rule.recommendation ?? "")}</code>): <code>${htmlEscape(rule.entity)}</code> (${htmlEscape(rule.reason)})</li>`;
            text += `* ${change.sender} ${change.changeType} ${ruleKind} (${rule.recommendation}): ${rule.entity} (${rule.reason})\n`;
        }

        const message = {
            msgtype: "m.notice",
            body: text,
            format: "org.matrix.custom.html",
            formatted_body: html,
        };
        await this.client.sendMessage(this.managementRoomId, message);
        return true;
    }

    private async printActionResult(
        errors: IRoomUpdateError[],
        renderOptions: { title?: string, noErrorsText?: string }
    ): Promise<void> {
        await printActionResult(this.client, this.managementRoomId, errors, renderOptions);
    }

    public async unbanUser(user: string): Promise<IRoomUpdateError[]> {
        const errors: IRoomUpdateError[] = [];
        for (const room of this.protectedRoomActivityTracker.protectedRoomsByActivity()) {
            try {
                await this.client.unbanUser(user, room);
            } catch (e) {
                const message = e.message || (e.body ? e.body.error : '<no message>');
                errors.push(new RoomUpdateException(
                    room,
                    message && message.includes("You don't have permission to ban") ? CommandExceptionKind.Known : CommandExceptionKind.Unknown,
                    e,
                    message
                ));
            }
        }
        return errors;
    }

    public requiredProtectionPermissions() {
        throw new TypeError("Unimplemented, need to put protections into here too.")
    }

    public async verifyPermissions() {
        const errors: IRoomUpdateError[] = [];
        for (const roomId of this.protectedRooms) {
            errors.push(...(await this.protectionManager.verifyPermissionsIn(roomId)));
        }
        await this.printActionResult(errors, {
            title: "There are permission errors in protected rooms.",
            noErrorsText: "All permissions look OK."
        });
    }
}
