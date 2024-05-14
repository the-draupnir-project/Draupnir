/**
 * Copyright (C) 2023-2024 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ActionError,ActionException,ActionExceptionKind,DRAUPNIR_SCHEMA_VERSION_KEY, MjolnirEnabledProtectionsEvent, MjolnirEnabledProtectionsEventType, Ok, SchemedDataManager, Value, findProtection } from "matrix-protection-suite";
import { RedactionSynchronisationProtection } from "./RedactionSynchronisation";
import { PolicyChangeNotification } from "./PolicyChangeNotification";
import { ProtectRoomsOnInviteProtection } from "./invitation/ProtectRoomsOnInviteProtection";

export const DefaultEnabledProtectionsMigration = new SchemedDataManager<MjolnirEnabledProtectionsEvent>([
    async function enableBanPropagationByDefault(input) {
        if (!Value.Check(MjolnirEnabledProtectionsEvent, input)) {
            return ActionError.Result(
                `The data for ${MjolnirEnabledProtectionsEventType} is corrupted.`
            );
        }
        const banPropagationProtection = findProtection('BanPropagationProtection');
        if (banPropagationProtection === undefined) {
            const message = `Cannot find the BanPropagationProtection`;
            return ActionException.Result(message, {
                exception: new TypeError(message),
                exceptionKind: ActionExceptionKind.Unknown,
            })
        }
        const enabled = new Set(input.enabled);
        enabled.add(banPropagationProtection.name);
        return Ok({
            enabled: [...enabled],
            [DRAUPNIR_SCHEMA_VERSION_KEY]: 1,
        });
    },
    async function enableMemberAndServerSynchronisationByDefault(input) {
        if (!Value.Check(MjolnirEnabledProtectionsEvent, input)) {
            return ActionError.Result(
                `The data for ${MjolnirEnabledProtectionsEventType} is corrupted.`
            );
        }
        const enabledProtections = new Set(input.enabled);
        // we go through the process of finding them just so we can be sure that we spell their names correctly.
        const memberBanSynchronisationProtection = findProtection('MemberBanSynchronisationProtection');
        const serverBanSynchronisationProtection = findProtection('ServerBanSynchronisationProtection');
        if (memberBanSynchronisationProtection === undefined || serverBanSynchronisationProtection === undefined) {
            const message = `Cannot find the member ban or server ban synchronisation protections`;
            return ActionException.Result(message, {
                exception: new TypeError(message),
                exceptionKind: ActionExceptionKind.Unknown
            });
        }
        for (const protection of [memberBanSynchronisationProtection, serverBanSynchronisationProtection]) {
            enabledProtections.add(protection.name);
        }
        return Ok({
            enabled: [...enabledProtections],
            [DRAUPNIR_SCHEMA_VERSION_KEY]: 2,
        });
    },
    async function enableRedactionSynchronisationProtectionByDefault(input) {
        if (!Value.Check(MjolnirEnabledProtectionsEvent, input)) {
            return ActionError.Result(
                `The data for ${MjolnirEnabledProtectionsEventType} is corrupted.`
            );
        }
        const enabledProtections = new Set(input.enabled);
        const protection = findProtection(RedactionSynchronisationProtection.name);
        if (protection === undefined) {
            const message = `Cannot find the ${RedactionSynchronisationProtection.name} protection`;
            return ActionException.Result(message, {
                exception: new TypeError(message),
                exceptionKind: ActionExceptionKind.Unknown
            });
        }
        enabledProtections.add(protection.name);
        return Ok({
            enabled: [...enabledProtections],
            [DRAUPNIR_SCHEMA_VERSION_KEY]: 3,
        });
    },
    async function enablePolicyChangeNotification(input) {
        if (!Value.Check(MjolnirEnabledProtectionsEvent, input)) {
            return ActionError.Result(
                `The data for ${MjolnirEnabledProtectionsEventType} is corrupted.`
            );
        }
        const enabledProtections = new Set(input.enabled);
        const protection = findProtection(PolicyChangeNotification.name);
        if (protection === undefined) {
            const message = `Cannot find the ${PolicyChangeNotification.name} protection`;
            return ActionException.Result(message, {
                exception: new TypeError(message),
                exceptionKind: ActionExceptionKind.Unknown
            });
        }
        enabledProtections.add(protection.name);
        return Ok({
            enabled: [...enabledProtections],
            [DRAUPNIR_SCHEMA_VERSION_KEY]: 4,
        });
    },
    async function enableProtectRoomsOnInviteProtection(input) {
        if (!Value.Check(MjolnirEnabledProtectionsEvent, input)) {
            return ActionError.Result(
                `The data for ${MjolnirEnabledProtectionsEventType} is corrupted.`
            );
        }
        const enabledProtections = new Set(input.enabled);
        const protection = findProtection(ProtectRoomsOnInviteProtection.name);
        if (protection === undefined) {
            const message = `Cannot find the ${ProtectRoomsOnInviteProtection.name} protection`;
            return ActionException.Result(message, {
                exception: new TypeError(message),
                exceptionKind: ActionExceptionKind.Unknown
            });
        }
        enabledProtections.add(protection.name);
        return Ok({
            enabled: [...enabledProtections],
            [DRAUPNIR_SCHEMA_VERSION_KEY]: 5,
        });
    }
]);
