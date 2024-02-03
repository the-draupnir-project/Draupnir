/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019-2021 The Matrix.org Foundation C.I.C.

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

import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { KeywordsDescription, ParsedKeywords, findPresentationType, parameters } from "./interface-manager/ParameterParsing";
import { ActionError, ActionResult, Ok, Protection, ProtectionDescription, ProtectionSetting, ProtectionSettings, RoomEvent, StringRoomID, UnknownSettings, findConsequenceProvider, findProtection, getAllProtections, isError } from "matrix-protection-suite";
import { DraupnirContext } from "./CommandHandler";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { Draupnir } from "../Draupnir";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { JSXFactory } from "./interface-manager/JSXFactory";
import { DocumentNode } from "./interface-manager/DeadDocument";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";

defineInterfaceCommand({
    designator: ["protections", "enable"],
    table: "mjolnir",
    parameters: parameters([
        {
            name: 'protection name',
            acceptor: findPresentationType('string'),
        }
    ],
    undefined,
    new KeywordsDescription({
        limit: {
            name: "consequence-provider",
            isFlag: false,
            acceptor: findPresentationType("string"),
            description: 'The name of a consequence provider to use for this protection.'
        },
    })),
    command: async function (this: DraupnirContext, keywords: ParsedKeywords, protectionName: string): Promise<ActionResult<void>> {
        const protectionDescription = findProtection(protectionName);
        if (protectionDescription === undefined) {
            return ActionError.Result(`Couldn't find a protection named ${protectionName}`);
        }
        const consequenceProviderName = keywords.getKeyword<string>("consequence-provider");
        const consequenceProviderDescription = consequenceProviderName !== undefined
        ? Ok(findConsequenceProvider(consequenceProviderName))
        : await this.draupnir.protectedRoomsSet.protections.getConsequenceProviderDescriptionForProtection(protectionDescription);
        if (isError(consequenceProviderDescription) || consequenceProviderDescription.ok === undefined) {
            return ActionError.Result(`Couldn't find a consequence provider named ${consequenceProviderName}`);
        }
        return await this.draupnir.protectedRoomsSet.protections.addProtection(
            protectionDescription,
            consequenceProviderDescription.ok,
            this.draupnir.protectedRoomsSet,
            this.draupnir
        )
    },
    summary: "Enable a named protection."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "protections", "enable"),
    renderer: tickCrossRenderer
});

defineInterfaceCommand({
    designator: ["protections", "disable"],
    table: "mjolnir",
    parameters: parameters([
        {
            name: 'protection name',
            acceptor: findPresentationType('string')
        }
    ]),
    command: async function (this: DraupnirContext, _keywords: ParsedKeywords, protectionName: string): Promise<ActionResult<unknown>> {
        const protectionDescription = findProtection(protectionName);
        if (protectionDescription === undefined) {
            return ActionError.Result(`Couldn't find a protection named ${protectionName}`);
        }
        if (!this.draupnir.protectedRoomsSet.protections.isEnabledProtection(protectionDescription)) {
            return ActionError.Result(`The protection named ${protectionDescription.name} is currently disabled`);
        }
        return await this.draupnir.protectedRoomsSet.protections.removeProtection(
            protectionDescription
        );
    },
    summary: "Disable a protection."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "protections", "disable"),
    renderer: tickCrossRenderer
});

const CommonProtectionSettingParameters = [{
    name: 'protection name',
    acceptor: findPresentationType('string'),
    description: 'The name of the protection to be modified.'
},
{
    name: 'setting name',
    acceptor: findPresentationType('string'),
    description: "The name of the setting within the protection config to modify."
}];

interface SettingChangeSummary<Key extends string = string, TSettings extends UnknownSettings<string> = UnknownSettings<string>> {
    readonly oldValue: unknown,
    readonly newValue: unknown,
    readonly description: ProtectionSetting<Key, TSettings>,
}

defineInterfaceCommand({
    designator: ["protections", "config", "set"],
    table: "mjolnir",
    parameters: parameters([...CommonProtectionSettingParameters, {
        name: 'new value',
        acceptor: findPresentationType('any'),
        description: 'The new value to give the protection setting'
    }]),
    command: async function (this: DraupnirContext, _keywords: ParsedKeywords, protectionName: string, settingName: string, value: unknown): Promise<ActionResult<SettingChangeSummary>> {
        const detailsResult = await findSettingDetailsForCommand(this.draupnir, protectionName, settingName);
        if (isError(detailsResult)) {
            return detailsResult;
        }
        const details = detailsResult.ok;
        const newSettings = details.protectionSettings.setValue(details.previousSettings, settingName, value);
        if (isError(newSettings)) {
            return newSettings;
        }
        return await changeSettingsForCommands(
            this.draupnir,
            details,
            settingName,
            newSettings.ok
        )
    },
    summary: "Set a new value for the protection setting, if the setting is a collection\
    then this will write over the entire collection."
})

defineInterfaceCommand({
    designator: ["protections", "config", "add"],
    table: "mjolnir",
    parameters: parameters([
        {
            name: 'item',
            acceptor: findPresentationType('any'),
            description: "An item to add to the collection setting."
        }
    ]),
    command: async function (this: DraupnirContext, _keywords: ParsedKeywords, protectionName: string, settingName: string, value: unknown): Promise<ActionResult<SettingChangeSummary>> {
        const detailsResult = await findSettingDetailsForCommand(this.draupnir, protectionName, settingName);
        if (isError(detailsResult)) {
            return detailsResult;
        }
        const details = detailsResult.ok;
        const settingDescription = details.settingDescription;
        if (!settingDescription.isCollectionSetting()) {
            return ActionError.Result(
                `${protectionName}'s setting ${settingName} is not a collection protection setting, and cannot be used with the add or remove commands.`
            )
        }
        const newSettings = settingDescription.addItem(details.previousSettings, value);
        if (isError(newSettings)) {
            return newSettings;
        }
        return await changeSettingsForCommands(
            this.draupnir,
            details,
            settingName,
            newSettings.ok
        );
    },
    summary: "Add an item to a collection protection setting."
})

defineInterfaceCommand({
    designator: ["protections", "config", "remove"],
    table: "mjolnir",
    parameters: parameters([
        {
            name: 'item',
            acceptor: findPresentationType('any'),
            description: "An item to remove from a collection setting."
        }
    ]),
    command: async function (this: DraupnirContext, _keywords: ParsedKeywords, protectionName: string, settingName: string, value: unknown): Promise<ActionResult<SettingChangeSummary>> {
        const detailsResult = await findSettingDetailsForCommand(this.draupnir, protectionName, settingName);
        if (isError(detailsResult)) {
            return detailsResult;
        }
        const details = detailsResult.ok;
        const settingDescription = details.settingDescription;
        if (!settingDescription.isCollectionSetting()) {
            return ActionError.Result(
                `${protectionName}'s setting ${settingName} is not a collection protection setting, and cannot be used with the add or remove commands.`
            )
        }
        const newSettings = settingDescription.removeItem(details.previousSettings, value);
        if (isError(newSettings)) {
            return newSettings;
        }
        return await changeSettingsForCommands(
            this.draupnir,
            details,
            settingName,
            newSettings.ok
        );
    },
    summary: "Remove an item from a collection protection setting."
})

function renderSettingChangeSummary(summary: SettingChangeSummary): DocumentNode {
    const oldJSON = summary.description.toJSON({ [summary.description.key]: summary.oldValue });
    const newJSON = summary.description.toJSON({ [summary.description.key]: summary.newValue });
    return <fragment>
        Setting {summary.description.key} changed from {oldJSON} to {newJSON}
    </fragment>
}


async function settingChangeSummaryRenderer(this: unknown, client: MatrixSendClient, commandRoomID: StringRoomID, event: RoomEvent, result: ActionResult<SettingChangeSummary>) {
    await tickCrossRenderer.call(this, client, commandRoomID, event, result);
    if (isError(result)) {
        return;
    } else {
        await renderMatrixAndSend(
            <root>{renderSettingChangeSummary(result.ok)}</root>,
            commandRoomID,
            event,
            client
        )
    }
}

for (const designator of ["add", "set", "remove"]) {
    defineMatrixInterfaceAdaptor({
        interfaceCommand: findTableCommand("mjolnir", "protections", "config", designator),
        renderer: settingChangeSummaryRenderer,
    })
}


function findProtectionDescriptionForCommand(protectionName: string): ActionResult<ProtectionDescription> {
    const protectionDescription = findProtection(protectionName);
    if (protectionDescription === undefined) {
        return ActionError.Result(
            `Couldn't find a protection named ${protectionName}`
        )
    }
    return Ok(protectionDescription);
}

function findSettingDescriptionForCommand(settings: ProtectionSettings, settingName: string): ActionResult<ProtectionSetting<string, UnknownSettings<string>>> {
    const setting = settings.descriptions[settingName];
    if (setting === undefined) {
        return ActionError.Result(`Unable to find a protection setting named ${settingName}`);
    }
    return Ok(setting);
}

interface SettingDetails<TSettings extends UnknownSettings<string> = UnknownSettings<string>> {
    readonly protectionDescription: ProtectionDescription<Draupnir, TSettings>,
    readonly protectionSettings: ProtectionSettings,
    readonly settingDescription: ProtectionSetting<string, TSettings>,
    readonly previousSettings: TSettings
}

async function findSettingDetailsForCommand(draupnir: Draupnir, protectionName: string, settingName: string): Promise<ActionResult<SettingDetails>> {
    const protectionDescription = findProtectionDescriptionForCommand(protectionName);
    if (isError(protectionDescription)) {
        return protectionDescription;
    }
    const settingsDescription = protectionDescription.ok.protectionSettings;
    const settingDescription = findSettingDescriptionForCommand(settingsDescription, settingName);
    if (isError(settingDescription)) {
        return settingDescription;
    }
    const previousSettings = await draupnir.protectedRoomsSet.protections.getProtectionSettings(
        protectionDescription.ok,
    );
    if (isError(previousSettings)) {
        return previousSettings;
    }
    return Ok({
        protectionDescription: protectionDescription.ok,
        protectionSettings: settingsDescription,
        settingDescription: settingDescription.ok,
        previousSettings: previousSettings.ok
    })
}

async function changeSettingsForCommands<TSettings extends UnknownSettings<string> = UnknownSettings<string>>(draupnir: Draupnir, details: SettingDetails<TSettings>, settingName: string, newSettings: TSettings): Promise<ActionResult<SettingChangeSummary>> {
    const changeResult = await draupnir.protectedRoomsSet.protections.changeProtectionSettings(
        details.protectionDescription,
        draupnir.protectedRoomsSet,
        draupnir,
        newSettings
    );
    if (isError(changeResult)) {
        return changeResult;
    }
    return Ok({
        description: details.settingDescription,
        oldValue: details.previousSettings[settingName],
        newValue: newSettings[settingName]
    });
}

interface ProtectionsSummary {
    readonly description: ProtectionDescription,
    readonly isEnabled: boolean,
    readonly protection?: Protection
}

defineInterfaceCommand({
    designator: ["protections"],
    table: "mjolnir",
    parameters: parameters([]),
    command: async function (this: DraupnirContext, keywords: ParsedKeywords, protectionName: string): Promise<ActionResult<ProtectionsSummary[]>> {
        const enabledProtections = this.draupnir.protectedRoomsSet.protections.allProtections;
        const summaries: ProtectionsSummary[] = [];
        for (const protectionDescription of getAllProtections()) {
            const enabledProtection = enabledProtections.find(p => p.description.name === protectionDescription.name);
            if (enabledProtection !== undefined) {
                summaries.push({
                    description: protectionDescription,
                    protection: enabledProtection,
                    isEnabled: true,
                })
            } else {
                summaries.push({
                    description: protectionDescription,
                    isEnabled: false
                })
            }
        }
        return Ok(summaries);
    },
    summary: "List all available protections."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "protections"),
    renderer: async function(client, commandRoomID, event, result: ActionResult<ProtectionsSummary[]>) {
        await tickCrossRenderer.call(this, client, commandRoomID, event, result);
        if (isError(result)) {
            return;
        } else {
            await renderMatrixAndSend(
                <root>{renderProtectionsSummary(result.ok)}</root>,
                commandRoomID,
                event,
                client
            );
        }
    }
})

function renderProtectionsSummary(protectionsSummary: ProtectionsSummary[]): DocumentNode {
    return <fragment>
        Available protections:
        <ul>
            {protectionsSummary.map(summary =>
                (<li>
                    {summary.isEnabled ? '🟢 (enabled)' : '🔴 (disabled)'}
                    <code>{summary.description.name}</code> - {summary.description.description}
                </li>)
            )}
        </ul>
    </fragment>
}
